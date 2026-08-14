import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsSelect, FindOptionsWhere, In, Repository } from 'typeorm';
import { Company } from '../companies/entities/companies';
import type { NotificameChannel } from '../companies/entities/notificame-channel.type';
import { CompaniesService } from '../companies/companies.service';
import {
  ChatwootLoginDto,
  CreateAgentDto,
  EmbedLoginDto,
  LoginAgentDto,
  ManageAgentDto,
  PromiseReminderTiming,
  UpdateChatwootConfigDto,
  UpdatePromiseAutomationSettingsDto,
  UpdateProfileDto,
} from './dto/auth.dto';
import { JwtService } from '@nestjs/jwt';
import { Agent, type AgentRole } from '../agents/entities/agent.entity';
import { compare, hash } from 'bcryptjs';
import { Templates } from '../templates/entities/templatesMeta';
import { ClientInteraction } from '../client-interaction/entities/client-interaction.entity';
import { ChatwootService } from '../chatwoot/chatwoot.service';
import { resolvePagePermissions } from '../companies/planos';

type PromiseAutomationSettings = {
  reminderEnabled: boolean;
  reminderTiming: PromiseReminderTiming;
  autoBreakEnabled: boolean;
  checkPaymentBeforeBreak: boolean;
  reminderTemplateId: string | null;
  reminderTemplateName: string | null;
};

