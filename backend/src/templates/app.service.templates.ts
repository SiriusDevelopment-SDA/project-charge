import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, ILike, IsNull, Not, Repository } from 'typeorm';

import { Templates } from './entities/templatesMeta';
import {
  DispatchBatchStatusDto,
  LatestDispatchBatchReportDto,
  SearchRequestDtoRelatories,
  SearchRequestDtoTemplates,
  SendTemplateDto,
  TemplateUsageRequestDto,
} from './dto/search.request.dto.templates';
import { RelatoryDispatchTemplate } from './entities/relatory.entity';
import { DeleteTemplateDto } from './dto/delete.request.dto.templates';
import { CreateTemplateDTO } from './dto/create.request.dto.template';
import { Company } from '../companies/entities/companies';
import { CampaignMetricsGateway } from '../realtime/campaigns-metrics.gateway';
import { MessageQueueService } from '../message-queue/message-queue.service';
import type { MessageQueuePayload } from '../message-queue/entities/message-queue.entity';
import { DispatchBatch } from '../message-queue/entities/dispatch-batch.entity';

@Injectable()
export class AppServiceTemplate {
  private readonly logger = new Logger(AppServiceTemplate.name);

  constructor(
    @InjectRepository(Templates)
    private templateRepository: Repository<Templates>,

    @InjectRepository(RelatoryDispatchTemplate)
    private readonly relatoryDispatchRepository: Repository<RelatoryDispatchTemplate>,

    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,

    private readonly campaignMetricsGateway: CampaignMetricsGateway,
    private readonly messageQueueService: MessageQueueService,
  ) {}

  async getTemplates(dto: SearchRequestDtoTemplates) {
    const { account, page, limit, sortorder, query } = dto;
    const safeLimit = limit > 0 ? limit : 10;
    const safePage = page > 0 ? page : 1;
    const skip = (safePage - 1) * safeLimit;

    const order = sortorder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const where: FindOptionsWhere<Templates> = {
      company: {
        account_chatwoot: String(account),
      },
    };

    if (query) where.name = ILike(`%${query}%`);

    const [data, total] = await this.templateRepository.findAndCount({
      where,
      relations: {
        company: true,
      },
      select: {
        company: {
          id: true,
          account_chatwoot: true,
          name: true,
        },
      },
      skip,
      take: safeLimit,
      order: {
        createdAt: order,
      },
    });

    return { page: safePage, total, data };
  }

  async getTemplateUsage(dto: TemplateUsageRequestDto) {
    const account = String(dto.account);
    let rows: Array<{
      templateId: string;
      templateName: string;
      historicalUsage: string | number;
      activeUsage: string | number;
      totalUsage: string | number;
    }> = [];

    try {
      rows = await this.templateRepository.manager.query(
        `
          WITH historical_usage AS (
            SELECT
              r."templateId" AS "templateId",
              COUNT(*)::int AS "historicalUsage"
            FROM relatory_dispatch_template r
            INNER JOIN company c
              ON c.id = r."companyId"
            WHERE c.account_chatwoot = $1
            GROUP BY r."templateId"
          ),
          active_usage AS (
            SELECT
              b."templateId" AS "templateId",
              SUM(GREATEST(b."totalRecipients" - b."processedRecipients", 0))::int AS "activeUsage"
            FROM dispatch_batch b
            INNER JOIN company c
              ON c.id = b."companyId"
            WHERE c.account_chatwoot = $1
              AND b.status IN ('queued', 'processing')
              AND b."templateId" IS NOT NULL
            GROUP BY b."templateId"
          )
          SELECT
            t.id AS "templateId",
            t.name AS "templateName",
            COALESCE(h."historicalUsage", 0)::int AS "historicalUsage",
            COALESCE(a."activeUsage", 0)::int AS "activeUsage",
            (
              COALESCE(h."historicalUsage", 0) +
              COALESCE(a."activeUsage", 0)
            )::int AS "totalUsage"
          FROM templates t
          INNER JOIN company c
            ON c.id = t."companyId"
          LEFT JOIN historical_usage h
            ON h."templateId" = t.id
          LEFT JOIN active_usage a
            ON a."templateId" = t.id
          WHERE c.account_chatwoot = $1
            AND t."isEnabled" = true
          ORDER BY "totalUsage" DESC, t.name ASC
        `,
        [account],
      ) as Array<{
        templateId: string;
        templateName: string;
        historicalUsage: string | number;
        activeUsage: string | number;
        totalUsage: string | number;
      }>;
    } catch {
      rows = await this.templateRepository.manager.query(
        `
          WITH historical_usage AS (
            SELECT
              r."templateId" AS "templateId",
              COUNT(*)::int AS "historicalUsage"
            FROM relatory_dispatch_template r
            INNER JOIN company c
              ON c.id = r."companyId"
            WHERE c.account_chatwoot = $1
            GROUP BY r."templateId"
          )
          SELECT
            t.id AS "templateId",
            t.name AS "templateName",
            COALESCE(h."historicalUsage", 0)::int AS "historicalUsage",
            0::int AS "activeUsage",
            COALESCE(h."historicalUsage", 0)::int AS "totalUsage"
          FROM templates t
          INNER JOIN company c
            ON c.id = t."companyId"
          LEFT JOIN historical_usage h
            ON h."templateId" = t.id
          WHERE c.account_chatwoot = $1
            AND t."isEnabled" = true
          ORDER BY "totalUsage" DESC, t.name ASC
        `,
        [account],
      ) as Array<{
        templateId: string;
        templateName: string;
        historicalUsage: string | number;
        activeUsage: string | number;
        totalUsage: string | number;
      }>;
    }

    const normalizedRows = rows.map((row) => ({
      templateId: row.templateId,
      templateName: row.templateName,
      historicalUsage: Number(row.historicalUsage) || 0,
      activeUsage: Number(row.activeUsage) || 0,
      totalUsage: Number(row.totalUsage) || 0,
    }));

    const totalUsageAllTemplates = normalizedRows.reduce(
      (sum, row) => sum + row.totalUsage,
      0,
    );

    return normalizedRows.map((row) => ({
      ...row,
      usagePercentage:
        totalUsageAllTemplates > 0
          ? Number(((row.totalUsage * 100) / totalUsageAllTemplates).toFixed(1))
          : 0,
    }));
  }

