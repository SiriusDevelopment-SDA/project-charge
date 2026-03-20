import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../companies/entities/companies';
import { CreateAgentDto, EmbedLoginDto, LoginAgentDto } from './dto/auth.dto';
import { JwtService } from '@nestjs/jwt';
import { Agent } from '../agents/entities/agent.entity';
import { compare, hash } from 'bcryptjs';

type JwtPayload = {
  sub: string;
  account: string;
  name: string;
  agentId?: string;
  agentName?: string;
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
      {
        agentId: agent.id,
        agentName: agent.name ?? agent.email,
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
      },
    });

    if (!company || company.token_system_coraxy !== dto.token) {
      throw new UnauthorizedException('Credenciais de embed invalidas');
    }

    return this.buildAuthResponse(company.id, company.name, company.account_chatwoot);
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
    const token = String(authorization ?? '')
      .replace(/^Bearer\s+/i, '')
      .trim();

    if (!token) {
      throw new UnauthorizedException('Token nao informado');
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Token invalido');
    }

    const company = await this.companyRepository.findOne({
      where: { id: payload.sub, account_chatwoot: String(payload.account) },
      select: { id: true, name: true, account_chatwoot: true, cnpj: true },
    });

    if (!company) {
      throw new UnauthorizedException('Empresa nao encontrada');
    }

    return {
      success: true,
      company: {
        id: company.id,
        name: company.name,
        account: company.account_chatwoot,
        cnpj: company.cnpj ?? '',
      },
      agent: payload.agentId
        ? {
            id: payload.agentId,
            name: payload.agentName ?? null,
          }
        : null,
    };
  }

  private async buildAuthResponse(
    companyId: string,
    companyName: string,
    companyAccount: string,
    agent?: { agentId?: string; agentName?: string },
  ) {
    const payload: JwtPayload = {
      sub: companyId,
      account: companyAccount,
      name: companyName,
      agentId: agent?.agentId,
      agentName: agent?.agentName,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    return {
      success: true,
      accessToken,
      company: {
        id: companyId,
        name: companyName,
        account: companyAccount,
      },
      agent: agent?.agentId
        ? {
            id: agent.agentId,
            name: agent.agentName ?? null,
          }
        : null,
    };
  }
}
