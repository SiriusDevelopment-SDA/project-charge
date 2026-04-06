import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AppServiceTemplate } from './app.service.templates';

@Injectable()
export class TemplateStatusSyncCron {
  private readonly logger = new Logger(TemplateStatusSyncCron.name);

  constructor(private readonly templateService: AppServiceTemplate) {}

  // Roda a cada 5 minutos (horario de Brasilia)
  @Cron('0 */5 * * * *', { timeZone: 'America/Sao_Paulo' })
  async syncTemplateStatuses(): Promise<void> {
    this.logger.verbose('[TemplateStatusSync] Iniciando sincronizacao de status dos templates');

    try {
      const result = await this.templateService.syncAllTemplateStatuses();

      if (result.total === 0) {
        this.logger.verbose('[TemplateStatusSync] Nenhum template ativo encontrado para sincronizar');
        return;
      }

      this.logger.log(
        `[TemplateStatusSync] Sincronizacao concluida. Templates verificados: ${result.total}. Status atualizados: ${result.updated}.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[TemplateStatusSync] Falha ao sincronizar status dos templates: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