  /**
   * Enqueues a template dispatch batch.
   * The actual HTTP calls to NotificaMe are handled by MessageQueueWorker.
   */
  async sendTemplate(data: SendTemplateDto) {
    const { templateId, account, to, campaignId } = data;

    const template = await this.templateRepository.findOne({
      where: {
        id: templateId,
        company: { account_chatwoot: String(account) },
      },
      relations: { company: true },
      select: {
        id: true,
        company: {
          id: true,
          canalId_notificameHub: true,
          token_notificameHub: true,
        },
      },
    });

    if (!template) throw new NotFoundException('Template nao encontrado');

    if (!template.company?.canalId_notificameHub || !template.company?.token_notificameHub) {
      throw new BadRequestException(
        'Empresa nao possui integracao ativa com a NotificaMe.',
      );
    }

    if (!to.length) {
      throw new BadRequestException('Nenhum destinatario informado para envio.');
    }

    const recipients: MessageQueuePayload[] = to.map((recipient) => ({
      number: recipient.number,
      name: recipient.name,
      components: Array.isArray(recipient.components) ? recipient.components : [],
    }));

    const { batch, skipped } = await this.messageQueueService.enqueueBatch({
      companyId: template.company.id,
      templateId,
      campaignId: campaignId ?? null,
      recipients,
      scope: campaignId ? 'campaign' : 'manual',
    });

    return { batchId: batch.id, queued: recipients.length - skipped, skipped };
  }

  async getLatestDispatchBatchReport(dto: LatestDispatchBatchReportDto) {
    const { account, manualOnly, campaignOnly } = dto;

    let scope: 'manual' | 'campaign' | undefined;
    if (manualOnly) scope = 'manual';
    else if (campaignOnly) scope = 'campaign';

    const batch = await this.messageQueueService.getLatestBatchByAccount(
      String(account),
      scope,
    );

    if (!batch) return { batch: null, records: [] };

    const [records, enriched] = await Promise.all([
      this.relatoryDispatchRepository.find({
        where: { batchId: batch.id },
        order: { createdAt: 'DESC' },
        take: 200,
      }),
      this.enrichBatch(batch),
    ]);

    return { batch: enriched, records };
  }

  async getDispatchBatchStatus(dto: DispatchBatchStatusDto) {
    const batch = await this.messageQueueService.getBatchById(dto.batchId);
    if (!batch) throw new NotFoundException('Lote nao encontrado');
    return this.enrichBatch(batch);
  }

