import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Observable, tap } from 'rxjs';
import { ActivityLogService } from './activity-log.service';
import {
  ACTIVITY_META_KEY,
  ACTIVITY_SKIP_KEY,
  type ActivityMeta,
} from './activity.decorator';
import type { ActivityCategory } from './entities/activity-log.entity';

/** Verbos que auto-registram (mutação inequívoca). POST fica de fora (é usado
 * também para busca) — POST loga só via @Activity. */
const AUTO_CATEGORY_BY_METHOD: Record<string, ActivityCategory> = {
  PATCH: 'edit',
  PUT: 'edit',
  DELETE: 'delete',
};

const VERB_LABEL: Record<ActivityCategory, string> = {
  create: 'Criou',
  edit: 'Editou',
  delete: 'Excluiu',
  execute: 'Executou',
  auth: 'Acesso',
  other: 'Ação em',
};

/** Nome amigável do recurso a partir do 1º segmento estático da rota. */
const RESOURCE_LABEL: Record<string, string> = {
  campaigns: 'campanha',
  templates: 'template',
  clients: 'cliente',
  agents: 'agente',
  me: 'perfil',
  categories: 'categoria',
  services: 'serviço',
  companies: 'empresa',
  'payment-promise': 'promessa de pagamento',
  invoices: 'fatura',
  chatwoot: 'chatwoot',
  'client-interaction': 'interação',
};

@Injectable()
export class ActivityLogInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly activityLog: ActivityLogService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // Só HTTP (ignora WebSocket gateways).
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const skip = this.reflector.getAllAndOverride<boolean>(ACTIVITY_SKIP_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) {
      return next.handle();
    }

    const meta = this.reflector.getAllAndOverride<ActivityMeta | undefined>(
      ACTIVITY_META_KEY,
      [context.getHandler(), context.getClass()],
    );

    const request = context.switchToHttp().getRequest();
    const method = String(request?.method ?? '').toUpperCase();

    // Categoria: @Activity manda; senão auto por verbo (PATCH/PUT/DELETE).
    const category: ActivityCategory | undefined =
      meta?.category ?? AUTO_CATEGORY_BY_METHOD[method];

    // Sem categoria (GET, POST sem @Activity, etc.) → não registra.
    if (!category) {
      return next.handle();
    }

    // Autor: decodifica o JWT. Sem token válido (rota pública) → não registra.
    const actor = this.resolveActor(request?.headers?.authorization);
    if (!actor) {
      return next.handle();
    }

    const rawPath = String(request?.originalUrl ?? request?.url ?? '').split('?')[0];
    const resource = this.resolveResource(rawPath);
    const entityId = this.resolveEntityId(request?.params);
    const action =
      meta?.action ??
      `${VERB_LABEL[category]} ${RESOURCE_LABEL[resource] ?? resource}`;

    return next.handle().pipe(
      tap({
        next: () => {
          const statusCode = context.switchToHttp().getResponse()?.statusCode;
          // fire-and-forget: record() nunca lança
          void this.activityLog.record({
            companyId: actor.companyId,
            agentId: actor.agentId,
            agentEmail: actor.agentEmail,
            agentName: actor.agentName,
            category,
            action,
            entity: meta?.entity ?? resource,
            entityId,
            method,
            path: rawPath.slice(0, 255),
            statusCode: typeof statusCode === 'number' ? statusCode : null,
          });
        },
      }),
    );
  }

  private resolveActor(authorization: unknown): {
    companyId: string | null;
    agentId: string | null;
    agentEmail: string | null;
    agentName: string | null;
  } | null {
    const token = String(authorization ?? '')
      .replace(/^Bearer\s+/i, '')
      .trim();
    if (!token) return null;
    try {
      const p = this.jwtService.verify<Record<string, any>>(token);
      return {
        companyId: p.sub ? String(p.sub) : null,
        agentId: p.agentId ? String(p.agentId) : null,
        agentEmail: p.agentEmail ? String(p.agentEmail) : null,
        agentName: p.agentName ? String(p.agentName) : null,
      };
    } catch {
      return null;
    }
  }

  /** 1º segmento estático após /api; se for "auth", usa o seguinte (agents/me). */
  private resolveResource(path: string): string {
    const segments = path
      .split('/')
      .filter((s) => s && s !== 'api');
    let resource = segments[0] ?? '';
    if (resource === 'auth' && segments[1]) {
      resource = segments[1];
    }
    return resource;
  }

  private resolveEntityId(params: unknown): string | null {
    if (!params || typeof params !== 'object') return null;
    const values = Object.values(params as Record<string, unknown>)
      .map((v) => (v == null ? '' : String(v)))
      .filter(Boolean);
    return values[0] ?? null;
  }
}
