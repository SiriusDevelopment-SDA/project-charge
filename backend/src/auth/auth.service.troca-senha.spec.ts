import { BadRequestException } from '@nestjs/common';
import { hash } from 'bcryptjs';
import { AuthService, SENHA_INICIAL_AGENTE } from './auth.service';

/**
 * Troca da senha inicial pelo `PATCH /auth/me`.
 *
 * POR QUE ESTA SPEC EXISTE: os dois defeitos abaixo passaram pelos testes de
 * unidade e so apareceram usando o produto, porque nenhum deles esta na troca em
 * si — os dois estao no PASSO SEGUINTE.
 *
 *  1. O token nao era reemitido. O `JwtAuthGuard` le a marca de senha inicial do
 *     TOKEN, nao do banco, entao trocar a senha deixava o token em maos ainda
 *     marcado: a primeira chamada depois da troca voltava 403 pedindo para
 *     trocar a senha DE NOVO, logo depois de a pessoa ter trocado.
 *  2. A primeira correcao reassinou o payload decodificado inteiro, com `iat` e
 *     `exp` — e o jsonwebtoken recusa ("the payload already has an exp
 *     property"). A troca inteira passou a falhar com 500.
 *
 * Por isso os testes daqui olham o TOKEN emitido, e nao so o 200.
 */
describe('AuthService — troca da senha inicial', () => {
  const EMPRESA = 'comp-1';

  /**
   * `verifyAsync` devolve o payload como o JWT real: COM `iat` e `exp`. Sem
   * esses dois campos o teste nao pegaria o 500 da reassinatura — era
   * exatamente essa a diferenca entre o dublê e a producao.
   */
  const criarService = (agente: any, payloadExtra: Record<string, unknown> = {}) => {
    const payload = {
      sub: EMPRESA,
      account: '4',
      name: 'FIBRAS DO RIO',
      agentId: agente.id,
      agentEmail: agente.email,
      agentRole: agente.role,
      agentActive: true,
      mustChangePassword: agente.mustChangePassword,
      iat: 1_700_000_000,
      exp: 1_700_086_400,
      ...payloadExtra,
    };

    const assinados: any[] = [];

    const jwtService = {
      verifyAsync: jest.fn(async () => payload),
      signAsync: jest.fn(async (p: any) => {
        // Imita a recusa real do jsonwebtoken.
        if (p.exp !== undefined) {
          throw new Error(
            'Bad "options.expiresIn" option the payload already has an "exp" property.',
          );
        }
        assinados.push(p);
        return `jwt-novo-${assinados.length}`;
      }),
    };

    const service = new AuthService(
      { findOne: jest.fn(async () => ({ id: EMPRESA })) } as any,
      {
        findOne: jest.fn(async () => agente),
        save: jest.fn(async (a: any) => a),
      } as any,
      {} as any,
      {} as any,
      jwtService as any,
      {} as any,
      { get: jest.fn(() => '') } as any,
      {} as any,
    );

    return { service, assinados, jwtService };
  };

  const agenteComSenhaInicial = async () => ({
    id: 'a1',
    name: 'Novo',
    email: 'novo@empresa.test',
    role: 'operator',
    active: true,
    mustChangePassword: true,
    passwordHash: await hash(SENHA_INICIAL_AGENTE, 10),
    company: { id: EMPRESA },
  });

  it('reemite o token, sem a marca, ao limpar a senha inicial', async () => {
    const agente = await agenteComSenhaInicial();
    const { service, assinados } = criarService(agente);

    const r: any = await service.updateProfile('Bearer jwt-velho', {
      newPassword: 'SenhaDela#2026',
    } as any);

    expect(r.accessToken).toBe('jwt-novo-1');
    expect(r.agent.mustChangePassword).toBe(false);

    // O token novo NAO pode carregar a marca — e ela que o guard le.
    expect(assinados[0].mustChangePassword).toBe(false);
    // E nao pode levar `iat`/`exp` do token antigo: era o 500.
    expect(assinados[0]).not.toHaveProperty('exp');
    expect(assinados[0]).not.toHaveProperty('iat');
    // O resto da identidade continua igual, senao o token novo seria de outra
    // sessao.
    expect(assinados[0].agentId).toBe('a1');
    expect(assinados[0].sub).toBe(EMPRESA);
  });

  it('nao pede a senha atual de quem esta com a senha inicial', async () => {
    const agente = await agenteComSenhaInicial();
    const { service } = criarService(agente);

    // Quem entrou pelo embed nunca digitou senha: nao tem o que informar.
    await expect(
      service.updateProfile('Bearer jwt-velho', {
        newPassword: 'SenhaDela#2026',
      } as any),
    ).resolves.toMatchObject({ success: true });

    expect(agente.mustChangePassword).toBe(false);
  });

  it('recusa repetir a propria senha inicial como nova senha', async () => {
    const agente = await agenteComSenhaInicial();
    const { service } = criarService(agente);

    await expect(
      service.updateProfile('Bearer jwt-velho', {
        newPassword: SENHA_INICIAL_AGENTE,
      } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('agente comum SEGUE precisando da senha atual', async () => {
    // A exigencia saiu do DTO e foi para o service. Se sumir, qualquer sessao
    // roubada troca a senha sem conhecer a atual — este teste e a rede.
    const agente = {
      id: 'a2',
      name: 'Antigo',
      email: 'antigo@empresa.test',
      role: 'operator',
      active: true,
      mustChangePassword: false,
      passwordHash: await hash('SenhaDeVerdade#1', 10),
      company: { id: EMPRESA },
    };
    const { service } = criarService(agente);

    await expect(
      service.updateProfile('Bearer jwt', { newPassword: 'Outra#2026' } as any),
    ).rejects.toThrow('Informe a senha atual para alterar a senha.');
  });

  it('nao reemite token quando a troca nao envolveu a senha inicial', async () => {
    const agente = {
      id: 'a3',
      name: 'Antigo',
      email: 'antigo@empresa.test',
      role: 'operator',
      active: true,
      mustChangePassword: false,
      passwordHash: await hash('SenhaDeVerdade#1', 10),
      company: { id: EMPRESA },
    };
    const { service, assinados } = criarService(agente);

    const r: any = await service.updateProfile('Bearer jwt', {
      currentPassword: 'SenhaDeVerdade#1',
      newPassword: 'Outra#2026',
    } as any);

    // Reemitir a toa renovaria a validade do token sem ninguem pedir.
    expect(r.accessToken).toBeUndefined();
    expect(assinados).toHaveLength(0);
  });
});
