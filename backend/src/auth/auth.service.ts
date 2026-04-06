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
  UpdateProfileDto,
} from './dto/auth.dto';
import { JwtService } from '@nestjs/jwt';
import { Agent } from '../agents/entities/agent.entity';
import { compare, hash } from 'bcryptjs';

type JwtPayload = {
  sub: string;
  account: string;
  name: string;
  agentId?: string;
  agentName?: string;
  agentEmail?: string;
};

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(Agent)
    private readonly agentRepository: Repository<Agent>,
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

  async createAgent(dto: CreateAgentDto) {
    const company = await this.companyRepository.findOne({
      where: { id: dto.companyId },
      select: { id: true },
    });

    if (!company) {
      throw new NotFoundException('Empresa nao encontrada');
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
      company: { id: dto.companyId },
    });

    const saved = await this.agentRepository.save(created);
    return {
      success: true,
      agent: {
        id: saved.id,
        name: saved.name,
        email: saved.email,
        companyId: dto.companyId,
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
      agent: agent
        ? {
            id: agent.id,
            name: agent.name ?? null,
            email: agent.email,
          }
        : null,
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
    },
  ) {
    const payload: JwtPayload = {
      sub: companyId,
      account: companyAccount,
      name: companyName,
      agentId: agent?.agentId,
      agentName: agent?.agentName,
      agentEmail: agent?.agentEmail,
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
}
