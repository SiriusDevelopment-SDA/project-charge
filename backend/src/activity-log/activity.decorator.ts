import { SetMetadata } from '@nestjs/common';
import type { ActivityCategory } from './entities/activity-log.entity';

export interface ActivityMeta {
  /** Categoria da ação (create/edit/delete/execute/auth/other). */
  category: ActivityCategory;
  /** Rótulo legível fixo, ex.: "Disparou campanha". */
  action: string;
  /** Tipo do alvo, ex.: "campaign". Opcional. */
  entity?: string;
}

export const ACTIVITY_META_KEY = 'activity:meta';
export const ACTIVITY_SKIP_KEY = 'activity:skip';

/**
 * Marca um handler para ser registrado no histórico geral com rótulo próprio.
 * Necessário nos POSTs de criação/execução (o interceptor NÃO loga POST sozinho,
 * porque neste sistema POST também é usado para busca). Também pode sobrepor a
 * categoria automática de um PATCH/DELETE (ex.: reset de senha é 'execute').
 */
export const Activity = (meta: ActivityMeta) =>
  SetMetadata(ACTIVITY_META_KEY, meta);

/** Impede o registro de um handler no histórico (ex.: rotas ruidosas). */
export const NoActivityLog = () => SetMetadata(ACTIVITY_SKIP_KEY, true);
