import { UnauthorizedException } from '@nestjs/common';
import { compare } from 'bcryptjs';
import { AuthService, SENHA_INICIAL_AGENTE } from './auth.service';

/**
 * Cobre o login do embed do Chatwoot — o caminho que ficou 100% quebrado em
 * producao sem ninguem perceber, porque `auth.service` nao tinha spec nenhuma.
 *
 * O defeito era estrutural: `loginEmbed` so reconhecia agente cujo
 * `chatwootAccessToken` JA estivesse gravado, e nao havia caminho que gravasse.
 * Em desenvolvimento passava porque uma linha tinha sido semeada a mao; em
 * producao, onde nada foi semeado, TODAS as empresas respondiam 401. Os testes
 * abaixo travam justamente as duas metades disso: o bootstrap (validar no
 * Chatwoot e provisionar) e a empresa de aterrissagem vir da `account` da URL.
 *
 * Nada aqui toca a rede: `fetch` e os repositorios sao dubles. Os tokens sao
 * sinteticos.
 */
describe('AuthService — login do embed', () => {
  const fetchOriginal = global.fetch;
  let fetchMock: jest.Mock;

  const FIBRAS = {
    id: 'comp-fibras',
    name: 'FIBRAS DO RIO',
    account_chatwoot: '4',
    active: true,
    config: {},
  };
  const VILLANET = {
    id: 'comp-villanet',
    name: 'VILLANET',
    account_chatwoot: '16',
    active: true,
    config: {},
  };

  /**
   * Monta o service com dubles em memoria. `agentes` e a tabela: o duble de
   * `findOne` resolve por token, id ou email, que sao as tres buscas que o
   * fluxo faz.
   */
  const criarService = (
    agentes: any[],
    empresas: any[] = [FIBRAS, VILLANET],
    opcoes: { baseUrl?: string } = {},
  ) => {
    let sequencia = 0;

    const agentRepository = {
      findOne: jest.fn(async ({ where }: any) => {
        const achado = agentes.find((agente) => {
          if (where.chatwootAccessToken !== undefined) {
            return agente.chatwootAccessToken === where.chatwootAccessToken;
          }
          if (where.id !== undefined) return agente.id === where.id;
          if (where.email !== undefined) return agente.email === where.email;
          return false;
        });
        return achado ?? null;
      }),
      create: jest.fn((dados: any) => ({ ...dados })),
      save: jest.fn(async (agente: any) => {
        if (!agente.id) {
          // Imita o UNIQUE(email) do Postgres. Sem isto, o teste de corrida
          // passaria por acidente: duas insercoes do mesmo e-mail seriam
          // aceitas e nada exercitaria o tratamento do conflito.
          if (agentes.some((x) => x.email === agente.email)) {
            const erro: any = new Error(
              "duplicate key value violates unique constraint",
            );
            erro.code = "23505";
            erro.detail = `Key (email)=(${agente.email}) already exists.`;
            throw erro;
          }
          agente.id = `agente-${++sequencia}`;
          agentes.push(agente);
        }
        // O `save` do TypeORM devolve a company como foi passada (`{ id }`);
        // quem precisa dos demais campos reconsulta. O duble imita isso para o
        // teste enxergar o mesmo problema que a producao enxergaria.
        const empresa = empresas.find((e) => e.id === agente.company?.id);
        if (empresa) agente.company = empresa;
        return agente;
      }),
    };

    const companyRepository = {
      findOne: jest.fn(async ({ where }: any) => {
        return (
          empresas.find(
            (e) => String(e.account_chatwoot) === String(where.account_chatwoot),
          ) ?? null
        );
      }),
    };

    const companiesService = {
      findActiveByChatwootAccount: jest.fn(async (account: string) =>
        empresas.find((e) => String(e.account_chatwoot) === String(account)) ??
        null,
      ),
    };

    const service = new AuthService(
      companyRepository as any,
      agentRepository as any,
      {} as any,
      {} as any,
      { signAsync: jest.fn(async () => 'jwt-sintetico') } as any,
      {} as any,
      {
        get: jest.fn(() =>
          opcoes.baseUrl === undefined ? 'https://chat.test' : opcoes.baseUrl,
        ),
      } as any,
      companiesService as any,
    );

    return { service, agentes, agentRepository };
  };

  const perfilChatwoot = (
    dados: Partial<{
      id: number;
      email: string;
      name: string;
      accounts: { id: number }[];
    }> = {},
  ) => ({
    ok: true,
    status: 200,
    json: async () => ({
      id: 28,
      email: 'atendente@empresa.test',
      name: 'Atendente',
      accounts: [{ id: 4 }, { id: 16 }],
      ...dados,
    }),
  });

  beforeAll(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = fetchOriginal;
  });

  beforeEach(() => {
    fetchMock.mockReset();
  });

  describe('caminho rapido (agente ja conhecido pelo token)', () => {
    it('autentica sem chamar o Chatwoot', async () => {
      const { service } = criarService([
        {
          id: 'a1',
          email: 'atendente@empresa.test',
          name: 'Atendente',
          role: 'operator',
          active: true,
          chatwootAccessToken: 'token-conhecido',
          company: FIBRAS,
        },
      ]);

      const r = await service.loginEmbed({
        account: '4',
        token: 'token-conhecido',
      } as any);

      expect(r.company.name).toBe('FIBRAS DO RIO');
      expect(r.agent?.id).toBe('a1');
      // O ponto do caminho rapido: zero chamada externa.
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('recusa agente bloqueado', async () => {
      const { service } = criarService([
        {
          id: 'a1',
          email: 'bloqueado@empresa.test',
          role: 'operator',
          active: false,
          chatwootAccessToken: 'token-bloqueado',
          company: FIBRAS,
        },
      ]);

      await expect(
        service.loginEmbed({ account: '4', token: 'token-bloqueado' } as any),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('bootstrap (token desconhecido)', () => {
    it('valida no Chatwoot e CRIA o agente — sem papel informado, cai em operator', async () => {
      fetchMock.mockResolvedValue(perfilChatwoot());
      const { service, agentes } = criarService([]);

      const r = await service.loginEmbed({
        account: '4',
        token: 'token-novo',
      } as any);

      expect(agentes).toHaveLength(1);
      expect(agentes[0]).toMatchObject({
        email: 'atendente@empresa.test',
        role: 'operator',
        active: true,
        chatwootAccessToken: 'token-novo',
        chatwootUserId: 28,
      });
      expect(r.company.name).toBe('FIBRAS DO RIO');
    });

    it('reconcilia o token de quem ja existe — conserta rotacao no Chatwoot', async () => {
      fetchMock.mockResolvedValue(perfilChatwoot());
      const existente = {
        id: 'a1',
        email: 'atendente@empresa.test',
        name: 'Atendente',
        role: 'operator',
        active: true,
        chatwootAccessToken: 'token-VELHO',
        company: FIBRAS,
      };
      const { service, agentes } = criarService([existente]);

      const r = await service.loginEmbed({
        account: '4',
        token: 'token-NOVO',
      } as any);

      expect(agentes).toHaveLength(1);
      expect(existente.chatwootAccessToken).toBe('token-NOVO');
      expect(r.agent?.id).toBe('a1');
    });

    it('recusa token que o Chatwoot nao reconhece', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 401 });
      const { service, agentes } = criarService([]);

      await expect(
        service.loginEmbed({ account: '4', token: 'token-falso' } as any),
      ).rejects.toThrow(UnauthorizedException);
      expect(agentes).toHaveLength(0);
    });

    it('recusa quando a account pedida nao esta entre as do usuario no Chatwoot', async () => {
      fetchMock.mockResolvedValue(perfilChatwoot({ accounts: [{ id: 4 }] }));
      const { service, agentes } = criarService([]);

      await expect(
        service.loginEmbed({ account: '16', token: 'token-novo' } as any),
      ).rejects.toThrow('Usuario nao pertence a esta account.');
      expect(agentes).toHaveLength(0);
    });

    it('recusa com mensagem propria quando a account nao tem empresa no Coraxy', async () => {
      fetchMock.mockResolvedValue(
        perfilChatwoot({ accounts: [{ id: 4 }, { id: 20 }] }),
      );
      const { service } = criarService([]);

      // account 20 (HYPERFIBRA) existe no Chatwoot e nao existe aqui — caso
      // real: 17 accounts la contra 12 empresas cadastradas.
      await expect(
        service.loginEmbed({ account: '20', token: 'token-novo' } as any),
      ).rejects.toThrow('nao tem empresa cadastrada no Coraxy');
    });

    it('recusa sem CHATWOOT_BASE_URL, em vez de tentar validar contra nada', async () => {
      const { service } = criarService([], [FIBRAS, VILLANET], { baseUrl: '' });

      await expect(
        service.loginEmbed({ account: '4', token: 'token-novo' } as any),
      ).rejects.toThrow('CHATWOOT_BASE_URL');
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('empresa de aterrissagem vem da account da URL', () => {
    it('super_admin abrindo o embed da VILLANET cai na VILLANET, nao na default', async () => {
      const { service } = criarService([
        {
          id: 'sa',
          email: 'supervisor@empresa.test',
          name: 'Supervisor',
          role: 'super_admin',
          active: true,
          chatwootAccessToken: 'token-super',
          company: FIBRAS,
        },
      ]);

      const r = await service.loginEmbed({
        account: '16',
        token: 'token-super',
      } as any);

      expect(r.company.name).toBe('VILLANET');
      expect(r.company.account).toBe('16');
    });

    it('super_admin em account sem empresa (master) cai na default', async () => {
      const { service } = criarService([
        {
          id: 'sa',
          email: 'supervisor@empresa.test',
          role: 'super_admin',
          active: true,
          chatwootAccessToken: 'token-super',
          company: FIBRAS,
        },
      ]);

      // account=1 e o ambiente master do Chatwoot: nao existe como empresa.
      const r = await service.loginEmbed({
        account: '1',
        token: 'token-super',
      } as any);

      expect(r.company.name).toBe('FIBRAS DO RIO');
    });

    it('explica o modelo quando o e-mail ja tem login em outra empresa', async () => {
      const { service } = criarService([
        {
          id: 'a1',
          email: 'atendente@empresa.test',
          role: 'operator',
          active: true,
          chatwootAccessToken: 'token-conhecido',
          company: FIBRAS,
        },
      ]);

      // O agente existe no Chatwoot da account 16, mas o login dele aqui esta
      // preso a FIBRAS: `agents.email` e unico global.
      await expect(
        service.loginEmbed({ account: '16', token: 'token-conhecido' } as any),
      ).rejects.toThrow('Um agente pertence a uma unica empresa.');
    });
  });

  describe('empresa inativa', () => {
    const INATIVA = {
      id: 'comp-inativa',
      name: 'VIAON',
      account_chatwoot: '18',
      active: false,
      config: {},
    };

    it('super_admin ENTRA — precisa acessar para diagnosticar e reativar', async () => {
      const { service } = criarService(
        [
          {
            id: 'sa',
            email: 'supervisor@empresa.test',
            role: 'super_admin',
            active: true,
            chatwootAccessToken: 'token-super',
            company: FIBRAS,
          },
        ],
        [FIBRAS, VILLANET, INATIVA],
      );

      const r = await service.loginEmbed({
        account: '18',
        token: 'token-super',
      } as any);

      expect(r.company.name).toBe('VIAON');
      expect(r.company.active).toBe(false);
    });

    it('agente comum e recusado, com a empresa nomeada', async () => {
      const { service } = criarService(
        [
          {
            id: 'a1',
            email: 'atendente@empresa.test',
            role: 'operator',
            active: true,
            chatwootAccessToken: 'token-conhecido',
            company: INATIVA,
          },
        ],
        [FIBRAS, VILLANET, INATIVA],
      );

      await expect(
        service.loginEmbed({ account: '18', token: 'token-conhecido' } as any),
      ).rejects.toThrow('A empresa VIAON esta inativa no Coraxy.');
    });

    it('bootstrap NAO cria agente para empresa inativa', async () => {
      fetchMock.mockResolvedValue(
        perfilChatwoot({ accounts: [{ id: 4 }, { id: 18 }] }),
      );
      const { service, agentes } = criarService(
        [],
        [FIBRAS, VILLANET, INATIVA],
      );

      await expect(
        service.loginEmbed({ account: '18', token: 'token-novo' } as any),
      ).rejects.toThrow('A empresa VIAON esta inativa no Coraxy.');

      // O ponto do teste: recusar sem deixar lixo no banco.
      expect(agentes).toHaveLength(0);
    });
  });

  describe('papel herdado do Chatwoot na criacao', () => {
    /** Cria pelo embed e devolve o agente gravado. */
    const provisionar = async (perfil: Record<string, unknown>, account = '4') => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: 28,
          email: 'novo@empresa.test',
          name: 'Novo',
          accounts: [{ id: 4 }, { id: 16 }],
          ...perfil,
        }),
      });

      const { service, agentes } = criarService([]);
      await service.loginEmbed({ account, token: 'token-novo' } as any);
      return agentes[0];
    };

    it('type SuperAdmin vira super_admin — e o caso real do supervisor', async () => {
      // Sondado em 09/09/2026: GET /api/v1/profile devolveu `type: "SuperAdmin"`
      // para mksiriusplace@gmail.com, com 17 accounts.
      const agente = await provisionar({ type: 'SuperAdmin' });
      expect(agente.role).toBe('super_admin');
    });

    it('o type tem precedencia sobre o papel na account', async () => {
      // SuperAdmin da instalacao que e apenas `agent` numa account especifica
      // continua entrando como super_admin: o papel mais amplo manda.
      const agente = await provisionar({
        type: 'SuperAdmin',
        accounts: [{ id: 4, role: 'agent' }],
      });
      expect(agente.role).toBe('super_admin');
    });

    it('administrator da account vira admin', async () => {
      const agente = await provisionar({
        accounts: [{ id: 4, role: 'administrator' }],
      });
      expect(agente.role).toBe('admin');
    });

    it('agent da account vira operator', async () => {
      const agente = await provisionar({
        accounts: [{ id: 4, role: 'agent' }],
      });
      expect(agente.role).toBe('operator');
    });

    it('le o papel da account PEDIDA, nao da primeira da lista', async () => {
      const agente = await provisionar(
        {
          accounts: [
            { id: 4, role: 'administrator' },
            { id: 16, role: 'agent' },
          ],
        },
        '16',
      );
      expect(agente.role).toBe('operator');
    });

    it('sem papel reconhecivel, cai em operator', async () => {
      // Errar para menos gera um chamado; errar para mais entrega acesso que
      // ninguem concedeu.
      const agente = await provisionar({ type: 'User', accounts: [{ id: 4 }] });
      expect(agente.role).toBe('operator');
    });

    it('agente que JA existe mantem o papel local, mesmo com type SuperAdmin', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: 28,
          email: 'existente@empresa.test',
          name: 'Existente',
          type: 'SuperAdmin',
          accounts: [{ id: 4, role: 'administrator' }],
        }),
      });

      const existente = {
        id: 'a1',
        email: 'existente@empresa.test',
        name: 'Existente',
        role: 'operator',
        active: true,
        chatwootAccessToken: 'token-VELHO',
        company: FIBRAS,
      };
      const { service } = criarService([existente]);

      await service.loginEmbed({ account: '4', token: 'token-NOVO' } as any);

      // O token reconcilia; o papel NAO. Um login nao desfaz o que um admin
      // nosso ajustou — nem para promover, nem para rebaixar.
      expect(existente.chatwootAccessToken).toBe('token-NOVO');
      expect(existente.role).toBe('operator');
    });
  });

  describe('senha inicial de quem o embed cadastra', () => {
    const perfilNovo = () => ({
      ok: true,
      status: 200,
      json: async () => ({
        id: 28,
        email: 'novo@empresa.test',
        name: 'Novo',
        accounts: [{ id: 4, role: 'agent' }],
      }),
    });

    it('nasce com senha inicial de verdade e troca obrigatoria', async () => {
      fetchMock.mockResolvedValue(perfilNovo());
      const { service, agentes } = criarService([]);

      await service.loginEmbed({ account: '4', token: 'token-novo' } as any);

      const criado = agentes[0];
      expect(criado.mustChangePassword).toBe(true);

      // Hash bcrypt de verdade, nao o placeholder `CHATWOOT_AUTH`: comparar
      // bcrypt com um nao-hash sempre falha, e era isso que deixava o agente
      // sem nenhum caminho de login por senha.
      expect(criado.passwordHash).toMatch(/^\$2[aby]\$/);
      expect(criado.passwordHash).not.toBe('CHATWOOT_AUTH');
      await expect(compare(SENHA_INICIAL_AGENTE, criado.passwordHash)).resolves.toBe(
        true,
      );
    });

    it('a exigencia viaja na resposta, para a tela poder forcar a troca', async () => {
      fetchMock.mockResolvedValue(perfilNovo());
      const { service } = criarService([]);

      const r = await service.loginEmbed({
        account: '4',
        token: 'token-novo',
      } as any);

      expect(r.agent?.mustChangePassword).toBe(true);
    });

    it('agente que JA existe nao ganha senha inicial nem exigencia', async () => {
      fetchMock.mockResolvedValue(perfilNovo());
      const existente = {
        id: 'a1',
        email: 'novo@empresa.test',
        name: 'Novo',
        role: 'operator',
        active: true,
        mustChangePassword: false,
        passwordHash: '$2a$11$hashRealDoAgenteQueJaExistia',
        chatwootAccessToken: 'token-VELHO',
        company: FIBRAS,
      };
      const { service } = criarService([existente]);

      await service.loginEmbed({ account: '4', token: 'token-NOVO' } as any);

      // O bootstrap reconcilia o token e nada mais. Reescrever a senha de quem
      // ja tem cadastro seria trocar a senha da pessoa por causa de um login.
      expect(existente.passwordHash).toBe('$2a$11$hashRealDoAgenteQueJaExistia');
      expect(existente.mustChangePassword).toBe(false);
      expect(existente.chatwootAccessToken).toBe('token-NOVO');
    });
  });

  describe('corrida de primeiro acesso', () => {
    it('duas requisicoes simultaneas nao derrubam nenhuma das duas', async () => {
      // O frontend roda em React.StrictMode: o efeito de autenticacao dispara
      // DUAS vezes em desenvolvimento. Antes, a segunda batia no UNIQUE(email),
      // devolvia 500, e o `AccountLayout` limpava a sessao e mandava para o
      // /login — com o agente ja criado no banco.
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: 28,
          email: 'novo@empresa.test',
          name: 'Novo',
          accounts: [{ id: 4, role: 'agent' }],
        }),
      });

      const agentes: any[] = [];
      const { service } = criarService(agentes);

      // O duble de `save` do harness ja rejeita e-mail repetido como o Postgres.
      const [a, b] = await Promise.all([
        service.loginEmbed({ account: '4', token: 'token-novo' } as any),
        service.loginEmbed({ account: '4', token: 'token-novo' } as any),
      ]);

      expect(a.agent?.email).toBe('novo@empresa.test');
      expect(b.agent?.email).toBe('novo@empresa.test');
      // Uma linha so: a perdedora reaproveita a que a vencedora criou.
      expect(agentes).toHaveLength(1);
    });
  });
});
