import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from './entities/companies';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { VincularCrmDto } from './dto/vincular-crm.dto';
import { chavesDesconhecidas, montarConfig } from './config.contract';
import { getErpDefinition } from '../integrations/erp/erp.registry';
import {
  ErpPreflightService,
  PreflightResult,
} from '../integrations/erp/erp-preflight.service';
import { resolvePagePermissions } from './planos';

export type CompanyListItem = {
  id: string;
  name: string;
  account_chatwoot: string;
  label: string;
  active: boolean;
};

@Injectable()
export class CompaniesService {
  private readonly logger = new Logger(CompaniesService.name);

  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    private readonly preflight: ErpPreflightService,
  ) {}

  /**
   * Cadastra uma empresa, testando a credencial do ERP ANTES de gravar.
   *
   * Substitui o cadastro manual via SQL, que era a causa raiz do incidente de
   * TOPLINK e UPLINK: o `config` era copiado de outra empresa e vinha com o
   * marcador `lastClientSyncAt` preenchido, o que fazia a empresa nascer presa
   * no modo incremental e nunca fazer a carga inicial de clientes — e sem
   * clientes, todas as faturas eram descartadas na sincronizacao.
   *
   * Duas garantias estruturais aqui:
   *
   * 1. O `config` e MONTADO, nunca recebido. Marcadores internos como
   *    `lastClientSyncAt` e `fullClientLoadAt` sao impossiveis de injetar, entao
   *    nenhuma empresa consegue nascer travada.
   * 2. Credencial que o ERP recusa NAO impede o cadastro — a empresa e gravada
   *    INATIVA com o motivo registrado em `config.preflight`. No kickoff a
   *    credencial nem sempre ja esta liberada do lado do cliente, e "cadastrada
   *    e inativa com motivo" e informacao melhor que "nao cadastrou".
   */
  async create(dto: CreateCompanyDto) {
    const definicao = getErpDefinition(dto.erp);
    if (!definicao) {
      // Defesa em profundidade: o @IsIn do DTO ja barra, mas o registro e a
      // autoridade sobre o que existe.
      throw new BadRequestException(`ERP nao reconhecido: "${dto.erp}".`);
    }

    const accountNormalizada = String(dto.account_chatwoot).trim();

    // Idempotencia por `crm_company_id`: o CRM e um chamador de maquina e vai
    // repetir a requisicao depois de qualquer timeout de rede. Sem isso, a
    // repeticao voltaria 409 e o CRM nao teria como saber se o cadastro
    // anterior deu certo. Com isso, repetir e seguro e devolve a mesma empresa.
    const crmId = dto.crm_company_id?.trim();
    if (crmId) {
      const existente = await this.buscarPorCrmCompanyId(crmId);

      if (existente) {
        this.logger.log(
          `[create] reenvio idempotente para crm_company_id=${crmId} — devolvendo ${existente.name}.`,
        );
        return {
          success: true,
          jaExistia: true,
          message:
            'Empresa ja cadastrada para este crm_company_id. Nenhuma alteracao foi feita.',
          company: {
            id: existente.id,
            name: existente.name,
            account_chatwoot: existente.account_chatwoot,
            erp: existente.erp,
            active: existente.active,
          },
          erp: {
            label: definicao.label,
            syncClients: definicao.syncClients,
            syncInvoices: definicao.syncInvoices,
            ressalva: definicao.ressalva ?? null,
          },
          preflight: this.parseConfig(existente.config).preflight ?? null,
          permissoes: resolvePagePermissions(existente.config),
        };
      }
    }

    const jaExiste = await this.companyRepository.exists({
      where: { account_chatwoot: accountNormalizada },
    });
    if (jaExiste) {
      throw new ConflictException(
        `Ja existe empresa com account_chatwoot "${accountNormalizada}".`,
      );
    }

    // Credenciais: o registro diz quais campos cada ERP exige e onde cada um
    // mora (coluna `autorization` ou dentro de `config`).
    const credenciais = dto.credenciais ?? {};
    const faltando = definicao.credenciais
      .filter((c) => c.obrigatorio && !String(credenciais[c.campo] ?? '').trim())
      .map((c) => `${c.campo} (${c.descricao})`);

    if (faltando.length) {
      throw new BadRequestException(
        `Credenciais obrigatorias faltando para ${definicao.label}: ${faltando.join('; ')}`,
      );
    }

    const desconhecidas = Object.keys(credenciais).filter(
      (campo) => !definicao.credenciais.some((c) => c.campo === campo),
    );
    if (desconhecidas.length) {
      throw new BadRequestException(
        `Credenciais nao reconhecidas para ${definicao.label}: ${desconhecidas.join(', ')}. ` +
          `Aceitas: ${definicao.credenciais.map((c) => c.campo).join(', ')}.`,
      );
    }

    // Monta `autorization` e `config` a partir dos campos nomeados.
    // `undefined` (e nao `null`) porque a entidade tipa a coluna como `string`
    // mesmo sendo `nullable: true` — o TypeORM grava NULL para undefined.
    let autorization: string | undefined;
    const configCredenciais: Record<string, string> = {};

    for (const campo of definicao.credenciais) {
      const valor = String(credenciais[campo.campo] ?? '').trim();
      if (!valor) continue;
      if (campo.destino === 'autorization') {
        autorization = valor;
      } else {
        configCredenciais[campo.campo] = valor;
      }
    }

    const url = this.normalizaUrl(dto.url);

    const resultado = await this.preflight.run({
      erp: definicao.code,
      url,
      autorization,
      config: configCredenciais,
    });

    const config: Record<string, any> = {
      ...configCredenciais,
      ...(crmId ? { crm_company_id: crmId } : {}),
      plano: dto.plano,
      ...(dto.paginasExtras?.length
        ? { paginasExtras: dto.paginasExtras }
        : {}),
      preflight: this.resumoPreflight(resultado),
    };

    const ativa = resultado.status !== 'falhou';

    const empresa = this.companyRepository.create({
      name: dto.name.trim(),
      url,
      account_chatwoot: accountNormalizada,
      erp: definicao.code,
      autorization,
      config,
      active: ativa,
      token_system_coraxy: dto.token_system_coraxy,
      cnpj: dto.cnpj?.replace(/\D/g, '') || undefined,
      teamChargeId: dto.teamChargeId?.trim() || null,
      token_notificameHub: dto.token_notificameHub?.trim() || undefined,
      canalId_notificameHub: dto.canais ?? [],
      // Colunas sem nenhuma leitura em backend ou frontend, mantidas apenas
      // porque sao NOT NULL. Nao sao perguntadas ao operador e nao devem ganhar
      // significado novo — sao candidatas a remocao numa limpeza futura.
      table_vector: '',
      label: '',
      total_active_customers: '0',
      downtime: '0',
      acess_token_agentbot_chatwoot: '',
    });

    const salva = await this.companyRepository.save(empresa);

    this.logger.log(
      `[create] ${salva.name} (${definicao.label}, account ${salva.account_chatwoot}) ` +
        `cadastrada ${ativa ? 'ATIVA' : 'INATIVA'} — preflight: ${resultado.status}` +
        (resultado.erro ? ` (${resultado.erro})` : ''),
    );

    return {
      success: true,
      message: ativa
        ? 'Empresa cadastrada e credencial validada no ERP.'
        : 'Empresa cadastrada como INATIVA: o ERP recusou a credencial. Corrija a credencial e reative a empresa.',
      // Nunca devolver tokens nem credenciais — mesma regra do listAll.
      company: {
        id: salva.id,
        name: salva.name,
        account_chatwoot: salva.account_chatwoot,
        erp: salva.erp,
        active: salva.active,
      },
      erp: {
        label: definicao.label,
        syncClients: definicao.syncClients,
        syncInvoices: definicao.syncInvoices,
        ressalva: definicao.ressalva ?? null,
      },
      preflight: this.resumoPreflight(resultado),
      permissoes: resolvePagePermissions(config),
    };
  }

  /**
   * Altera uma empresa ja cadastrada.
   *
   * Existe para encerrar o `UPDATE` manual no banco — que nao era descuido de
   * ninguem, era a unica forma disponivel. O custo dessa ausencia esta medido: o
   * `config` acumulou 22 chaves distintas, 5 sem nenhum leitor, incluindo
   * credencial de outro produto em texto puro.
   *
   * Tres garantias que o SQL manual nao tinha:
   *
   * 1. **Credencial e testada antes de valer.** Mexeu em `url` ou `credenciais`,
   *    roda preflight. Passou, a empresa reativa; recusou, fica inativa com o
   *    motivo — em vez de sincronizar contra o vazio por semanas.
   * 2. **O que o sistema escreve e preservado.** `lastClientSyncAt` e companhia
   *    sobrevivem intactas. Perder isso de vista foi o que travou TOPLINK e
   *    UPLINK.
   * 3. **O que o contrato nao reconhece e descartado**, e a lista volta na
   *    resposta. Cada alteracao deixa a empresa mais limpa, sem sumir com nada
   *    caladamente.
   *
   * `account_chatwoot` e `erp` nao mudam por aqui: sao identidade, nao ajuste.
   */
  async update(
    alvo: { id?: string; crmCompanyId?: string },
    dto: UpdateCompanyDto,
  ) {
    const empresa = await this.buscarParaAlteracao(alvo);
    const definicao = getErpDefinition(empresa.erp);

    if (!definicao) {
      throw new BadRequestException(
        `Empresa gravada com ERP nao reconhecido: "${empresa.erp}".`,
      );
    }

    const configAtual = this.parseConfig(empresa.config);

    // PATCH sem nenhum campo NAO escreve nada.
    //
    // Sem esta saida, um corpo vazio ainda passaria pelo `montarConfig` e
    // removeria as chaves fora do contrato — de forma correta, mas indesejada:
    // um CRM que use PATCH vazio como health-check, ou uma chamada disparada por
    // engano, limparia o config de uma empresa sem ninguem ter pedido. Alteracao
    // de dado precisa ser pedida, nao ser efeito colateral de um ping.
    //
    // Em troca, o corpo vazio ganha uso proprio: e a previa. Devolve o que um
    // PATCH com alteracao real removeria, sem tocar em nada.
    const pediuAlteracao = Object.values(dto).some((v) => v !== undefined);
    if (!pediuAlteracao) {
      return {
        success: true,
        aplicado: false,
        message:
          'Nenhum campo enviado — nada foi alterado. `config.descartadas` mostra o que ' +
          'um PATCH com alteracao real removeria por estar fora do contrato.',
        company: {
          id: empresa.id,
          name: empresa.name,
          account_chatwoot: empresa.account_chatwoot,
          erp: empresa.erp,
          url: empresa.url,
          active: empresa.active,
        },
        preflight: configAtual.preflight ?? null,
        permissoes: resolvePagePermissions(configAtual),
        config: {
          descartadas: chavesDesconhecidas(configAtual, definicao.code),
          normalizadas: [],
        },
      };
    }

    // Credenciais efetivas = as atuais com as enviadas por cima. Permite trocar
    // so a senha sem reenviar o resto, e da ao preflight o conjunto completo.
    const credenciaisAtuais: Record<string, string> = {};
    for (const campo of definicao.credenciais) {
      const valor =
        campo.destino === 'autorization'
          ? empresa.autorization
          : configAtual[campo.campo];
      if (valor) credenciaisAtuais[campo.campo] = String(valor);
    }

    if (dto.credenciais) {
      const desconhecidas = Object.keys(dto.credenciais).filter(
        (campo) => !definicao.credenciais.some((c) => c.campo === campo),
      );
      if (desconhecidas.length) {
        throw new BadRequestException(
          `Credenciais nao reconhecidas para ${definicao.label}: ${desconhecidas.join(', ')}. ` +
            `Aceitas: ${definicao.credenciais.map((c) => c.campo).join(', ')}.`,
        );
      }
    }

    const credenciaisEfetivas = { ...credenciaisAtuais, ...(dto.credenciais ?? {}) };

    const faltando = definicao.credenciais
      .filter(
        (c) => c.obrigatorio && !String(credenciaisEfetivas[c.campo] ?? '').trim(),
      )
      .map((c) => `${c.campo} (${c.descricao})`);

    if (faltando.length) {
      throw new BadRequestException(
        `Credenciais obrigatorias faltando para ${definicao.label}: ${faltando.join('; ')}`,
      );
    }

    // Vinculo com o CRM: define quando ausente, RECUSA quando ja existe outro.
    //
    // Repontar um vinculo existente e a alteracao mais silenciosamente
    // destrutiva que este endpoint poderia aceitar: nada quebra na hora, e a
    // partir dali o CRM passa a alterar uma empresa diferente da que ele pensa
    // estar alterando — com resposta 200 em todo pedido seguinte. Para trocar
    // de proposito, some o vinculo antigo primeiro, com alguem olhando.
    const vinculoAtual = String(configAtual.crm_company_id ?? '').trim();
    const vinculoPedido = String(dto.crm_company_id ?? '').trim();
    let vincularCom: string | undefined;

    if (vinculoPedido && vinculoPedido !== vinculoAtual) {
      if (vinculoAtual) {
        throw new BadRequestException(
          `${empresa.name} ja esta vinculada ao crm_company_id "${vinculoAtual}". ` +
            `O vinculo pode ser definido, nunca trocado — troca-lo faria o CRM ` +
            `passar a alterar esta empresa achando que e outra.`,
        );
      }
      await this.garantirVinculoLivre(vinculoPedido, empresa.id);
      vincularCom = vinculoPedido;
    }

    const url = dto.url === undefined ? empresa.url : this.normalizaUrl(dto.url);

    let autorization = empresa.autorization;
    const configCredenciais: Record<string, string> = {};
    for (const campo of definicao.credenciais) {
      const valor = String(credenciaisEfetivas[campo.campo] ?? '').trim();
      if (!valor) continue;
      if (campo.destino === 'autorization') {
        autorization = valor;
      } else {
        configCredenciais[campo.campo] = valor;
      }
    }

    // Preflight so quando ha o que revalidar. Um PATCH que so troca o plano nao
    // deve bater no ERP nem, muito menos, poder inativar a empresa por uma
    // instabilidade momentanea de rede.
    const revalidar =
      dto.credenciais !== undefined ||
      (dto.url !== undefined && url !== empresa.url);

    let resultado: PreflightResult | null = null;
    if (revalidar) {
      resultado = await this.preflight.run({
        erp: definicao.code,
        url,
        autorization,
        config: configCredenciais,
      });
    }

    const { config, descartadas, normalizadas } = montarConfig(
      configAtual,
      {
        credenciais: dto.credenciais ? credenciaisEfetivas : undefined,
        plano: dto.plano,
        paginasExtras: dto.paginasExtras,
        ajustes: dto.ajustes as Record<string, number> | undefined,
        preflight: resultado ? this.resumoPreflight(resultado) : undefined,
        crmCompanyId: vincularCom,
      },
      definicao.code,
    );

    empresa.url = url;
    empresa.autorization = autorization;
    empresa.config = config;

    if (dto.name !== undefined) empresa.name = dto.name.trim();
    if (dto.cnpj !== undefined) empresa.cnpj = dto.cnpj.replace(/\D/g, '');
    if (dto.teamChargeId !== undefined) {
      empresa.teamChargeId = dto.teamChargeId.trim() || null;
    }
    if (dto.token_system_coraxy !== undefined) {
      empresa.token_system_coraxy = dto.token_system_coraxy.trim();
    }
    if (dto.token_notificameHub !== undefined) {
      empresa.token_notificameHub = dto.token_notificameHub.trim();
    }
    if (dto.canais !== undefined) {
      empresa.canalId_notificameHub = dto.canais;
    }

    // Uma falha de preflight NAO derruba uma empresa que estava funcionando
    // quando a causa e "nao consegui falar com o ERP".
    //
    // O motivo: `inacessivel` e transitorio (timeout, DNS, firewall momentaneo) e
    // pode nao ter nada a ver com a credencial enviada. Inativar uma empresa
    // ativa por causa de tres segundos de instabilidade para a sincronizacao dela
    // e ninguem percebe — o operador acha que salvou e foi embora. Credencial
    // recusada e URL que responde outra coisa continuam inativando: as duas sao
    // estaveis e precisam ficar visiveis.
    //
    // Reativar, ao contrario, sempre acontece com preflight ok: e o caminho de
    // consertar uma empresa que estava inativa.
    let inativacaoEvitada = false;
    if (resultado) {
      if (resultado.status !== 'falhou') {
        empresa.active = true;
      } else if (resultado.causa === 'inacessivel' && empresa.active) {
        inativacaoEvitada = true;
        this.logger.warn(
          `[update] ${empresa.name}: preflight nao alcancou o ERP (${resultado.erro}). ` +
            `Empresa MANTIDA ativa por a causa ser possivelmente transitoria — ` +
            `se a credencial estiver errada de fato, a sincronizacao vai acusar.`,
        );
      } else {
        empresa.active = false;
      }
    }

    const salva = await this.companyRepository.save(empresa);

    this.logger.log(
      `[update] ${salva.name} (${definicao.label}) alterada` +
        (resultado ? ` — preflight: ${resultado.status}` : ' — sem revalidacao') +
        (descartadas.length
          ? ` | chaves fora do contrato descartadas: ${descartadas.join(', ')}`
          : ''),
    );

    return {
      success: true,
      aplicado: true,
      message: !resultado
        ? 'Empresa alterada.'
        : resultado.status !== 'falhou'
          ? 'Empresa alterada e credencial validada no ERP.'
          : inativacaoEvitada
            ? 'Empresa alterada. O preflight nao conseguiu alcancar o ERP, o que pode ser transitorio, ' +
              'entao a empresa foi MANTIDA ativa. Confira o motivo em preflight.erro.'
            : 'Empresa alterada, mas o ERP recusou: ficou INATIVA. Corrija e reenvie.',
      // Nunca devolver tokens nem credenciais — mesma regra do listAll.
      company: {
        id: salva.id,
        name: salva.name,
        account_chatwoot: salva.account_chatwoot,
        erp: salva.erp,
        url: salva.url,
        active: salva.active,
      },
      preflight: resultado ? this.resumoPreflight(resultado) : null,
      permissoes: resolvePagePermissions(config),
      config: {
        descartadas,
        normalizadas,
      },
    };
  }

  /**
   * Vincula em lote empresas que existem dos dois lados mas nunca se conheceram.
   *
   * Toda empresa cadastrada antes do provisionamento por webhook esta sem
   * `crm_company_id`, e sem ele o CRM nao a alcanca: o PATCH devolve 404 e o
   * POST devolve 409 porque o `account_chatwoot` ja existe. Nao sobrava caminho
   * suportado — so `UPDATE` manual, o habito que este modulo veio encerrar.
   *
   * Identifica pela `account_chatwoot` porque e o que o CRM conhece; exigir o
   * uuid interno transformaria o vinculo numa consulta manual empresa por
   * empresa.
   *
   * Item invalido NAO derruba o lote. Vincular 8 de 9 e deixar claro qual falhou
   * e mais util do que recusar tudo por causa de uma account digitada errada — e
   * reenviar o lote corrigido e seguro, porque par ja vinculado nao reescreve.
   */
  async vincularCrm(dto: VincularCrmDto) {
    const resultados: Array<{
      account_chatwoot: string;
      crm_company_id: string;
      status: string;
      empresa: string | null;
      detalhe: string | null;
    }> = [];

    // Sequencial de proposito: e o que faz duas linhas do MESMO lote apontando
    // para o mesmo crm_company_id serem pegas — a segunda ja encontra a
    // primeira gravada. Em paralelo, as duas passariam pela verificacao antes
    // de qualquer uma gravar, e o CRM ficaria com duas empresas indistinguiveis.
    for (const item of dto.vinculos) {
      const account = item.account_chatwoot.trim();
      const crmId = item.crm_company_id.trim();
      const base = { account_chatwoot: account, crm_company_id: crmId };

      const empresa = await this.companyRepository.findOne({
        where: { account_chatwoot: account },
      });

      if (!empresa) {
        resultados.push({
          ...base,
          status: 'nao_encontrada',
          empresa: null,
          detalhe: `Nenhuma empresa com account_chatwoot "${account}".`,
        });
        continue;
      }

      const config = this.parseConfig(empresa.config);
      const atual = String(config.crm_company_id ?? '').trim();

      if (atual === crmId) {
        resultados.push({
          ...base,
          status: 'ja_vinculada',
          empresa: empresa.name,
          detalhe: null,
        });
        continue;
      }

      if (atual) {
        resultados.push({
          ...base,
          status: 'conflito_vinculo_existente',
          empresa: empresa.name,
          detalhe:
            `Ja vinculada ao crm_company_id "${atual}". O vinculo pode ser ` +
            `definido, nunca trocado por aqui.`,
        });
        continue;
      }

      const emUso = await this.buscarPorCrmCompanyId(crmId);
      if (emUso && emUso.id !== empresa.id) {
        resultados.push({
          ...base,
          status: 'conflito_crm_id_em_uso',
          empresa: empresa.name,
          detalhe: `O crm_company_id "${crmId}" ja pertence a ${emUso.name}.`,
        });
        continue;
      }

      // Escrita cirurgica: so a chave do vinculo. Nao passa por `montarConfig`
      // de proposito — ele descartaria as chaves fora do contrato, e limpar
      // config nao foi o que se pediu aqui. A limpeza continua acontecendo no
      // primeiro PATCH de verdade, onde da para ver a lista antes de aplicar.
      empresa.config = { ...config, crm_company_id: crmId };
      await this.companyRepository.save(empresa);

      this.logger.log(
        `[vincularCrm] ${empresa.name} (account ${account}) vinculada ao crm_company_id=${crmId}.`,
      );

      resultados.push({
        ...base,
        status: 'vinculada',
        empresa: empresa.name,
        detalhe: null,
      });
    }

    const contar = (status: string) =>
      resultados.filter((r) => r.status === status).length;

    const vinculadas = contar('vinculada');
    const jaVinculadas = contar('ja_vinculada');
    const falhas = resultados.length - vinculadas - jaVinculadas;

    this.logger.log(
      `[vincularCrm] lote de ${resultados.length}: ${vinculadas} vinculada(s), ` +
        `${jaVinculadas} ja vinculada(s), ${falhas} falha(s).`,
    );

    return {
      success: falhas === 0,
      resumo: {
        total: resultados.length,
        vinculadas,
        jaVinculadas,
        falhas,
      },
      resultados,
    };
  }

  /**
   * Recusa um `crm_company_id` que ja pertenca a outra empresa.
   *
   * Sem isto, duas empresas ficariam com o mesmo vinculo e a busca do webhook
   * (`getOne()`) devolveria uma das duas sem criterio — o CRM alteraria ora uma,
   * ora outra, e as duas responderiam 200.
   */
  private async garantirVinculoLivre(crmId: string, exetoEmpresaId: string) {
    const existente = await this.buscarPorCrmCompanyId(crmId);
    if (existente && existente.id !== exetoEmpresaId) {
      throw new ConflictException(
        `O crm_company_id "${crmId}" ja pertence a ${existente.name}. ` +
          `Dois vinculos iguais deixariam o CRM alterando empresa ao acaso.`,
      );
    }
  }

  private buscarPorCrmCompanyId(crmId: string): Promise<Company | null> {
    return this.companyRepository
      .createQueryBuilder('company')
      .where("company.config ->> 'crm_company_id' = :crmId", { crmId })
      .getOne();
  }

  private async buscarParaAlteracao(alvo: {
    id?: string;
    crmCompanyId?: string;
  }): Promise<Company> {
    if (alvo.id) {
      const empresa = await this.companyRepository.findOne({
        where: { id: alvo.id },
      });
      if (!empresa) {
        throw new NotFoundException(`Empresa ${alvo.id} nao encontrada.`);
      }
      return empresa;
    }

    const crmId = String(alvo.crmCompanyId ?? '').trim();
    const empresa = await this.buscarPorCrmCompanyId(crmId);

    if (!empresa) {
      throw new NotFoundException(
        `Nenhuma empresa cadastrada com crm_company_id "${crmId}".`,
      );
    }
    return empresa;
  }

  /**
   * O `url` do banco e sempre host puro — os services montam
   * `https://${company.url}/...`. Um operador colando "https://host/" quebraria
   * todas as chamadas ao ERP com um erro dificil de ler, entao normalizamos.
   */
  private normalizaUrl(url: string): string {
    return String(url ?? '')
      .trim()
      .replace(/^https?:\/\//i, '')
      .replace(/\/+$/, '');
  }

  /** O `config` ja apareceu como string JSON no banco — normaliza os dois casos. */
  private parseConfig(config: unknown): Record<string, any> {
    if (!config) return {};
    if (typeof config === 'string') {
      try {
        return JSON.parse(config);
      } catch {
        return {};
      }
    }
    return config as Record<string, any>;
  }

  /**
   * O que vai para a resposta e para `config.preflight`.
   *
   * `causa` entra junto do `status` porque so o par explica o estado da empresa.
   * `falhou` sozinho nao distingue "o ERP recusou a senha" de "o ERP nao
   * respondeu" — e e essa distincao que decide se a empresa foi inativada ou
   * mantida ativa. Sem ela, quem le a resposta (ou o config, semanas depois) ve
   * uma falha e uma empresa ativa, e nao tem como saber se foi bug.
   */
  private resumoPreflight(resultado: PreflightResult) {
    return {
      status: resultado.status,
      causa: resultado.causa,
      clientesVisiveis: resultado.clientesVisiveis,
      faturasVisiveis: resultado.faturasVisiveis,
      erro: resultado.erro,
      verificadoEm: new Date().toISOString(),
    };
  }

  /**
   * Lista todas as empresas ativas que possuem ERP configurado. Endpoint
   * restrito a super_admin (ver SuperAdminGuard) — e a unica leitura que
   * ignora o filtro padrao de companyId aplicado no restante do sistema.
   *
   * Filtro de ERP: empresas sem ERP (coluna `erp` nula, vazia ou apenas
   * espacos — ex.: a "Empresa Local" account_chatwoot '1') sao empresas de
   * teste sem dados reais e NAO devem aparecer no switch de empresa.
   * Por isso filtramos `erp IS NOT NULL AND TRIM(erp) <> ''` direto no banco.
   * Este filtro e EXCLUSIVO da listagem: findActiveById e
   * findActiveByChatwootAccount continuam encontrando qualquer empresa ativa.
   *
   * Importante: NUNCA retornar tokens sensiveis daqui
   * (token_system_coraxy, token_notificameHub, acess_token_agentbot_chatwoot,
   *  autorization, config).
   */
  async listAll(): Promise<CompanyListItem[]> {
    const companies = await this.companyRepository
      .createQueryBuilder('company')
      .select([
        'company.id',
        'company.name',
        'company.account_chatwoot',
        'company.label',
        'company.active',
      ])
      .where('company.active = :active', { active: true })
      .andWhere('company.erp IS NOT NULL')
      .andWhere("TRIM(company.erp) <> ''")
      .orderBy('company.name', 'ASC')
      .getMany();

    this.logger.log(
      `[listAll] retornadas ${companies.length} empresa(s) ativa(s) com ERP.`,
    );

    return companies.map((company) => ({
      id: company.id,
      name: company.name,
      account_chatwoot: company.account_chatwoot,
      label: company.label,
      active: company.active,
    }));
  }

  /**
   * Busca uma empresa ativa pelo id. Retorna null se nao encontrada ou
   * inativa. Selecionar somente os campos seguros (sem tokens sensiveis)
   * — usado pelo switch-company no AuthService.
   */
  async findActiveById(id: string): Promise<CompanyListItem | null> {
    const company = await this.companyRepository.findOne({
      where: { id, active: true },
      select: {
        id: true,
        name: true,
        account_chatwoot: true,
        label: true,
        active: true,
      },
    });

    if (!company) {
      return null;
    }

    return {
      id: company.id,
      name: company.name,
      account_chatwoot: company.account_chatwoot,
      label: company.label,
      active: company.active,
    };
  }

  /**
   * Busca a Company completa (entidade) por account_chatwoot, somente se
   * estiver ativa. Diferente de findActiveById, NAO sanitiza — retorna a
   * entidade Company crua porque o login (buildAuthResponse) precisa dos
   * campos `config` (para extractPagePermissions) e `account_chatwoot`.
   *
   * Usado pelo AuthService para resolver a empresa default do super_admin
   * (Fibras do Rio = account_chatwoot '4') no primeiro acesso.
   */
  async findActiveByChatwootAccount(
    accountChatwoot: string,
  ): Promise<Company | null> {
    const normalized = String(accountChatwoot ?? '').trim();
    if (!normalized) {
      return null;
    }

    const company = await this.companyRepository.findOne({
      where: { account_chatwoot: normalized, active: true },
      select: {
        id: true,
        name: true,
        account_chatwoot: true,
        active: true,
        config: true,
      },
    });

    return company ?? null;
  }
}
