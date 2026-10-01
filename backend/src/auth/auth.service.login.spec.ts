import { hash } from 'bcryptjs';
import { AuthService } from './auth.service';

/**
 * Login por e-mail e senha — a porta que ficava aberta.
 *
 * O embed recusava agente comum de empresa inativa e o `switchActiveCompany`
 * tambem, mas o `loginAgent` entregava um JWT valido sem checar
 * `company.active`. Quem continha o agente era o `BlockedRoute`, no NAVEGADOR:
 * defesa de cliente, com a API respondendo normalmente a quem chamasse direto.
 * Medido em 09/09/2026 contra o backend local — `operator` de empresa inativa
 * recebeu HTTP 201 com `company.active=false`.
 *
 * Estes testes travam as duas metades da regra: agente comum barrado,
 * super_admin passando.
 */
describe('AuthService — login por e-mail e senha', () => {
  const SENHA = 'SenhaDeTeste#2026';

  const ATIVA = {
    id: 'comp-ativa',
    name: 'FIBRAS DO RIO',
    account_chatwoot: '4',
    active: true,
    config: {},
  };
  const INATIVA = {
    id: 'comp-inativa',
    name: 'POWERNET',
    account_chatwoot: '19',
    active: false,
    config: {},
  };

  const criarService = (agente: any, empresas: any[] = [ATIVA, INATIVA]) => {
    const agentRepository = {
      findOne: jest.fn(async ({ where }: any) =>
        where.email === agente.email ? agente : null,
      ),
      save: jest.fn(async (a: any) => a),
    };

    const companyRepository = {
      findOne: jest.fn(async ({ where }: any) =>
        empresas.find(
          (e) => String(e.account_chatwoot) === String(where.account_chatwoot),
        ) ?? null,
      ),
    };

    const companiesService = {
      // Espelha o real: so devolve empresa ATIVA. Uma default inativa nao
      // resgata ninguem, e e por isso que a checagem abaixo tem de existir.
      findActiveByChatwootAccount: jest.fn(async (account: string) =>
        empresas.find(
          (e) => String(e.account_chatwoot) === String(account) && e.active,
        ) ?? null,
      ),
    };

    return new AuthService(
      companyRepository as any,
      agentRepository as any,
      {} as any,
      {} as any,
      { signAsync: jest.fn(async () => 'jwt-sintetico') } as any,
      {} as any,
      { get: jest.fn(() => '') } as any,
      companiesService as any,
    );
  };

  const agente = async (role: string, company: any) => ({
    id: `agente-${role}`,
    email: `${role}@empresa.test`,
    name: role,
    passwordHash: await hash(SENHA, 10),
    role,
    active: true,
    company,
  });

  it('recusa agente comum quando a empresa esta inativa', async () => {
    const service = criarService(await agente('operator', INATIVA));

    await expect(
      service.loginAgent({
        email: 'operator@empresa.test',
        password: SENHA,
      } as any),
    ).rejects.toThrow('A empresa POWERNET esta inativa no Coraxy.');
  });

  it('deixa o agente comum entrar quando a empresa esta ativa', async () => {
    const service = criarService(await agente('operator', ATIVA));

    const r = await service.loginAgent({
      email: 'operator@empresa.test',
      password: SENHA,
    } as any);

    expect(r.company.name).toBe('FIBRAS DO RIO');
    expect(r.agent?.role).toBe('operator');
  });

  it('super_admin entra mesmo com a propria empresa inativa', async () => {
    // Sem empresa default disponivel, ele cai na propria — que esta inativa.
    // E exatamente o caso que a excecao do super_admin protege: barra-lo aqui o
    // deixaria de fora do lugar onde o problema esta.
    const service = criarService(await agente('super_admin', INATIVA), [
      INATIVA,
    ]);

    const r = await service.loginAgent({
      email: 'super_admin@empresa.test',
      password: SENHA,
    } as any);

    expect(r.company.name).toBe('POWERNET');
    expect(r.company.active).toBe(false);
  });

  it('senha errada continua sendo credencial invalida, nao empresa inativa', async () => {
    const service = criarService(await agente('operator', INATIVA));

    // A ordem importa: revelar "empresa inativa" antes de conferir a senha
    // contaria a quem nao provou identidade qual e o estado da empresa.
    await expect(
      service.loginAgent({
        email: 'operator@empresa.test',
        password: 'senha-errada',
      } as any),
    ).rejects.toThrow('Credenciais invalidas');
  });
});