  private async enrichBatch(batch: DispatchBatch) {
    const [counts, template] = await Promise.all([
      this.messageQueueService.getBatchCounts(batch.id),
      batch.templateId
        ? this.templateRepository.findOne({
            where: { id: batch.templateId },
            select: { name: true },
          })
        : Promise.resolve(null),
    ]);

    const progressPercentage =
      batch.totalRecipients > 0
        ? Math.round((batch.processedRecipients / batch.totalRecipients) * 100)
        : 0;

    const isTerminal = ['completed', 'partial', 'failed'].includes(batch.status);

    return {
      ...batch,
      templateName: template?.name ?? null,
      progressPercentage,
      successCount: counts.sent,
      failedCount: counts.failed,
      rateLimitPerSecond: 15,
      startedAt: batch.createdAt,
      finishedAt: isTerminal ? batch.updatedAt : null,
    };
  }

  async getRelatoriesDispatchTemplate(dto: SearchRequestDtoRelatories) {
    const { account, page, limit, sortorder, query, manualOnly, campaignOnly, batchId } = dto;
    const safeLimit = limit > 0 ? limit : 10;
    const safePage = page > 0 ? page : 1;
    const skip = (safePage - 1) * safeLimit;
    const order = sortorder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const where: FindOptionsWhere<RelatoryDispatchTemplate> | FindOptionsWhere<RelatoryDispatchTemplate>[] = {
      company: { account_chatwoot: String(account) },
      ...(batchId && { batchId }),
    };

    // Apply scope filter
    const baseWhere = { company: { account_chatwoot: String(account) }, ...(batchId && { batchId }) };
    let scopedWhere: FindOptionsWhere<RelatoryDispatchTemplate> | FindOptionsWhere<RelatoryDispatchTemplate>[] = baseWhere;

    if (manualOnly) scopedWhere = { ...baseWhere, campaign: IsNull() };
    else if (campaignOnly) scopedWhere = { ...baseWhere, campaign: Not(IsNull()) };

    const qb = this.relatoryDispatchRepository
      .createQueryBuilder('relatory')
      .leftJoin('relatory.company', 'company')
      .leftJoin('relatory.campaign', 'campaign')
      .where('company.account_chatwoot = :account', { account: String(account) })
      .orderBy('relatory.createdAt', order as 'ASC' | 'DESC')
      .skip(skip)
      .take(safeLimit);

    if (batchId) qb.andWhere('relatory.batchId = :batchId', { batchId });
    if (manualOnly) qb.andWhere('relatory.campaignId IS NULL');
    else if (campaignOnly) qb.andWhere('relatory.campaignId IS NOT NULL');

    if (query) {
      qb.andWhere(
        '(relatory.name ILIKE :q OR relatory.number ILIKE :q)',
        { q: `%${query}%` },
      );
    }

    const [data, total] = await qb.getManyAndCount();

    return { page: safePage, limit: safeLimit, total, data };
  }

  async disableTemplate(templateId: string) {
    const template = await this.templateRepository.findOne({
      where: { id: templateId, isEnabled: true },
    });

    if (!template) {
      throw new HttpException(
        'Template nao encontrado ou ja desativado',
        HttpStatus.NOT_FOUND,
      );
    }

    template.isEnabled = false;
    await this.templateRepository.save(template);

    return { statusCode: 204, message: 'Template desativado!' };
  }

