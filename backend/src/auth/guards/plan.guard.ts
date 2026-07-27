import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../../companies/entities/companies';
import { PaginaId, PAGINAS, resolvePagePermissions } from '../../companies/planos';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { REQUIRE_PAGE_KEY } from '../decorators/require-page.decorator';
import type { AgentRole } from '../../agents/entities/agent.entity';

type JwtPayload = {
  sub?: string;
  account?: string;
  agentId?: string;
  agentRole?: AgentRole;
};

/**
 * Bloqueia endpoints de paginas que a empresa nao tem no plano contratado.
 *
 * E o primeiro guard do sistema que decide por PRODUTO em vez de identidade:
 * `JwtAuthGuard` responde "esta autenticado?", `SuperAdminGuard` responde "e
 * super_admin?", e este responde "a empresa comprou isto?".
 *
 * Atua somente onde o handler declara `@RequirePage(...)` — handler sem o
 * decorator passa direto, entao ligar o guard nao muda nada por si so.
 */
@Injectable()
export class PlanGuard implements CanActivate {
  private readonly logger = new Logger(PlanGuard.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const pagina = this.reflector.getAllAndOverride<PaginaId | undefined>(
      REQUIRE_PAGE_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Handler nao declarou exigencia de pagina — nao e assunto deste guard.
    if (!pagina) return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string> }>();

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

    // super_admin transita entre empresas para operar e dar suporte, entao nao
    // e barrado pelo plano da empresa ativa — mesmo relaxamento que
    // `loadAuthenticatedAgent` ja faz para o filtro de companyId.
    if (payload.agentRole === 'super_admin') {
      this.logger.debug(
        `[PlanGuard] super_admin ignorando plano para "${pagina}" agentId=${payload.agentId} companyId=${payload.sub}`,
      );
      return true;
    }

    if (!payload.sub) {
      throw new UnauthorizedException('Sessao invalida.');
    }

    // Consulta direta: a tabela `company` tem poucas dezenas de linhas e a busca
    // e por chave primaria. Se um dia virar gargalo, o Redis ja esta no stack —
    // mas cachear agora seria otimizacao sem medicao, e o custo de um plano
    // desatualizado em cache e o cliente nao enxergar o que acabou de comprar.
    const company = await this.companyRepository.findOne({
      where: { id: payload.sub },
      select: { id: true, name: true, config: true },
    });

    if (!company) {
      throw new UnauthorizedException('Empresa nao encontrada.');
    }

    const permissoes = resolvePagePermissions(company.config);

    if (!permissoes[pagina]) {
      this.logger.warn(
        `[PlanGuard] acesso negado a "${pagina}" para ${company.name} (agentId=${payload.agentId})`,
      );
      throw new ForbiddenException(
        `A pagina "${PAGINAS[pagina].label}" nao esta incluida no plano desta empresa.`,
      );
    }

    return true;
  }
}
