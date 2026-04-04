import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../companies/entities/companies';
import {
  CreateAgentDto,
  EmbedLoginDto,
  LoginAgentDto,
  ManageAgentDto,
  PromiseReminderTiming,
  UpdatePromiseAutomationSettingsDto,
  UpdateProfileDto,
} from './dto/auth.dto';
import { JwtService } from '@nestjs/jwt';
import { Agent, type AgentRole } from '../agents/entities/agent.entity';
import { compare, hash } from 'bcryptjs';
import { Templates } from '../templates/entities/templatesMeta';
import { ClientInteraction } from '../client-interaction/entities/client-interaction.entity';

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

    return this.buildAuthResponse(
      agent.company.id,
      agent.company.name,
      agent.company.account_chatwoot,
      agent.company.active,
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
    );
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

    const created = this.agentRepository.create({
      name: dto.name.trim(),
      email: normalizedEmail,
      passwordHash,
      role: dto.role === 'admin' ? 'admin' : 'operator',
      active: true,
      company: { id: companyId },
    });

    const saved = await this.agentRepository.save(created);
    return {
      success: true,
      agent: {
        id: saved.id,
        name: saved.name,
        email: saved.email,
        role: saved.role,
        active: saved.active,
        createdAt: saved.createdAt,
        updatedAt: saved.updatedAt,
        companyId,
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
      ? await this.agentRepository.findOne({
          where: {
            id: payload.agentId,
            company: { id: company.id },
          },
          relations: ['company'],
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

    const agent = await this.agentRepository.findOne({
      where: {
        id: payload.agentId,
        company: { id: payload.sub },
      },
      relations: ['company'],
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
        company: { id: true },
      },
    });

    if (!agent) {
      throw new NotFoundException('Agente nao encontrado para esta empresa.');
    }

    const isSelf = agent.id === actingAgent.id;
    const nextRole = dto.role ?? agent.role;
    const nextActive = dto.active ?? agent.active;

    if (isSelf && dto.active === false) {
      throw new BadRequestException('Voce nao pode bloquear o proprio usuario.');
    }

    if (isSelf && dto.role && dto.role !== agent.role) {
      throw new BadRequestException('Voce nao pode alterar a propria role.');
    }

    if (agent.role === 'admin' && (nextRole !== 'admin' || nextActive === false)) {
      await this.ensureCompanyHasAnotherAdmin(actingAgent.company.id, agent.id);
    }

    agent.role = nextRole;
    agent.active = nextActive;

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

    if (agent.role === 'admin' && agent.active) {
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

  private async requireAdminAgent(authorization?: string) {
    const payload = await this.getTokenPayload(authorization);

    if (!payload.agentId) {
      throw new UnauthorizedException(
        'Gestao de equipe disponivel apenas para usuarios autenticados.',
      );
    }

    const agent = await this.agentRepository.findOne({
      where: {
        id: payload.agentId,
        company: { id: payload.sub },
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

    if (!agent || !agent.active) {
      throw new UnauthorizedException('Agente nao encontrado ou bloqueado.');
    }

    if (agent.role !== 'admin') {
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
    const adminCount = await this.agentRepository.count({
      where: {
        company: { id: companyId },
        role: 'admin',
        active: true,
      },
    });

    const targetIsActiveAdmin = await this.agentRepository.exists({
      where: {
        id: excludingAgentId,
        company: { id: companyId },
        role: 'admin',
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