type JwtPayload = {
  sub: string;
  account: string;
  name: string;
  agentId?: string;
  agentName?: string;
  agentEmail?: string;
  agentRole?: AgentRole;
  agentActive?: boolean;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(Agent)
    private readonly agentRepository: Repository<Agent>,
    @InjectRepository(Templates)
    private readonly templateRepository: Repository<Templates>,
    @InjectRepository(ClientInteraction)
    private readonly clientInteractionRepository: Repository<ClientInteraction>,
    private readonly jwtService: JwtService,
    private readonly chatwootService: ChatwootService,
    private readonly configService: ConfigService,
    private readonly companiesService: CompaniesService,
  ) {}

  async loginAgent(dto: LoginAgentDto) {
    const agent = await this.agentRepository.findOne({
      where: { email: dto.email.toLowerCase().trim() },
      relations: ['company'],
      select: {
        id: true,
        email: true,
        name: true,
        passwordHash: true,
        role: true,
        active: true,
        company: {
          id: true,
          name: true,
          account_chatwoot: true,
          active: true,
        },
      },
    });

    if (!agent) {
      throw new UnauthorizedException('Credenciais invalidas');
    }

    if (!agent.active) {
      throw new UnauthorizedException('Usuario bloqueado.');
    }

    const passwordOk = await compare(dto.password, agent.passwordHash);
    if (!passwordOk) {
      throw new UnauthorizedException('Credenciais invalidas');
    }

    // E5: super_admin sempre cai na empresa default (Fibras do Rio) no
    // primeiro acesso. Frontend pode trocar via /auth/switch-company (E4).
    const defaultCompany = await this.resolveSuperAdminDefaultCompany(agent);
    const targetCompany = defaultCompany ?? agent.company;

    return this.buildAuthResponse(
      targetCompany.id,
      targetCompany.name,
      targetCompany.account_chatwoot,
      targetCompany.active,
      {
        agentId: agent.id,
        agentName: agent.name ?? agent.email,
        agentEmail: agent.email,
        agentRole: agent.role,
        agentActive: agent.active,
      },
    );
  }

  async loginEmbed(dto: EmbedLoginDto) {
    // Embed UNIFICADO (spec: existe apenas 1 fluxo de embed, que tambem resolve
    // super_admin). O `token` do embed e o chatwootAccessToken do agente
    // (coluna agents.chatwootAccessToken). Identificamos o agente direto no
    // banco por (token, account) — SEM chamar a API do Chatwoot e SEM depender
    // de CHATWOOT_BASE_URL. Espelha o loginAgent, trocando email+senha pelo token.
    const agent = await this.agentRepository.findOne({
      where: { chatwootAccessToken: dto.token },
      relations: ['company'],
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        active: true,
        company: {
          id: true,
          name: true,
          account_chatwoot: true,
          active: true,
          config: true,
        },
      },
    });

    if (!agent) {
      throw new UnauthorizedException('Credenciais de embed invalidas');
    }

    if (!agent.active) {
      throw new UnauthorizedException('Usuario bloqueado.');
    }

    const isSuperAdmin = agent.role === 'super_admin';

    // Anti-tampering: agente comum so pode abrir o embed da PROPRIA empresa — o
    // `account` da URL precisa casar com a empresa do agente. super_admin
    // transita entre empresas, entao a checagem e ignorada para ele.
    if (
      !isSuperAdmin &&
      String(agent.company?.account_chatwoot ?? '') !== String(dto.account)
    ) {
      throw new UnauthorizedException('Usuario nao pertence a esta account.');
    }

    // super_admin cai na empresa default (Fibras do Rio, account_chatwoot=4) no
    // primeiro acesso; o frontend troca depois via /auth/switch-company. Demais
    // papeis usam a propria empresa.
    const defaultCompany = await this.resolveSuperAdminDefaultCompany(agent);
    const targetCompany = defaultCompany ?? agent.company;

    return this.buildAuthResponse(
      targetCompany.id,
      targetCompany.name,
      targetCompany.account_chatwoot,
      targetCompany.active,
      {
        agentId: agent.id,
        agentName: agent.name ?? agent.email,
        agentEmail: agent.email,
        agentRole: agent.role,
        agentActive: agent.active,
      },
      this.extractPagePermissions(targetCompany.config),
    );
  }

  async loginChatwoot(dto: ChatwootLoginDto) {
    const chatwootBaseUrl = String(
      this.configService.get<string>('CHATWOOT_BASE_URL') ?? '',
    ).replace(/\/+$/, '');

    if (!chatwootBaseUrl) {
      throw new UnauthorizedException('CHATWOOT_BASE_URL não configurada no backend.');
    }

    // 1) Validação do token Chatwoot é OBRIGATÓRIA para todos os papéis e
    // acontece SEMPRE antes de qualquer decisão sobre a company. O embed abre
    // com account=1 (ambiente master), que não existe como company no banco;
    // portanto a company pode ser null mais adiante e a ordem precisa garantir
    // que o profile/agent sejam resolvidos primeiro.
    const profile = await this.fetchChatwootProfile(chatwootBaseUrl, dto.chatwoot_token);

    // 2) Extrai email/name/chatwootUserId do profile.
    const email = String(profile.email ?? '').toLowerCase().trim();
    const name = String(profile.name ?? '').trim() || email;
    const chatwootUserId =
      typeof profile.id === 'number' ? profile.id : Number(profile.id);

    if (!email || !chatwootUserId || Number.isNaN(chatwootUserId)) {
      throw new UnauthorizedException('Perfil Chatwoot inválido.');
    }

    // 3) Busca o agente por email ANTES das checagens de anti-tampering/bloqueio:
    // o role do agente decide se relaxamos as validações para super_admin.
    // super_admin só é reconhecido quando o agente JÁ existe com esse role —
    // primeiro login via Chatwoot cria 'operator', então as checagens valem.
    let agent = await this.agentRepository.findOne({
      where: { email },
      relations: ['company'],
    });

    // 4) super_admin definido pelo role persistido do agente.
    const isSuperAdmin = agent?.role === 'super_admin';

    // 5) Busca a company da account (pode ser null — ex.: account=1 do embed
    // master, que não existe no banco).
    const company = await this.companyRepository.findOne({
      where: { account_chatwoot: String(dto.account) },
      select: {
        id: true,
        name: true,
        account_chatwoot: true,
        active: true,
        config: true,
      },
    });

    // 6) Se a company não existe para a account:
    //   - não-super_admin: mantém o 401 atual.
    //   - super_admin: segue (cairá na empresa default no passo 10).
    if (!company && !isSuperAdmin) {
      throw new UnauthorizedException('Empresa não encontrada para esta account.');
    }

    // 7) Anti-tampering: confere se o usuário pertence à account requisitada.
    // super_admin transita entre accounts, então essa exigência é ignorada
    // para ele (o token continua validado acima via fetchChatwootProfile).
    const userAccountIds = Array.isArray(profile.accounts)
      ? profile.accounts.map((a: { id: number | string }) => String(a.id))
      : [];
    if (!isSuperAdmin && !userAccountIds.includes(String(dto.account))) {
      throw new UnauthorizedException(
        'Usuário não pertence à account informada.',
      );
    }
    if (isSuperAdmin && !userAccountIds.includes(String(dto.account))) {
      this.logger.warn(
        `Anti-tampering ignorado para super_admin no loginChatwoot agentId=${agent?.id} account=${dto.account}`,
      );
    }

    // 8) Bloqueio de email cross-empresa. Email é UNIQUE global — se existir em
    // outra empresa, bloqueia (não permitimos um mesmo email autenticar em
    // empresas diferentes). super_admin transita entre empresas, então não é
    // bloqueado. Só aplica quando há company resolvida.
    if (agent && company && agent.company?.id !== company.id && !isSuperAdmin) {
      throw new UnauthorizedException(
        'Este e-mail já está registrado em outra empresa.',
      );
    }

    // 9) Upsert do agente.
    //   - Criação de agente novo SÓ ocorre quando há company válida. Como
    //     agent.company é NOT NULL, nunca criamos um agente sem company. Um
    //     agente novo com account inexistente só seria não-super_admin (o role
    //     persistido define super_admin), e esse caso já caiu no 401 do passo 6.
    //   - Agente existente (inclui super_admin) atualiza name/token/active sem
    //     mexer em role/company — seguro mesmo com company null.
    if (!agent) {
      if (!company) {
        // Defesa em profundidade: este branch é inalcançável (passo 6 já barrou
        // não-super_admin sem company e super_admin sempre tem agent existente).
        throw new UnauthorizedException('Empresa não encontrada para esta account.');
      }
      agent = this.agentRepository.create({
        name,
        email,
        passwordHash: 'CHATWOOT_AUTH', // placeholder; agente Chatwoot não loga via senha
        chatwootUserId,
        chatwootAccessToken: dto.chatwoot_token,
        role: 'operator',
        active: true,
        company: { id: company.id } as Company,
      });
      agent = await this.agentRepository.save(agent);
    } else {
      agent.name = name;
      agent.chatwootUserId = chatwootUserId;
      agent.chatwootAccessToken = dto.chatwoot_token;
      if (!agent.active) agent.active = true;
      await this.agentRepository.save(agent);
    }

    // 10) Resolução da company alvo (gera o JWT):
    //   - super_admin: SEMPRE a empresa default (Fibras do Rio), ignorando o
    //     account da URL — o embed sempre vem com account=1 (inexistente). A
    //     "última empresa selecionada" é aplicada pelo frontend depois via
    //     /auth/switch-company.
    //   - demais papéis: a company do account (já garantida não-null no passo 6).
    let targetCompany: Company;
    if (isSuperAdmin) {
      const defaultCompany = await this.resolveSuperAdminDefaultCompany(agent);
      if (!defaultCompany) {
        this.logger.error(
          `Empresa default indisponível para super_admin no loginChatwoot agentId=${agent.id} account=${dto.account}`,
        );
        throw new UnauthorizedException('Empresa default indisponível');
      }
      targetCompany = defaultCompany;
    } else {
      // Garantido não-null pelo passo 6 (não-super_admin sem company => 401).
      targetCompany = company as Company;
    }

    return this.buildAuthResponse(
      targetCompany.id,
      targetCompany.name,
      targetCompany.account_chatwoot,
      targetCompany.active,
      {
        agentId: agent.id,
        agentName: agent.name ?? agent.email,
        agentEmail: agent.email,
        agentRole: agent.role,
        agentActive: agent.active,
      },
      this.extractPagePermissions(targetCompany.config),
    );
  }

  private async fetchChatwootProfile(
    chatwootBaseUrl: string,
    chatwootToken: string,
  ): Promise<Record<string, any>> {
    let response: Response;
    try {
      response = await fetch(`${chatwootBaseUrl}/api/v1/profile`, {
        method: 'GET',
        headers: {
          api_access_token: chatwootToken,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new UnauthorizedException(
        'Não foi possível conectar ao Chatwoot para validar o token.',
      );
    }

    if (response.status === 401 || response.status === 403) {
      throw new UnauthorizedException('Token Chatwoot inválido.');
    }

    if (!response.ok) {
      throw new UnauthorizedException(
        `Falha ao consultar perfil no Chatwoot (HTTP ${response.status}).`,
      );
    }

    try {
      return (await response.json()) as Record<string, any>;
    } catch {
      throw new UnauthorizedException('Resposta do Chatwoot inválida.');
    }
  }

  async createAgent(
    authorization: string | undefined,
    dto: CreateAgentDto,
  ) {
    const actingAgent = await this.requireAdminAgent(authorization);
    const companyId = dto.companyId?.trim() || actingAgent.company.id;

    if (companyId !== actingAgent.company.id) {
      throw new BadRequestException(
        'Nao e permitido criar usuarios em outra empresa.',
      );
    }

    const normalizedEmail = dto.email.toLowerCase().trim();
    const alreadyExists = await this.agentRepository.exists({
      where: { email: normalizedEmail },
    });

    if (alreadyExists) {
      throw new ConflictException('Email ja cadastrado');
    }

    const passwordHash = await hash(dto.password, 10);
    const normalizedName = dto.name.trim();
    // Apenas super_admin pode criar outro super_admin. Admin comum
    // normaliza qualquer role nao-admin para 'operator'.
    const isCallerSuperAdmin = actingAgent.role === 'super_admin';
    let normalizedRole: AgentRole;
    if (dto.role === 'super_admin') {
      if (!isCallerSuperAdmin) {
        throw new ForbiddenException(
          'Apenas super administradores podem promover usuarios a super_admin.',
        );
      }
      normalizedRole = 'super_admin';
    } else if (dto.role === 'admin') {
      normalizedRole = 'admin';
    } else {
      normalizedRole = 'operator';
    }
    const provisionedIdentity = await this.chatwootService.provisionAgentIdentity({
      companyId,
      name: normalizedName,
      email: normalizedEmail,
      password: dto.password,
      role: normalizedRole,
      authorization,
    });

    let saved: Agent;
    try {
      const created = this.agentRepository.create({
        name: normalizedName,
        email: normalizedEmail,
        passwordHash,
        role: normalizedRole,
        active: true,
        chatwootUserId: provisionedIdentity.userId,
        chatwootAccessToken: null,
        company: { id: companyId },
      });

      saved = await this.agentRepository.save(created);
    } catch (error) {
      await this.chatwootService.removeAgentIdentity(
        companyId,
        provisionedIdentity.userId,
      );
      throw error;
    }

    return {
      success: true,
      message:
        'Agente criado no sistema e no Maestro. Atualize a base para buscar o token gerado automaticamente.',
      agent: {
        id: saved.id,
        name: saved.name,
        email: saved.email,
        role: saved.role,
        active: saved.active,
        createdAt: saved.createdAt,
        updatedAt: saved.updatedAt,
        companyId,
        chatwootLinked: Boolean(saved.chatwootUserId || saved.chatwootAccessToken),
      },
    };
  }

  async me(authorization?: string) {
    const payload = await this.getTokenPayload(authorization);

    const company = await this.companyRepository.findOne({
      where: { id: payload.sub, account_chatwoot: String(payload.account) },
      select: {
        id: true,
        name: true,
        account_chatwoot: true,
        cnpj: true,
        active: true,
        config: true,
        canalId_notificameHub: true,
      },
    });

    if (!company) {
      throw new UnauthorizedException('Empresa nao encontrada');
    }

    const agent = payload.agentId
      ? await this.loadAuthenticatedAgent(payload, company.id, {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            active: true,
            company: {
              id: true,
            },
          },
          // me() exige agente ativo (mantem o comportamento original).
          requireActive: false,
        })
      : null;

    if (payload.agentId && !agent) {
      throw new UnauthorizedException('Agente nao encontrado');
    }

    return {
      success: true,
      company: {
        id: company.id,
        name: company.name,
        account: company.account_chatwoot,
        cnpj: company.cnpj ?? '',
        active: company.active,
        // MC2: canais NotificaMe da empresa do token para o dropdown de disparo.
        // O canal carrega apenas { id, numero } — o X-Api-Token e a coluna
        // compartilhada token_notificameHub e NUNCA trafega para o cliente.
        channels: this.toPublicChannels(company.canalId_notificameHub),
      },
      promiseAutomation: this.normalizePromiseAutomationSettings(company.config),
      permissions: this.extractPagePermissions(company.config),
      agent: agent
        ? {
            id: agent.id,
            name: agent.name ?? null,
            email: agent.email,
            role: agent.role,
            active: agent.active,
          }
        : null,
    };
  }

  async getChatwootConfig(authorization?: string) {
    const actingAgent = await this.requireAdminAgent(authorization);
    const company = await this.companyRepository.findOne({
      where: { id: actingAgent.company.id },
      select: {
        id: true,
        account_chatwoot: true,
        teamChargeId: true,
        config: true,
      },
    });

    if (!company) {
      throw new NotFoundException('Empresa nao encontrada.');
    }

    const config = this.parseCompanyConfig(company.config);
    const platformToken = String(
      this.configService.get<string>('CHATWOOT_PLATFORM_TOKEN') ?? '',
    ).trim();
    const adminToken = String(
      (config as any).chatwoot_admin_token ??
      (config as any).chatwoot_app_token ??
      (config as any).chatwoot_token_admin ??
      '',
    ).trim();

    const access = platformToken
      ? await this.chatwootService.inspectCompanyPlatformAccess(company.id).catch(() => ({
          accountId: Number(company.account_chatwoot) || null,
          ok: false,
          message: 'Nao foi possivel validar a Platform App nesta account.',
        }))
      : {
          accountId: Number(company.account_chatwoot) || null,
          ok: false,
          message: 'Configure a variavel de ambiente CHATWOOT_PLATFORM_TOKEN para validar a integracao.',
        };

    return {
      success: true,
      chatwoot: {
        accountId: company.account_chatwoot,
        teamChargeId: company.teamChargeId ?? '',
        platformTokenConfigured: Boolean(platformToken),
        adminTokenConfigured: Boolean(adminToken),
        platformAccessOk: access.ok,
        platformAccessMessage: access.message,
      },
    };
  }

  async updateChatwootConfig(
    authorization: string | undefined,
    dto: UpdateChatwootConfigDto,
  ) {
    const actingAgent = await this.requireAdminAgent(authorization);
    const company = await this.companyRepository.findOne({
      where: { id: actingAgent.company.id },
      select: {
        id: true,
        account_chatwoot: true,
        teamChargeId: true,
        config: true,
      },
    });

    if (!company) {
      throw new NotFoundException('Empresa nao encontrada.');
    }

    const currentConfig = this.parseCompanyConfig(company.config);
    const nextConfig = { ...currentConfig } as Record<string, unknown>;

    if (dto.chatwootAdminToken !== undefined) {
      const value = String(dto.chatwootAdminToken ?? '').trim();
      if (value) {
        nextConfig.chatwoot_admin_token = value;
      } else {
        delete nextConfig.chatwoot_admin_token;
      }
    }

    if (dto.teamChargeId !== undefined) {
      const nextTeamChargeId = String(dto.teamChargeId ?? '').trim();
      company.teamChargeId = nextTeamChargeId || null;
    }

    company.config = nextConfig;
    await this.companyRepository.save(company);

    return this.getChatwootConfig(authorization);
  }

  async syncCompanyAgentsWithChatwoot(authorization?: string) {
    const actingAgent = await this.requireAdminAgent(authorization);
    return this.syncAgentsForCompany(actingAgent.company.id);
  }

  /**
   * Sincroniza agentes de VARIAS empresas de uma vez, resolvidas por
   * account_chatwoot. Usado pelo webhook do Maestro (push em lote): 1 requisicao
   * com um array de accounts. Tolerante a falha parcial — uma account que falha
   * nao derruba as demais; retorna o resultado por account.
   */
  async syncAgentsForAccounts(accounts: string[], token: string) {
    const expectedToken = String(token ?? '').trim();
    const normalized = Array.from(
      new Set(
        (accounts ?? [])
          .map((a) => String(a ?? '').trim())
          .filter((a) => a.length > 0),
      ),
    );

    const results: Array<{
      account: string;
      ok: boolean;
      companyId?: string;
      synced?: number;
      skipped?: number;
      message?: string;
      error?: string;
    }> = [];

    for (const account of normalized) {
      const company = await this.companyRepository.findOne({
        where: { account_chatwoot: account },
        select: { id: true, token_system_coraxy: true },
      });

      if (!company) {
        results.push({
          account,
          ok: false,
          error: 'Empresa nao encontrada para esta account',
        });
        this.logger.warn(
          `[MaestroAgentsSync] account=${account} sem empresa correspondente`,
        );
        continue;
      }

      // Autorizacao por token compartilhado: so sincroniza accounts cuja empresa
      // tenha EXATAMENTE o token_system_coraxy apresentado no header.
      if (String(company.token_system_coraxy ?? '') !== expectedToken) {
        results.push({
          account,
          ok: false,
          companyId: company.id,
          error: 'Token nao autorizado para esta account',
        });
        this.logger.warn(
          `[MaestroAgentsSync] token invalido para account=${account}`,
        );
        continue;
      }

      try {
        const r = await this.syncAgentsForCompany(company.id);
        results.push({
          account,
          ok: true,
          companyId: company.id,
          synced: r.synced,
          skipped: r.skipped,
          message: r.message,
        });
      } catch (err) {
        const msg = (err as Error)?.message ?? String(err);
        results.push({ account, ok: false, companyId: company.id, error: msg });
        this.logger.error(
          `[MaestroAgentsSync] Falha ao sincronizar account=${account} company=${company.id}: ${msg}`,
        );
      }
    }

    const okCount = results.filter((r) => r.ok).length;
    return {
      success: true,
      requested: normalized.length,
      synced: okCount,
      failed: results.length - okCount,
      results,
    };
  }

  /**
   * Nucleo do sync de agentes por companyId — NAO exige token de admin.
   * Reutilizado pelo trigger manual (via syncCompanyAgentsWithChatwoot) e pelo
   * webhook do Maestro (push por account -> companyId).
   */
  async syncAgentsForCompany(companyId: string) {
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
      select: {
        id: true,
        account_chatwoot: true,
      },
    });

    if (!company) {
      throw new NotFoundException('Empresa nao encontrada.');
    }

    let imported = 0;
    let linked = 0;
    let roleUpdated = 0;
    let passwordUpdated = 0;
    let tokenUpdated = 0;
    let missingPasswordHash = 0;
    let skipped = 0;
    let invalidEmailSkipped = 0;
    let duplicatePayloadSkipped = 0;
    let emailConflictSkipped = 0;
    let superAdminGlobalSkipped = 0;

    const accountAgents = await this.chatwootService.listCompanyAgentsFromWebhook(company.id);
    const normalizedRemoteEmails = Array.from(
      new Set(
        accountAgents
          .map((agent) => agent.email.toLowerCase().trim())
          .filter((email) => this.isLikelyEmail(email)),
      ),
    );
    const localAgents = await this.agentRepository.find({
      where: { company: { id: company.id } },
      relations: ['company'],
      select: {
        id: true,
        name: true,
        email: true,
        passwordHash: true,
        role: true,
        active: true,
        chatwootUserId: true,
        chatwootAccessToken: true,
        company: { id: true },
      },
    });
    const existingAgentsByEmail = normalizedRemoteEmails.length
      ? await this.agentRepository.find({
          where: { email: In(normalizedRemoteEmails) },
          relations: ['company'],
          select: {
            id: true,
            email: true,
            role: true,
            company: { id: true },
          },
        })
      : [];

    const localAgentsByEmail = new Map(
      localAgents.map((agent) => [agent.email.toLowerCase().trim(), agent] as const),
    );
    const existingAgentsByEmailMap = new Map(
      existingAgentsByEmail.map((agent) => [agent.email.toLowerCase().trim(), agent] as const),
    );
    const processedEmails = new Set<string>();
    const conflictingEmails: string[] = [];

    for (const remoteAgent of accountAgents) {
      const normalizedEmail = remoteAgent.email.toLowerCase().trim();
      if (!this.isLikelyEmail(normalizedEmail)) {
        skipped += 1;
        invalidEmailSkipped += 1;
        continue;
      }

      if (processedEmails.has(normalizedEmail)) {
        skipped += 1;
        duplicatePayloadSkipped += 1;
        continue;
      }
      processedEmails.add(normalizedEmail);

      const mappedRole = this.mapMaestroRoleToAgentRole(remoteAgent.role);
      const normalizedImportedName = this.normalizeImportedAgentName(
        remoteAgent.name,
        normalizedEmail,
      );
      const importedPasswordHash = this.normalizeImportedPasswordHash(
        remoteAgent.encryptedPassword,
      );
      const importedToken = String(remoteAgent.token ?? '').trim() || null;
      const existing = localAgentsByEmail.get(normalizedEmail);

      if (existing) {
        let changed = false;

        if ((!existing.chatwootUserId && remoteAgent.id) || (!existing.chatwootAccessToken && importedToken)) {
          if (!existing.chatwootUserId && remoteAgent.id) {
            existing.chatwootUserId = remoteAgent.id;
          }

          if (!existing.chatwootAccessToken && importedToken) {
            existing.chatwootAccessToken = importedToken;
            tokenUpdated += 1;
          }

          linked += 1;
          changed = true;
        } else if (importedToken && existing.chatwootAccessToken !== importedToken) {
          existing.chatwootAccessToken = importedToken;
          tokenUpdated += 1;
          changed = true;
        }

        if (existing.role !== mappedRole) {
          // super_admin nao vem do Maestro: nunca deve ser rebaixado por sync.
          if (existing.role === 'super_admin') {
            // mantem o super_admin local intacto
          } else {
            const shouldDemoteLastAdmin =
              existing.role === 'admin' &&
              mappedRole !== 'admin' &&
              existing.active;

            if (shouldDemoteLastAdmin) {
              try {
                await this.ensureCompanyHasAnotherAdmin(company.id, existing.id);
                existing.role = mappedRole;
                roleUpdated += 1;
                changed = true;
              } catch {
                // Mantem o admin local quando ele e o ultimo administrador ativo.
              }
            } else {
              existing.role = mappedRole;
              roleUpdated += 1;
              changed = true;
            }
          }
        }

        const existingNormalizedName = String(existing.name ?? '').trim();
        if (
          normalizedImportedName &&
          existingNormalizedName !== normalizedImportedName
        ) {
          existing.name = normalizedImportedName;
          changed = true;
        } else if (
          !normalizedImportedName &&
          existingNormalizedName &&
          existingNormalizedName.toLowerCase() === normalizedEmail
        ) {
          existing.name = undefined;
          changed = true;
        }

        if (importedPasswordHash && existing.passwordHash !== importedPasswordHash) {
          existing.passwordHash = importedPasswordHash;
          passwordUpdated += 1;
          changed = true;
        }

        if (changed) {
          const saved = await this.agentRepository.save(existing);
          localAgentsByEmail.set(normalizedEmail, saved);
        }

        continue;
      }

      const existingInAnotherCompany = existingAgentsByEmailMap.get(normalizedEmail);
      if (
        existingInAnotherCompany &&
        existingInAnotherCompany.company.id !== company.id
      ) {
        skipped += 1;
        // super_admin ja acessa todas as empresas pelo seletor (switch-company);
        // o email dele registrado em outra empresa nao e um conflito real e nao
        // deve alarmar o toast da sincronizacao.
        if (existingInAnotherCompany.role === 'super_admin') {
          superAdminGlobalSkipped += 1;
        } else {
          emailConflictSkipped += 1;
          conflictingEmails.push(normalizedEmail);
        }
        continue;
      }

      const created = this.agentRepository.create({
        name: normalizedImportedName ?? undefined,
        email: normalizedEmail,
        passwordHash:
          importedPasswordHash ??
          (await hash(this.chatwootService.createProvisionPassword(), 10)),
        role: mappedRole,
        active: true,
        chatwootUserId: remoteAgent.id,
        chatwootAccessToken: importedToken,
        company: { id: company.id },
      });

      await this.agentRepository.save(created);
      localAgentsByEmail.set(normalizedEmail, created);
      existingAgentsByEmailMap.set(normalizedEmail, created);
      imported += 1;
      if (importedPasswordHash) {
        passwordUpdated += 1;
      } else {
        missingPasswordHash += 1;
      }
      if (importedToken) {
        tokenUpdated += 1;
      }
    }

    const parts: string[] = [];
    if (imported) parts.push(`${imported} importado(s) do Maestro`);
    if (linked) parts.push(`${linked} vinculado(s) por email`);
    if (roleUpdated) parts.push(`${roleUpdated} cargo(s) ajustado(s)`);
    if (passwordUpdated) parts.push(`${passwordUpdated} senha(s) sincronizada(s)`);
    if (tokenUpdated) parts.push(`${tokenUpdated} token(s) sincronizado(s)`);
    if (missingPasswordHash) {
      parts.push(`${missingPasswordHash} usuario(s) importado(s) sem hash de senha`);
    }
    if (emailConflictSkipped) {
      parts.push(`${emailConflictSkipped} conflito(s) de email em outra empresa`);
    }
    if (superAdminGlobalSkipped) {
      parts.push(
        `${superAdminGlobalSkipped} super admin(s) ignorado(s) (ja possuem acesso global)`,
      );
    }
    if (duplicatePayloadSkipped) {
      parts.push(`${duplicatePayloadSkipped} registro(s) duplicado(s) ignorado(s) no retorno`);
    }
    if (invalidEmailSkipped) {
      parts.push(`${invalidEmailSkipped} registro(s) sem email valido ignorado(s)`);
    }

    const conflictPreview = conflictingEmails.length
      ? ` Emails em conflito: ${conflictingEmails.slice(0, 5).join(', ')}${
          conflictingEmails.length > 5 ? '...' : ''
        }.`
      : '';

    return {
      success: true,
      message: parts.length
        ? `Sincronizacao concluida: ${parts.join(', ')}.${imported || linked ? '' : ' Nenhum novo usuario foi criado nesta rodada.'}${conflictPreview}`
        : 'Nenhum usuario pendente de sincronizacao com o Maestro.',
      synced: imported + linked,
      skipped,
      imported,
      linked,
      roleUpdated,
      importedAgents: [],
    };
  }

  async getPromiseAutomationSettings(authorization?: string) {
    const company = await this.resolveCompanyFromAuthorization(authorization);

    return {
      success: true,
      promiseAutomation: this.normalizePromiseAutomationSettings(company.config),
    };
  }

  async updatePromiseAutomationSettings(
    authorization: string | undefined,
    dto: UpdatePromiseAutomationSettingsDto,
  ) {
    const company = await this.resolveCompanyFromAuthorization(authorization);
    const currentConfig = this.parseCompanyConfig(company.config);
    const currentSettings = this.normalizePromiseAutomationSettings(currentConfig);

    const nextSettings: PromiseAutomationSettings = {
      reminderEnabled: dto.reminderEnabled ?? currentSettings.reminderEnabled,
      reminderTiming: dto.reminderTiming ?? currentSettings.reminderTiming,
      autoBreakEnabled: dto.autoBreakEnabled ?? currentSettings.autoBreakEnabled,
      checkPaymentBeforeBreak:
        dto.checkPaymentBeforeBreak ?? currentSettings.checkPaymentBeforeBreak,
      reminderTemplateId:
        dto.reminderTemplateId === undefined
          ? currentSettings.reminderTemplateId
          : dto.reminderTemplateId,
      reminderTemplateName:
        dto.reminderTemplateName === undefined
          ? currentSettings.reminderTemplateName
          : dto.reminderTemplateName,
    };

    if (nextSettings.reminderEnabled && !nextSettings.reminderTemplateId) {
      throw new BadRequestException(
        'Selecione um template para o lembrete automatico.',
      );
    }

    if (nextSettings.reminderTemplateId) {
      const template = await this.templateRepository.findOne({
        where: {
          id: nextSettings.reminderTemplateId,
          company: { id: company.id },
        },
        relations: ['company'],
        select: {
          id: true,
          name: true,
          meta_status: true,
          isEnabled: true,
          active: true,
          company: { id: true },
        },
      });

      if (!template) {
        throw new NotFoundException(
          'Template de lembrete nao encontrado para esta empresa.',
        );
      }

      if (!template.isEnabled || !template.active) {
        throw new BadRequestException(
          'O template de lembrete selecionado esta desativado.',
        );
      }

      if (String(template.meta_status).toUpperCase() !== 'APPROVED') {
        throw new BadRequestException(
          'O template de lembrete precisa estar aprovado para uso.',
        );
      }

      nextSettings.reminderTemplateName = template.name;
    }

    company.config = {
      ...currentConfig,
      promiseAutomation: nextSettings,
    };

    await this.companyRepository.save(company);

    return {
      success: true,
      message: 'Configuracoes de promessa atualizadas com sucesso.',
      promiseAutomation: nextSettings,
    };
  }

  async updateProfile(authorization: string | undefined, dto: UpdateProfileDto) {
    const payload = await this.getTokenPayload(authorization);

    if (!payload.agentId) {
      throw new UnauthorizedException(
        'Perfil disponivel apenas para usuarios autenticados.',
      );
    }

    const agent = await this.loadAuthenticatedAgent(payload, payload.sub, {
      select: {
        id: true,
        name: true,
        email: true,
        passwordHash: true,
        role: true,
        active: true,
        company: {
          id: true,
        },
      },
      // updateProfile() original nao exigia agent.active — mantemos.
      requireActive: false,
    });

    if (!agent) {
      throw new UnauthorizedException('Agente nao encontrado.');
    }

    const nextName = dto.name?.trim();
    const wantsPasswordChange = Boolean(dto.currentPassword || dto.newPassword);

    if (!nextName && !wantsPasswordChange) {
      throw new BadRequestException(
        'Informe ao menos um dado para atualizar o perfil.',
      );
    }

    if (nextName) {
      agent.name = nextName;
    }

    if (wantsPasswordChange) {
      if (!dto.currentPassword?.trim()) {
        throw new BadRequestException(
          'Informe a senha atual para alterar a senha.',
        );
      }

      if (!dto.newPassword?.trim()) {
        throw new BadRequestException('Informe a nova senha.');
      }

      const passwordOk = await compare(dto.currentPassword, agent.passwordHash);
      if (!passwordOk) {
        throw new BadRequestException(
          'A senha atual informada esta incorreta.',
        );
      }

      if (dto.currentPassword === dto.newPassword) {
        throw new BadRequestException(
          'A nova senha precisa ser diferente da senha atual.',
        );
      }

      agent.passwordHash = await hash(dto.newPassword, 10);
    }

    const saved = await this.agentRepository.save(agent);

    return {
      success: true,
      message: 'Perfil atualizado com sucesso.',
      agent: {
        id: saved.id,
        name: saved.name ?? null,
        email: saved.email,
        role: saved.role,
        active: saved.active,
      },
    };
  }

  async listCompanyAgents(authorization?: string) {
    const actingAgent = await this.requireAdminAgent(authorization);

    const agents = await this.agentRepository.find({
      where: { company: { id: actingAgent.company.id } },
      relations: ['company'],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        chatwootUserId: true,
        chatwootAccessToken: true,
        createdAt: true,
        updatedAt: true,
        company: { id: true },
      },
      order: {
        name: 'ASC',
        email: 'ASC',
      },
    });

    return {
      success: true,
      agents: agents.map((agent) => ({
        id: agent.id,
        name: agent.name ?? null,
        email: agent.email,
        role: agent.role,
        active: agent.active,
        createdAt: agent.createdAt,
        updatedAt: agent.updatedAt,
        chatwootLinked: Boolean(agent.chatwootUserId || agent.chatwootAccessToken),
      })),
    };
  }

  async manageCompanyAgent(
    authorization: string | undefined,
    agentId: string,
    dto: ManageAgentDto,
  ) {
    const actingAgent = await this.requireAdminAgent(authorization);
    const normalizedAgentId = String(agentId).trim();

    if (!normalizedAgentId) {
      throw new BadRequestException('Agente nao informado.');
    }

    const agent = await this.agentRepository.findOne({
      where: {
        id: normalizedAgentId,
        company: { id: actingAgent.company.id },
      },
      relations: ['company'],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        chatwootUserId: true,
        chatwootAccessToken: true,
        company: { id: true },
      },
    });

    if (!agent) {
      throw new NotFoundException('Agente nao encontrado para esta empresa.');
    }

    const isSelf = agent.id === actingAgent.id;
    const nextRole = dto.role ?? agent.role;
    const nextActive = dto.active ?? agent.active;
    const nextChatwootToken =
      dto.chatwootAccessToken === undefined
        ? agent.chatwootAccessToken
        : (String(dto.chatwootAccessToken ?? '').trim() || null);

    if (isSelf && dto.active === false) {
      throw new BadRequestException('Voce nao pode bloquear o proprio usuario.');
    }

    if (isSelf && dto.role && dto.role !== agent.role) {
      throw new BadRequestException('Voce nao pode alterar a propria role.');
    }

    const isCallerSuperAdmin = actingAgent.role === 'super_admin';

    // Apenas super_admin pode alterar/rebaixar/bloquear outro super_admin.
    if (agent.role === 'super_admin' && !isCallerSuperAdmin) {
      throw new ForbiddenException(
        'Apenas super administradores podem alterar outro super administrador.',
      );
    }

    // Apenas super_admin pode promover alguem a super_admin.
    if (
      dto.role === 'super_admin' &&
      agent.role !== 'super_admin' &&
      !isCallerSuperAdmin
    ) {
      throw new ForbiddenException(
        'Apenas super administradores podem promover usuarios a super_admin.',
      );
    }

    // super_admin conta como admin nas invariantes de "ultimo administrador".
    const wasAdminLike = agent.role === 'admin' || agent.role === 'super_admin';
    const willBeAdminLike = nextRole === 'admin' || nextRole === 'super_admin';
    if (wasAdminLike && (!willBeAdminLike || nextActive === false)) {
      await this.ensureCompanyHasAnotherAdmin(actingAgent.company.id, agent.id);
    }

    agent.role = nextRole;
    agent.active = nextActive;
    agent.chatwootAccessToken = nextChatwootToken;
    if (!nextChatwootToken) {
      agent.chatwootUserId = null;
    }

    const saved = await this.agentRepository.save(agent);

    return {
      success: true,
      message: 'Usuario atualizado com sucesso.',
      agent: {
        id: saved.id,
        name: saved.name ?? null,
        email: saved.email,
        role: saved.role,
        active: saved.active,
        chatwootLinked: Boolean(saved.chatwootUserId || saved.chatwootAccessToken),
      },
    };
  }

  async removeCompanyAgent(
    authorization: string | undefined,
    agentId: string,
  ) {
    const actingAgent = await this.requireAdminAgent(authorization);

    const normalizedAgentId = String(agentId).trim();
    if (!normalizedAgentId) {
      throw new BadRequestException('Agente nao informado.');
    }

    if (normalizedAgentId === actingAgent.id) {
      throw new BadRequestException(
        'Voce nao pode remover o proprio usuario logado.',
      );
    }

    const agent = await this.agentRepository.findOne({
      where: {
        id: normalizedAgentId,
        company: { id: actingAgent.company.id },
      },
      relations: ['company'],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        company: { id: true },
      },
    });

    if (!agent) {
      throw new NotFoundException('Agente nao encontrado para esta empresa.');
    }

    // Apenas super_admin pode remover outro super_admin.
    if (agent.role === 'super_admin' && actingAgent.role !== 'super_admin') {
      throw new ForbiddenException(
        'Apenas super administradores podem remover outro super administrador.',
      );
    }

    if ((agent.role === 'admin' || agent.role === 'super_admin') && agent.active) {
      await this.ensureCompanyHasAnotherAdmin(actingAgent.company.id, agent.id);
    }

    await this.clientInteractionRepository.update(
      {
        company_id: actingAgent.company.id,
        agent_id: normalizedAgentId,
      },
      {
        agent_id: null,
      },
    );

    await this.chatwootService.removeAgentIdentity(
      actingAgent.company.id,
      agent.chatwootUserId ?? null,
    );

    await this.agentRepository.remove(agent);

    return {
      success: true,
      message: 'Usuario removido com sucesso.',
      removedAgent: {
        id: agent.id,
        name: agent.name ?? null,
        email: agent.email,
        role: agent.role,
      },
    };
  }

  /**
   * Reemite o JWT do super_admin trocando o companyId ativo. O frontend
   * substitui o token e os endpoints subsequentes operam na nova empresa.
   *
   * Defesa em profundidade: alem do SuperAdminGuard no controller,
   * revalida-se aqui o role do agente (caso o token tenha sido emitido
   * antes do agente ser rebaixado).
   */
  async switchActiveCompany(agentId: string, targetCompanyId: string) {
    const normalizedAgentId = String(agentId ?? '').trim();
    const normalizedTargetCompanyId = String(targetCompanyId ?? '').trim();

    if (!normalizedAgentId) {
      throw new UnauthorizedException('Sessao invalida.');
    }

    const agent = await this.agentRepository.findOne({
      where: { id: normalizedAgentId },
      relations: ['company'],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        company: { id: true },
      },
    });

    if (!agent || !agent.active) {
      throw new UnauthorizedException('Agente nao encontrado ou bloqueado.');
    }

    if (agent.role !== 'super_admin') {
      throw new ForbiddenException(
        'Apenas super administradores podem trocar de empresa.',
      );
    }

    const targetCompany = await this.companiesService.findActiveById(
      normalizedTargetCompanyId,
    );

    if (!targetCompany) {
      throw new NotFoundException(
        'Empresa nao encontrada ou inativa.',
      );
    }

    const fromCompanyId = agent.company?.id ?? null;

    this.logger.log(
      `super_admin switched company agentId=${agent.id} fromCompanyId=${fromCompanyId} toCompanyId=${targetCompany.id}`,
    );

    return this.buildAuthResponse(
      targetCompany.id,
      targetCompany.name,
      targetCompany.account_chatwoot,
      targetCompany.active,
      {
        agentId: agent.id,
        agentName: agent.name ?? agent.email,
        agentEmail: agent.email,
        agentRole: agent.role,
        agentActive: agent.active,
      },
    );
  }

  /**
   * Default company override do super_admin no login. Spec E5:
   * todo super_admin, no primeiro acesso (independente do canal de login),
   * cai na empresa Fibras do Rio (account_chatwoot = '4'). Depois o
   * frontend pode trocar via POST /auth/switch-company/:id (E4).
   *
   * Fallback: se a empresa default nao existir ou estiver inativa,
   * loga warning e devolve null — o caller cai no comportamento normal
   * (agent.company natural). Nao quebra o login.
   */
  private static readonly SUPER_ADMIN_DEFAULT_ACCOUNT_CHATWOOT = '4';

  private async resolveSuperAdminDefaultCompany(
    agent: Pick<Agent, 'id' | 'role'>,
  ): Promise<Company | null> {
    if (agent.role !== 'super_admin') {
      return null;
    }

    const defaultCompany = await this.companiesService.findActiveByChatwootAccount(
      AuthService.SUPER_ADMIN_DEFAULT_ACCOUNT_CHATWOOT,
    );

    if (!defaultCompany) {
      this.logger.warn(
        `Default company Fibras do Rio (account_chatwoot=${AuthService.SUPER_ADMIN_DEFAULT_ACCOUNT_CHATWOOT}) not found or inactive, falling back to agent.companyId agentId=${agent.id}`,
      );
      return null;
    }

    return defaultCompany;
  }

  private async buildAuthResponse(
    companyId: string,
    companyName: string,
    companyAccount: string,
    companyActive: boolean,
    agent?: {
      agentId?: string;
      agentName?: string;
      agentEmail?: string;
      agentRole?: AgentRole;
      agentActive?: boolean;
    },
    permissions?: ReturnType<typeof this.extractPagePermissions>,
  ) {
    const payload: JwtPayload = {
      sub: companyId,
      account: companyAccount,
      name: companyName,
      agentId: agent?.agentId,
      agentName: agent?.agentName,
      agentEmail: agent?.agentEmail,
      agentRole: agent?.agentRole,
      agentActive: agent?.agentActive,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    return {
      success: true,
      accessToken,
      company: {
        id: companyId,
        name: companyName,
        account: companyAccount,
        active: companyActive,
      },
      permissions: permissions ?? this.extractPagePermissions(null),
      agent: agent?.agentId
        ? {
            id: agent.agentId,
            name: agent.agentName ?? null,
            email: agent.agentEmail ?? null,
            role: agent.agentRole ?? 'operator',
            active: agent.agentActive ?? true,
          }
        : null,
    };
  }

  /**
   * MC2: normaliza os canais NotificaMe para exposicao no frontend.
   * O canal ja e { id, numero }; aqui apenas filtramos entradas invalidas e
   * garantimos `numero` como string. O X-Api-Token vive em
   * token_notificameHub (coluna compartilhada) e nunca compoe este retorno.
   */
  private toPublicChannels(
    channels: NotificameChannel[] | null | undefined,
  ): Array<{ id: string; numero: string }> {
    if (!Array.isArray(channels)) return [];
    return channels
      .filter((channel) => channel && typeof channel.id === 'string' && channel.id)
      .map((channel) => ({
        id: channel.id,
        numero: String(channel.numero ?? ''),
      }));
  }

  /**
   * Delega para o registro de paginas (`companies/planos.ts`), que e a fonte
   * unica da lista. O retorno passou a incluir TODAS as paginas conhecidas —
   * antes eram apenas dashboard/clientesVencidos/chat, e as demais nao tinham
   * permissao nenhuma. Chaves novas sao aditivas: o frontend indexa por nome,
   * entao quem ainda le so as tres continua funcionando.
   */
  private extractPagePermissions(config: Record<string, any> | null) {
    return resolvePagePermissions(config);
  }

  private async getTokenPayload(authorization?: string) {
    const token = String(authorization ?? '')
      .replace(/^Bearer\s+/i, '')
      .trim();

    if (!token) {
      throw new UnauthorizedException('Token nao informado');
    }

    try {
      return await this.jwtService.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Token invalido');
    }
  }

  private async resolveCompanyFromAuthorization(authorization?: string) {
    const payload = await this.getTokenPayload(authorization);

    const company = await this.companyRepository.findOne({
      where: { id: payload.sub, account_chatwoot: String(payload.account) },
      select: {
        id: true,
        name: true,
        account_chatwoot: true,
        config: true,
      },
    });

    if (!company) {
      throw new UnauthorizedException('Empresa nao encontrada');
    }

    return company;
  }

  /**
   * Carga padronizada do Agent autenticado a partir do JWT.
   *
   * Para admin/operator amarra `agent.company.id = expectedCompanyId` (mantem
   * multi-tenancy). Para super_admin (E5) relaxa o filtro para apenas
   * `id = payload.agentId`, pois o JWT do super_admin pode carregar uma
   * `companyId` (sub) diferente da `agent.company` natural — ele troca de
   * empresa via /auth/switch-company sem que o agente seja movido entre
   * tenants.
   *
   * IMPORTANTE: o relaxamento e EXCLUSIVO da carga do Agent em
   * autenticacao/perfil. Queries de dados (clients, invoices, campaigns,
   * etc.) continuam exigindo filtro por companyId.
   */
  private async loadAuthenticatedAgent(
    payload: JwtPayload,
    expectedCompanyId: string,
    options: {
      select?: FindOptionsSelect<Agent>;
      /** Quando true (default), filtra por active=true direto no WHERE. */
      requireActive?: boolean;
    } = {},
  ): Promise<Agent | null> {
    if (!payload.agentId) {
      return null;
    }

    const isSuperAdmin = payload.agentRole === 'super_admin';
    const requireActive = options.requireActive ?? true;

    const where: FindOptionsWhere<Agent> = isSuperAdmin
      ? { id: payload.agentId }
      : { id: payload.agentId, company: { id: expectedCompanyId } };

    if (requireActive) {
      where.active = true;
    }

    if (isSuperAdmin) {
      this.logger.debug(
        `loadAuthenticatedAgent: relaxando filtro de companyId para super_admin agentId=${payload.agentId} expectedCompanyId=${expectedCompanyId}`,
      );
    }

    return this.agentRepository.findOne({
      where,
      relations: ['company'],
      select: options.select,
    });
  }

  private async requireAdminAgent(authorization?: string) {
    const payload = await this.getTokenPayload(authorization);

    if (!payload.agentId) {
      throw new UnauthorizedException(
        'Gestao de equipe disponivel apenas para usuarios autenticados.',
      );
    }

    const agent = await this.loadAuthenticatedAgent(payload, payload.sub, {
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        company: { id: true },
      },
    });

    if (!agent || !agent.active) {
      throw new UnauthorizedException('Agente nao encontrado ou bloqueado.');
    }

    if (agent.role !== 'admin' && agent.role !== 'super_admin') {
      throw new UnauthorizedException(
        'Apenas administradores podem gerenciar a equipe.',
      );
    }

    // Multi-tenant: a gestao de equipe deve operar na empresa ATIVA do token
    // (payload.sub = companyId ativo, definido no login e no switch-company),
    // NAO na empresa-casa do agente. Para super_admin, loadAuthenticatedAgent
    // relaxa o filtro de company e acaba anexando a empresa-casa via relation
    // (ex.: Fibras), o que fazia a listagem/criacao/gestao de agentes ignorar a
    // empresa selecionada no dropdown e sempre mostrar os agentes da empresa
    // default. Forcamos aqui a empresa ativa. Para os demais papeis, payload.sub
    // ja e a propria empresa (loadAuthenticatedAgent filtra por ela), entao isto
    // e um no-op.
    if (payload.sub && agent.company?.id !== payload.sub) {
      agent.company = { id: payload.sub } as Company;
    }

    return agent;
  }

  private async ensureCompanyHasAnotherAdmin(
    companyId: string,
    excludingAgentId: string,
  ) {
    // super_admin conta como admin para a invariante de "ao menos um admin ativo".
    const adminCount = await this.agentRepository.count({
      where: {
        company: { id: companyId },
        role: In(['admin', 'super_admin']),
        active: true,
      },
    });

    const targetIsActiveAdmin = await this.agentRepository.exists({
      where: {
        id: excludingAgentId,
        company: { id: companyId },
        role: In(['admin', 'super_admin']),
        active: true,
      },
    });

    if (targetIsActiveAdmin && adminCount <= 1) {
      throw new BadRequestException(
        'A empresa precisa manter ao menos um administrador ativo.',
      );
    }
  }

  private parseCompanyConfig(config: Company['config'] | string | null | undefined) {
    if (!config) return {};
    if (typeof config === 'string') {
      try {
        return JSON.parse(config) as Record<string, unknown>;
      } catch {
        return {};
      }
    }

    return config;
  }

  private isLikelyEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value ?? '').trim());
  }

  private mapMaestroRoleToAgentRole(role: string | number | null | undefined): AgentRole {
    if (typeof role === 'number') {
      return role > 0 ? 'admin' : 'operator';
    }

    const normalizedRole = String(role ?? '').trim().toLowerCase();
    const numericRole = Number(normalizedRole);
    if (Number.isFinite(numericRole)) {
      return numericRole > 0 ? 'admin' : 'operator';
    }

    return normalizedRole.includes('admin') ? 'admin' : 'operator';
  }

  private normalizeImportedPasswordHash(passwordHash: string | null | undefined) {
    const normalized = String(passwordHash ?? '').trim();
    return /^\$2[aby]\$\d{2}\$/.test(normalized) ? normalized : null;
  }

  private normalizeImportedAgentName(
    name: string | null | undefined,
    email: string | null | undefined,
  ) {
    const normalizedName = String(name ?? '').trim();
    const normalizedEmail = String(email ?? '').trim().toLowerCase();

    if (!normalizedName) {
      return null;
    }

    if (normalizedEmail && normalizedName.toLowerCase() === normalizedEmail) {
      return null;
    }

    return normalizedName;
  }

  private normalizePromiseAutomationSettings(
    config: Company['config'] | string | null | undefined,
  ): PromiseAutomationSettings {
    const parsedConfig = this.parseCompanyConfig(config);
    const rawSettings = parsedConfig.promiseAutomation as
      | Partial<PromiseAutomationSettings>
      | undefined;

    const reminderTiming =
      rawSettings?.reminderTiming === 'same_day' ||
      rawSettings?.reminderTiming === 'both'
        ? rawSettings.reminderTiming
        : 'day_before';

    return {
      reminderEnabled: Boolean(rawSettings?.reminderEnabled ?? false),
      reminderTiming,
      autoBreakEnabled: Boolean(rawSettings?.autoBreakEnabled ?? false),
      checkPaymentBeforeBreak: Boolean(
        rawSettings?.checkPaymentBeforeBreak ?? true,
      ),
      reminderTemplateId:
        typeof rawSettings?.reminderTemplateId === 'string' &&
        rawSettings.reminderTemplateId.trim()
          ? rawSettings.reminderTemplateId.trim()
          : null,
      reminderTemplateName:
        typeof rawSettings?.reminderTemplateName === 'string' &&
        rawSettings.reminderTemplateName.trim()
          ? rawSettings.reminderTemplateName.trim()
          : null,
    };
  }

}