  async createTemplate(companyId: string, dto: CreateTemplateDTO) {
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
      select: {
        id: true,
        canalId_notificameHub: true,
        token_notificameHub: true,
      },
    });

    if (!company) throw new NotFoundException('Empresa nao encontrada!');

    if (!company.canalId_notificameHub || !company.token_notificameHub) {
      throw new BadRequestException(
        'Empresa nao possui integracao ativa com a NotificaMe.',
      );
    }

    const channelIdentifier = String(company.canalId_notificameHub ?? '').trim();

    const payload = {
      from: channelIdentifier,
      contents: [
        {
          template: {
            name: dto.name,
            language: dto.language,
            category: dto.category,
            components: dto.components,
          },
        },
      ],
    };

    const response = await fetch(
      `https://api.notificame.com.br/v1/templates/${channelIdentifier}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Token': company.token_notificameHub,
        },
        body: JSON.stringify(payload),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new BadRequestException(`Erro ao criar template no meta: ${error}`);
    }

    const responseData = await response.json();
    const upstreamError = this.extractTemplateCreationError(responseData);

    if (upstreamError) {
      this.logger.error(
        `[createTemplate] NotificaMe/Meta retornou erro. Payload: ${JSON.stringify(payload)} | Resposta: ${JSON.stringify(responseData)}`,
      );
      throw new BadRequestException(
        `Erro ao criar template no meta: ${upstreamError}`,
      );
    }

    const { metaId, metaStatus } = this.extractCreatedTemplateMetadata(responseData);

    if (!metaId || !metaStatus) {
      this.logger.error(
        `[createTemplate] Resposta da NotificaMe sem meta_id/meta_status. Payload: ${JSON.stringify(payload)} | Resposta: ${JSON.stringify(responseData)}`,
      );
      throw new BadRequestException(
        'Resposta da NotificaMe sem id/status do template criado.',
      );
    }

    await this.templateRepository.save({
      active: true,
      category: dto.displayCategory ?? dto.category,
      isEnabled: true,
      language: dto.language,
      message:
        dto.components
          .filter((c) => c.type.toUpperCase() === 'BODY')
          .map((c) => c.text)[0] ?? '',
      meta_id: metaId,
      meta_status: metaStatus,
      variables: dto.variables,
      components: dto.components,
      company: { id: companyId },
      name: dto.name,
    });

    return responseData;
  }
  private extractTemplateCreationError(responseData: unknown) {
    if (!responseData || typeof responseData !== 'object' || Array.isArray(responseData)) {
      return '';
    }

    const root = responseData as Record<string, unknown>;
    const errorCandidate =
      root.error ??
      (Array.isArray(root.errors) ? root.errors[0] : undefined);

    if (!errorCandidate) {
      return '';
    }

    if (typeof errorCandidate === 'string') {
      return errorCandidate;
    }

    if (typeof errorCandidate !== 'object' || Array.isArray(errorCandidate)) {
      return JSON.stringify(errorCandidate);
    }

    const errorRecord = errorCandidate as Record<string, unknown>;
    const messageParts = [
      errorRecord.message,
      errorRecord.error_user_title,
      errorRecord.error_user_msg,
    ]
      .map((value) => String(value ?? '').trim())
      .filter(Boolean);

    if (messageParts.length > 0) {
      return Array.from(new Set(messageParts)).join(' | ');
    }

    return JSON.stringify(errorRecord);
  }

  private extractCreatedTemplateMetadata(responseData: unknown) {
    const candidates = this.collectTemplateResponseCandidates(responseData);

    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
        continue;
      }

      const record = candidate as Record<string, unknown>;
      const rawId =
        record.id ??
        record.templateId ??
        record.template_id ??
        record.meta_id;
      const rawStatus =
        record.status ??
        record.templateStatus ??
        record.template_status ??
        record.meta_status;

      const metaId =
        rawId === undefined || rawId === null ? '' : String(rawId).trim();
      const metaStatus =
        rawStatus === undefined || rawStatus === null
          ? ''
          : String(rawStatus).trim();

      if (metaId || metaStatus) {
        return {
          metaId,
          metaStatus,
        };
      }
    }

    return {
      metaId: '',
      metaStatus: '',
    };
  }

  private collectTemplateResponseCandidates(responseData: unknown): unknown[] {
    if (!responseData || typeof responseData !== 'object') {
      return [responseData];
    }

    const root = responseData as Record<string, unknown>;
    const data = root.data;
    const result = root.result;
    const template = root.template;
    const contents = root.contents;

    return [
      root,
      template,
      data,
      result,
      Array.isArray(data) ? data[0] : undefined,
      Array.isArray(result) ? result[0] : undefined,
      Array.isArray(contents) ? contents[0] : undefined,
      Array.isArray(contents) && contents[0] && typeof contents[0] === 'object'
        ? (contents[0] as Record<string, unknown>).template
        : undefined,
      data && typeof data === 'object' && !Array.isArray(data)
        ? (data as Record<string, unknown>).template
        : undefined,
      data && typeof data === 'object' && !Array.isArray(data)
        ? (data as Record<string, unknown>).result
        : undefined,
    ];
  }

  async getTemplateOrFail(templateId: string) {
    const template = await this.templateRepository.findOne({
      where: { id: templateId, isEnabled: true },
    });

    if (!template) {
      throw new NotFoundException({
        code: 'TEMPLATE_NOT_FOUND',
        message: 'Template nao encontrado',
        field: 'templateId',
      });
    }

    return template;
  }

  extractRequiredTemplateVars(template: Templates): string[] {
    try {
      const vars =
        typeof template.variables === 'string'
          ? JSON.parse(template.variables)
          : template.variables || {};
      return Object.values(vars) as string[];
    } catch {
      throw new UnprocessableEntityException({
        code: 'TEMPLATE_VARIABLES_INVALID',
        message: 'Variaveis do template estao invalidas',
      });
    }
  }
}
