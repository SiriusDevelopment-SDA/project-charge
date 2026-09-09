import { NotFoundException } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { PAGINAS_IDS } from './planos';

/**
 * Leitura de permissoes de pagina para a tela do super_admin.
 *
 * O que estes testes protegem, e que nao e obvio olhando so a assinatura:
 *
 *  - a rota NAO pode vazar credencial. Ela le `config`, que e onde moram
 *    `rest_key`, `login` e `password` do ERP — o `listAll` tem um comentario
 *    explicito mandando nunca devolver token, e esta rota nasceu justamente
 *    para contornar aquela omissao. Se um dia alguem devolver o `config` cru
 *    aqui, o teste de vazamento quebra.
 *  - `plano: null` distingue empresa LEGADA de empresa sem paginas. As duas
 *    coisas parecem iguais na resposta se ninguem separar, e a consequencia e
 *    diferente: escolher um plano para uma legada e MIGRACAO, e pode tirar
 *    acesso que hoje esta liberado por ausencia de flag.
 */
describe('CompaniesService — permissoes de pagina', () => {
  const criarService = (empresa: any) => {
    const companyRepository = {
      findOne: jest.fn(async ({ where }: any) =>
        empresa && empresa.id === where.id ? empresa : null,
      ),
    };

    return new CompaniesService(companyRepository as any, {} as any);
  };

  const empresaBase = {
    id: 'comp-1',
    name: 'TOPLINK',
    account_chatwoot: '13',
    active: true,
    config: {},
  };

  it('devolve plano, extras e as permissoes resolvidas', async () => {
    const service = criarService({
      ...empresaBase,
      config: { plano: 'disparo', paginasExtras: ['clientesVencidos'] },
    });

    const r: any = await service.permissoesDaEmpresa('comp-1');

    expect(r.plano).toBe('disparo');
    expect(r.paginasExtras).toEqual(['clientesVencidos']);
    // Plano disparo + o extra vendido avulso — e o caso real de TOPLINK/UPLINK.
    expect(r.permissoes.disparoManual).toBe(true);
    expect(r.permissoes.clientesVencidos).toBe(true);
    expect(r.permissoes.dashboard).toBe(false);
    expect(r.permissoes.chat).toBe(false);
  });

  it('serve o catalogo de paginas, para o frontend nao manter a lista dele', async () => {
    const service = criarService({ ...empresaBase, config: { plano: 'cobranca' } });

    const r: any = await service.permissoesDaEmpresa('comp-1');

    expect(r.catalogo.paginas.map((p: any) => p.id)).toEqual([...PAGINAS_IDS]);
    expect(r.catalogo.planos).toEqual(['disparo', 'cobranca']);
    // O rotulo tambem vem do backend: e o que evita a tela inventar nome de
    // pagina e divergir da rota.
    const dashboard = r.catalogo.paginas.find((p: any) => p.id === 'dashboard');
    expect(dashboard.label).toBe('Dashboard');
    expect(dashboard.planos).toEqual(['cobranca']);
  });

  it('marca empresa LEGADA com plano null', async () => {
    // Sem `plano` no config, as permissoes vem das flags page_* com semantica
    // opt-out: tudo liberado, exceto o que estiver explicitamente false.
    const service = criarService({
      ...empresaBase,
      config: { page_dashboard: false },
    });

    const r: any = await service.permissoesDaEmpresa('comp-1');

    expect(r.plano).toBeNull();
    expect(r.permissoes.dashboard).toBe(false);
    expect(r.permissoes.chat).toBe(true);
  });

  it('descarta pagina desconhecida gravada em paginasExtras', async () => {
    const service = criarService({
      ...empresaBase,
      config: { plano: 'disparo', paginasExtras: ['clientesVencidos', 'relatorioX'] },
    });

    const r: any = await service.permissoesDaEmpresa('comp-1');

    // Devolver um id que nao existe faria a tela renderizar uma linha fantasma.
    expect(r.paginasExtras).toEqual(['clientesVencidos']);
  });

  it('NAO devolve credencial do ERP junto', async () => {
    const service = criarService({
      ...empresaBase,
      config: {
        plano: 'cobranca',
        rest_key: 'chave-secreta',
        login: 'login-secreto',
        password: 'senha-secreta',
      },
    });

    const r: any = await service.permissoesDaEmpresa('comp-1');

    const serializado = JSON.stringify(r);
    expect(serializado).not.toContain('chave-secreta');
    expect(serializado).not.toContain('login-secreto');
    expect(serializado).not.toContain('senha-secreta');
  });

  it('empresa inexistente devolve 404', async () => {
    const service = criarService(empresaBase);

    await expect(service.permissoesDaEmpresa('nao-existe')).rejects.toThrow(
      NotFoundException,
    );
  });
});
