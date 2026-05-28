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
    const company = await this.companyRepository.findOne({
      where: {
        account_chatwoot: String(dto.account),
      },
      select: {
        id: true,
        name: true,
        account_chatwoot: true,
        token_system_coraxy: true,
        active: true,
        config: true,
      },
    });

    if (!company || company.token_system_coraxy !== dto.token) {
      throw new UnauthorizedException('Credenciais de embed invalidas');
    }

    return this.buildAuthResponse(
      company.id,
      company.name,
      company.account_chatwoot,
      company.active,
      undefined,
      this.extractPagePermissions(company.config),
    );
  }

  async loginChatwoot(dto: ChatwootLoginDto) {
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

    if (!company) {
      throw new UnauthorizedException('Empresa não encontrada para esta account.');
    }

    const chatwootBaseUrl = String(
      this.configService.get<string>('CHATWOOT_BASE_URL') ?? '',
    ).replace(/\/+$/, '');

    if (!chatwootBaseUrl) {
      throw new UnauthorizedException('CHATWOOT_BASE_URL não configurada no backend.');
    }

    const profile = await this.fetchChatwootProfile(chatwootBaseUrl, dto.chatwoot_token);

    // Confere se o usuário pertence à account requisitada (anti-tampering).
    const userAccountIds = Array.isArray(profile.accounts)
      ? profile.accounts.map((a: { id: number | string }) => String(a.id))
      : [];
    if (!userAccountIds.includes(String(dto.account))) {
      throw new UnauthorizedException(
        'Usuário não pertence à account informada.',
      );
    }

    const email = String(profile.email ?? '').toLowerCase().trim();
    const name = String(profile.name ?? '').trim() || email;
    const chatwootUserId =
      typeof profile.id === 'number' ? profile.id : Number(profile.id);

    if (!email || !chatwootUserId || Number.isNaN(chatwootUserId)) {
      throw new UnauthorizedException('Perfil Chatwoot inválido.');
    }

    // Upsert do agente. Email é UNIQUE global — se existir em outra empresa,
    // bloqueia (não permitimos um mesmo email autenticar em empresas diferentes).
    let agent = await this.agentRepository.findOne({
      where: { email },
      relations: ['company'],
    });

    if (agent && agent.company?.id !== company.id) {
      throw new UnauthorizedException(
        'Este e-mail já está registrado em outra empresa.',
      );
    }

    if (!agent) {
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

    // E5: super_admin sempre cai na empresa default (Fibras do Rio) no
    // primeiro acesso, ignorando o `account` da URL. Frontend pode trocar
    // via /auth/switch-company (E4).
    const defaultCompany = await this.resolveSuperAdminDefaultCompany(agent);
    const targetCompany = defaultCompany ?? company;

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
    const company = await this.companyRepository.findOne({
      where: { id: actingAgent.company.id },
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

    const accountAgents = await this.chatwootService.listCompanyAgentsFromWebhook(company.id);
    const normalizedRemoteEmails = Array.from(
      new Set(
        accountAgents
          .map((agent) => agent.email.toLowerCase().trim())
          .filter((email) => this.isLikelyEmail(email)),
      ),
    );
    const localAgents = await this.agentRepository.find({
      where: { company: { id: actingAgent.company.id } },
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
                await this.ensureCompanyHasAnotherAdmin(actingAgent.company.id, existing.id);
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
        existingInAnotherCompany.company.id !== actingAgent.company.id
      ) {
        skipped += 1;
        emailConflictSkipped += 1;
        conflictingEmails.push(normalizedEmail);
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
        company: { id: actingAgent.company.id },
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

  private extractPagePermissions(config: Record<string, any> | null) {
    const cfg = (config as Record<string, any>) ?? {};
    return {
      dashboard: cfg.page_dashboard !== false,
      clientesVencidos: cfg.page_clientesVencidos !== false,
      chat: cfg.page_chat !== false,
    };
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
