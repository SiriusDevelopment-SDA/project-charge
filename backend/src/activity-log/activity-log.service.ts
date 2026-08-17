import {
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import { ActivityLog } from './entities/activity-log.entity';
import { SearchActivityLogDto } from './dto/search-activity-log.dto';

export interface ActivityRecordInput {
  companyId?: string | null;
  agentId?: string | null;
  agentEmail?: string | null;
  agentName?: string | null;
  category: ActivityLog['category'];
  action: string;
  entity?: string | null;
  entityId?: string | null;
  method?: string | null;
  path?: string | null;
  statusCode?: number | null;
  metadata?: Record<string, unknown> | null;
}

@Injectable()
export class ActivityLogService {
  private readonly logger = new Logger(ActivityLogService.name);

  constructor(
    @InjectRepository(ActivityLog)
    private readonly repo: Repository<ActivityLog>,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Grava um registro de auditoria. NUNCA lança: o histórico é acessório e não
   * pode derrubar a requisição que o originou (o interceptor chama sem await).
   */
  async record(input: ActivityRecordInput): Promise<void> {
    try {
      await this.repo.insert({
        companyId: input.companyId ?? null,
        agentId: input.agentId ?? null,
        agentEmail: input.agentEmail ?? null,
        agentName: input.agentName ?? null,
        category: input.category,
        action: input.action,
        entity: input.entity ?? null,
        entityId: input.entityId ?? null,
        method: input.method ?? null,
        path: input.path ?? null,
        statusCode: input.statusCode ?? null,
        // cast: TypeORM interpreta coluna jsonb (Record) como entidade aninhada
        // no QueryDeepPartialEntity; o valor é gravado como-está.
        metadata: (input.metadata ?? null) as object,
      });
    } catch (error) {
      this.logger.warn(
        `Falha ao gravar activity_log: ${(error as Error)?.message}`,
      );
    }
  }

  /**
   * Lista o histórico da empresa em contexto (payload.sub), com filtros por
   * categoria, autor/ação/alvo e período, paginado. Acesso restrito a
   * admin/super_admin (auditoria administrativa).
   */
  async search(authorization: string | undefined, dto: SearchActivityLogDto) {
    const payload = this.decode(authorization);
    const role = String(payload.agentRole ?? '');
    if (role !== 'admin' && role !== 'super_admin') {
      throw new ForbiddenException(
        'Apenas administradores podem ver o histórico geral.',
      );
    }

    const companyId = String(payload.sub ?? '');
    const safeLimit = dto.limit && dto.limit > 0 ? dto.limit : 50;
    const safePage = dto.page && dto.page > 0 ? dto.page : 1;
    const skip = (safePage - 1) * safeLimit;
    const order = dto.sortorder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const qb = this.repo
      .createQueryBuilder('a')
      .where('a.company_id = :companyId', { companyId })
      .orderBy('a.created_at', order as 'ASC' | 'DESC')
      .skip(skip)
      .take(safeLimit);

    if (dto.categories?.length) {
      qb.andWhere('a.category IN (:...categories)', {
        categories: dto.categories,
      });
    }

    if (dto.query?.trim()) {
      qb.andWhere(
        '(a.action ILIKE :q OR a.agent_email ILIKE :q OR a.agent_name ILIKE :q OR a.entity ILIKE :q)',
        { q: `%${dto.query.trim()}%` },
      );
    }

    if (dto.dateFrom) {
      qb.andWhere('a.created_at >= :dateFrom', {
        dateFrom: `${dto.dateFrom} 00:00:00`,
      });
    }
    if (dto.dateTo) {
      qb.andWhere('a.created_at <= :dateTo', {
        dateTo: `${dto.dateTo} 23:59:59`,
      });
    }

    const [data, total] = await qb.getManyAndCount();
    return { page: safePage, limit: safeLimit, total, data };
  }

  private decode(authorization: string | undefined): Record<string, any> {
    const token = String(authorization ?? '').replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      throw new UnauthorizedException('Token não informado.');
    }
    try {
      return this.jwtService.verify(token);
    } catch {
      throw new UnauthorizedException('Token inválido ou expirado.');
    }
  }
}
