import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AgentRole } from '../../agents/entities/agent.entity';

type JwtPayload = {
  sub?: string;
  account?: string;
  agentId?: string;
  agentRole?: AgentRole;
  agentActive?: boolean;
};

/**
 * Guarda de rota que exige que o agente autenticado tenha role `super_admin`.
 * Lida exclusivamente com endpoints globais (visiveis em todas as empresas),
 * por isso bypassa o filtro de companyId esperado nos demais modulos.
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  private readonly logger = new Logger(SuperAdminGuard.name);

  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string>; user?: JwtPayload }>();

    const auth = String(request.headers?.['authorization'] ?? '');
    const [scheme, token] = auth.split(' ');

    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Token nao informado');
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Token invalido ou expirado');
    }

    if (!payload.agentId || payload.agentActive === false) {
      throw new UnauthorizedException('Sessao invalida.');
    }

    if (payload.agentRole !== 'super_admin') {
      this.logger.warn(
        `[SuperAdminGuard] acesso negado para agentId=${payload.agentId} role=${payload.agentRole}`,
      );
      throw new ForbiddenException(
        'Endpoint restrito a super administradores.',
      );
    }

    request.user = payload;
    return true;
  }
}
