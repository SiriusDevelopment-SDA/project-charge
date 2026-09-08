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
import { FindOptionsWhere, ILike, In, IsNull, Not, Repository } from 'typeorm';

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
import type { NotificameChannel } from '../companies/entities/notificame-channel.type';
import { CampaignMetricsGateway } from '../realtime/campaigns-metrics.gateway';
import { MessageQueueService } from '../message-queue/message-queue.service';
import type { MessageQueuePayload } from '../message-queue/entities/message-queue.entity';
import { DispatchBatch } from '../message-queue/entities/dispatch-batch.entity';
import {
  TemplateDispatchPayloadService,
  type DispatchSkipRecord,
} from './template-dispatch-payload.service';

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
    private readonly templateDispatchPayload: TemplateDispatchPayloadService,
  ) {}

  /**
   * MC1: resolve o canal NotificaMe default da empresa (primeiro do array).
   * A seleção de canal por campanha/disparo é MC2.
   */
  private resolveDefaultChannel(
    channels: NotificameChannel[] | null | undefined,
  ): NotificameChannel | null {
    const channel = Array.isArray(channels) ? channels[0] : null;
    if (!channel?.id) return null;
    return channel;
  }

  /**
   * MC2: valida que o channelId escolhido pertence aos canais da empresa.
   * Retorna o id do canal resolvido (ou null quando não informado, deixando o
   * worker fazer fallback para o primeiro canal). Lança BadRequestException
   * quando o channelId não pertence à empresa.
   */
  private resolveSelectedChannelId(
    channels: NotificameChannel[] | null | undefined,
    channelId: string | null | undefined,
  ): string | null {
    const normalized = String(channelId ?? '').trim();
    if (!normalized) return null;

    const exists =
      Array.isArray(channels) &&
      channels.some((channel) => channel.id === normalized);

    if (!exists) {
      throw new BadRequestException(
        'O canal NotificaMe selecionado nao pertence a esta empresa.',
      );
    }

    return normalized;
  }

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

    await this.syncTemplateStatuses(data);

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
    const { templateId, account, to, campaignId, channelId } = data;

    const template = await this.templateRepository.findOne({
      where: {
        id: templateId,
        company: { account_chatwoot: String(account) },
      },
      relations: { company: true },
    });

    if (!template) throw new NotFoundException('Template nao encontrado');

    if (!this.resolveDefaultChannel(template.company?.canalId_notificameHub)) {
      throw new BadRequestException(
        'Empresa nao possui integracao ativa com a NotificaMe.',
      );
    }

    // MC2: valida o canal escolhido contra os canais da empresa (quando vier).
    const selectedChannelId = this.resolveSelectedChannelId(
      template.company?.canalId_notificameHub,
      channelId,
    );

    await this.refreshTemplateStatusForUsage(template);
    this.ensureTemplateApprovedForUsage(template);

    if (!to.length) {
      throw new BadRequestException('Nenhum destinatario informado para envio.');
    }

    const useServerBuild = to.every(
      (r) => !Array.isArray(r.components) || r.components.length === 0,
    );

    let recipients: MessageQueuePayload[];
    let dispatchSkips: DispatchSkipRecord[] = [];

    if (useServerBuild) {
      const rows = to.map((r) => {
        const plain = { ...r } as Record<string, unknown>;
        plain.whatsapp = r.number;
        if (r.name) plain.nome_cliente = r.name;
        if (r.templateVars) Object.assign(plain, r.templateVars);
        return plain;
      });
      const built = await this.templateDispatchPayload.buildQueueRecipients(
        template,
        template.company.id,
        rows,
      );
      recipients = built.recipients;
      dispatchSkips = built.skips;
      if (!recipients.length) {
        await this.templateDispatchPayload.persistDispatchSkips(
          template,
          template.company.id,
          campaignId ?? null,
          null,
          dispatchSkips,
        );
        // O ERP fora do ar tem que ser dito como tal: sem esta distincao a
        // mensagem culpa a fatura do cliente por uma indisponibilidade do
        // provedor, e o operador desiste de um disparo que so precisava esperar.
        const semRespostaDoErp = dispatchSkips.filter(
          (s) => s.reason === 'erp_unavailable',
        ).length;

        throw new BadRequestException(
          semRespostaDoErp
            ? `O ERP nao respondeu ao validar as faturas (${semRespostaDoErp} de ${dispatchSkips.length} destinatario(s)). Nenhuma mensagem foi enviada; tente novamente em alguns minutos. Detalhes no relatorio.`
            : dispatchSkips.length
              ? `Nenhum destinatario valido (${dispatchSkips.length} ignorado(s)): ${this.templateDispatchPayload.resumirSkips(dispatchSkips)}. Veja destinatario por destinatario no Historico.`
              : 'Nenhum destinatario valido apos montagem das variaveis no servidor.',
        );
      }
    } else {
      recipients = to.map((recipient) => ({
        number: recipient.number,
        name: recipient.name,
        components: this.normalizeDispatchComponents(
          Array.isArray(recipient.components) ? recipient.components : [],
          template.variables,
        ),
      }));
    }

    const { batch, skipped, dedupedRecipients } = await this.messageQueueService.enqueueBatch({
      companyId: template.company.id,
      templateId,
      campaignId: campaignId ?? null,
      channelId: selectedChannelId,
      recipients,
      scope: campaignId ? 'campaign' : 'manual',
      disableDailyDedup: !campaignId,
    });

    if (useServerBuild && dispatchSkips.length) {
      await this.templateDispatchPayload.persistDispatchSkips(
        template,
        template.company.id,
        campaignId ?? null,
        batch.id,
        dispatchSkips,
      );
    }

    if (dedupedRecipients.length > 0) {
      const dedupSkips = dedupedRecipients.map((r) => ({
        reason: 'duplicate_dispatch_today' as const,
        number: r.number,
        name: r.name,
        detail: 'Mensagem não enviada: Este destinatário já recebeu disparo hoje.',
      }));
      await this.templateDispatchPayload.persistDispatchSkips(
        template,
        template.company.id,
        campaignId ?? null,
        batch.id,
        dedupSkips,
      );
    }

    return {
      batchId: batch.id,
      queued: recipients.length - skipped,
      skipped,
      skippedInvalidInvoices: dispatchSkips.length,
    };
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
      relations: { company: true },
      select: { id: true, isEnabled: true, company: { account_chatwoot: true } },
    });

    if (!template) {
      throw new HttpException(
        'Template nao encontrado ou ja desativado',
        HttpStatus.NOT_FOUND,
      );
    }

    template.isEnabled = false;
    await this.templateRepository.save(template);

    if (template.company?.account_chatwoot) {
      this.campaignMetricsGateway.emitCampaignsSync(template.company.account_chatwoot);
    }

    return { statusCode: 204, message: 'Template desativado!' };
  }

  async createTemplate(companyId: string, dto: CreateTemplateDTO) {
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
      select: {
        id: true,
        canalId_notificameHub: true,
        token_notificameHub: true,
        account_chatwoot: true,
      },
    });

    if (!company) throw new NotFoundException('Empresa nao encontrada!');

    const channel = this.resolveDefaultChannel(company.canalId_notificameHub);
    if (!channel || !company.token_notificameHub) {
      throw new BadRequestException(
        'Empresa nao possui integracao ativa com a NotificaMe.',
      );
    }

    const channelIdentifier = channel.id;
    const apiToken = company.token_notificameHub;

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
          'X-Api-Token': apiToken,
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
      const metaErrorSubcode =
        (responseData as any)?.error?.error_subcode ??
        ((responseData as any)?.errors?.[0] ?? {})?.error_subcode;
      const fbtraceId =
        (responseData as any)?.error?.fbtrace_id ??
        ((responseData as any)?.errors?.[0] ?? {})?.fbtrace_id;

      // fallback: se Meta falhou mas o template existe, persiste mesmo assim
      if ([99, 2388023, 2388024].includes(Number(metaErrorSubcode))) {
        const existing = await this.findTemplateByName(
          channelIdentifier,
          apiToken,
          dto.name,
        );

        if (existing) {
          const metaId =
            existing.id ??
            existing.templateId ??
            existing.template_id ??
            '';
          const metaStatus =
            existing.status ??
            existing.templateStatus ??
            existing.template_status ??
            '';

          if (metaId) {
            this.logger.warn(
              `[createTemplate] Meta retornou erro ${metaErrorSubcode} mas o template já existe. name=${dto.name} metaId=${metaId} fbtrace_id=${fbtraceId ?? 'n/a'}`,
            );
            await this.saveTemplateRecord(metaId, metaStatus, dto, companyId);
            return { id: metaId, status: metaStatus, data: existing };
          }
        }
      }

      if (metaErrorSubcode === 2388024) {
        this.logger.warn(
          `[createTemplate] Template duplicado na Meta. name=${dto.name} fbtrace_id=${fbtraceId ?? 'n/a'}`,
        );
        throw new BadRequestException(
          'Já existe um template pt_BR com esse nome ou conteúdo na Meta. Escolha outro nome e tente novamente.',
        );
      }

      if (metaErrorSubcode === 2388023) {
        this.logger.warn(
          `[createTemplate] Lang pt_BR está sendo apagada na Meta, tentar de novo em <1min. name=${dto.name} fbtrace_id=${fbtraceId ?? 'n/a'}`,
        );
        throw new BadRequestException(
          'A Meta ainda está excluindo a versão pt_BR deste template. Aguarde mais 1 minuto ou tente outro nome de template.',
        );
      }

      if (metaErrorSubcode === 2388299) {
        this.logger.warn(
          `[createTemplate] Template com variavel no inicio ou fim do corpo. name=${dto.name} fbtrace_id=${fbtraceId ?? 'n/a'}`,
        );
        throw new BadRequestException(
          'A Meta exige texto real antes e depois da variavel. Ponto, espaco ou emoji sozinho no inicio ou no fim nao contam.',
        );
      }

      if (metaErrorSubcode === 99) {
        this.logger.error(
          `[createTemplate] Erro interno da Meta (subcode 99). fbtrace_id=${fbtraceId ?? 'n/a'} payload=${JSON.stringify(payload)}`,
        );
        throw new BadRequestException(
          'A Meta retornou um erro interno ao criar o template. Tente novamente em 1 minuto. Código: 99.',
        );
      }

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

    if (company.account_chatwoot) {
      this.campaignMetricsGateway.emitCampaignsSync(company.account_chatwoot);
    }

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

  private async findTemplateByName(channelIdentifier: string, apiToken: string, name: string) {
    try {
      const response = await fetch(
        `https://api.notificame.com.br/v1/templates/${channelIdentifier}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'X-Api-Token': apiToken,
          },
        },
      );

      if (!response.ok) return null;

      const data = await response.json();
      const list: any[] = Array.isArray((data as any)?.data) ? (data as any).data : [];
      const targetName = String(name ?? '').trim().toLowerCase();

      return list.find((item) => String(item?.name ?? '').trim().toLowerCase() === targetName) ?? null;
    } catch {
      return null;
    }
  }

  private async saveTemplateRecord(
    metaId: string,
    metaStatus: string,
    dto: CreateTemplateDTO,
    companyId: string,
  ) {
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
      relations: { company: true },
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

  async syncAllTemplateStatuses() {
    const templates = await this.templateRepository.find({
      where: { isEnabled: true },
      relations: { company: true },
      select: {
        id: true,
        name: true,
        meta_id: true,
        meta_status: true,
        company: {
          id: true,
          account_chatwoot: true,
        },
      },
    });

    if (!templates.length) {
      return { total: 0, updated: 0 };
    }

    const previousStatusById = new Map(
      templates.map((template) => [
        template.id,
        this.normalizeTemplateStatus(template.meta_status),
      ]),
    );

    await this.syncTemplateStatuses(templates);

    const changedAccounts = new Set(
      templates
        .filter(
          (template) =>
            previousStatusById.get(template.id) !==
            this.normalizeTemplateStatus(template.meta_status),
        )
        .map((template) => template.company?.account_chatwoot)
        .filter(Boolean) as string[],
    );

    for (const account of changedAccounts) {
      this.campaignMetricsGateway.emitCampaignsSync(account);
    }

    return {
      total: templates.length,
      updated: changedAccounts.size > 0 ? templates.filter(
        (t) => previousStatusById.get(t.id) !== this.normalizeTemplateStatus(t.meta_status),
      ).length : 0,
    };
  }

  async ensureTemplateApprovedForUsage(
    template: Pick<Templates, 'id' | 'name' | 'meta_status'> & {
      meta_id?: string | null;
      company?: { id?: string | null } | null;
    },
  ) {
    await this.refreshTemplateStatusForUsage(template);

    if (this.isTemplateApprovedStatus(template.meta_status)) {
      return template;
    }

    const normalizedStatus = this.normalizeTemplateStatus(template.meta_status);
    throw new BadRequestException(
      `O template ${template.name} ainda nao foi aprovado na Meta e nao pode ser utilizado agora. Status atual: ${normalizedStatus || 'DESCONHECIDO'}.`,
    );
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

  private normalizeTemplateStatus(status: unknown) {
    return String(status ?? '').trim().toUpperCase();
  }

  private isTemplateApprovedStatus(status: unknown) {
    return this.normalizeTemplateStatus(status) === 'APPROVED';
  }

  private extractRemoteTemplateStatus(record: unknown) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      return '';
    }

    const rawStatus =
      (record as Record<string, unknown>).status ??
      (record as Record<string, unknown>).template_status ??
      (record as Record<string, unknown>).meta_status;

    return rawStatus === undefined || rawStatus === null
      ? ''
      : String(rawStatus).trim();
  }

  private findRemoteTemplateMatch(
    remoteTemplates: unknown[],
    template: Pick<Templates, 'name'> & { meta_id?: string | null },
  ) {
    const templateMetaId = String(template.meta_id ?? '').trim();
    const templateName = String(template.name ?? '').trim().toLowerCase();

    return (
      remoteTemplates.find((record) => {
        if (!record || typeof record !== 'object' || Array.isArray(record)) {
          return false;
        }

        const remoteId = String(
          (record as Record<string, unknown>).id ??
            (record as Record<string, unknown>).templateId ??
            (record as Record<string, unknown>).template_id ??
            '',
        ).trim();

        if (templateMetaId && remoteId && remoteId === templateMetaId) {
          return true;
        }

        const remoteName = String(
          (record as Record<string, unknown>).name ?? '',
        )
          .trim()
          .toLowerCase();

        return Boolean(templateName) && remoteName === templateName;
      }) ?? null
    );
  }

  private async fetchRemoteTemplates(
    channelIdentifier: string,
    apiToken: string,
  ): Promise<unknown[]> {
    try {
      const response = await fetch(
        `https://api.notificame.com.br/v1/templates/${channelIdentifier}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'X-Api-Token': apiToken,
          },
        },
      );

      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      return Array.isArray((data as any)?.data) ? (data as any).data : [];
    } catch {
      return [];
    }
  }

  private async syncTemplateStatuses(
    templates: Array<
      Pick<Templates, 'id' | 'name' | 'meta_id' | 'meta_status'> & {
        company?: { id?: string | null } | null;
      }
    >,
  ) {
    const companyIds = Array.from(
      new Set(
        templates
          .map((template) => String(template.company?.id ?? '').trim())
          .filter(Boolean),
      ),
    );

    if (!companyIds.length) {
      return templates;
    }

    const companies = await this.companyRepository.find({
      where: { id: In(companyIds) },
      select: {
        id: true,
        canalId_notificameHub: true,
        token_notificameHub: true,
      },
    });

    const companiesById = new Map(companies.map((company) => [company.id, company]));
    const updates: Array<{ id: string; meta_status: string }> = [];

    for (const companyId of companyIds) {
      const company = companiesById.get(companyId);
      const channel = this.resolveDefaultChannel(company?.canalId_notificameHub);

      if (!channel || !company?.token_notificameHub) {
        continue;
      }

      const channelIdentifier = channel.id;
      const apiToken = company.token_notificameHub;

      const remoteTemplates = await this.fetchRemoteTemplates(channelIdentifier, apiToken);
      if (!remoteTemplates.length) {
        continue;
      }

      for (const template of templates.filter(
        (item) => String(item.company?.id ?? '').trim() === companyId,
      )) {
        const remoteTemplate = this.findRemoteTemplateMatch(remoteTemplates, template);
        const remoteStatus = this.extractRemoteTemplateStatus(remoteTemplate);
        const previousStatus = template.meta_status;

        if (!remoteStatus) {
          continue;
        }

        template.meta_status = remoteStatus;

        if (
          this.normalizeTemplateStatus(previousStatus) !==
          this.normalizeTemplateStatus(remoteStatus)
        ) {
          updates.push({ id: template.id, meta_status: remoteStatus });
        }
      }
    }

    if (updates.length) {
      await this.templateRepository.save(updates);
    }

    return templates;
  }

  private async refreshTemplateStatusForUsage(
    template: Pick<Templates, 'id' | 'name' | 'meta_status'> & {
      meta_id?: string | null;
      company?: {
        id?: string | null;
        canalId_notificameHub?: NotificameChannel[] | null;
      } | null;
    },
  ) {
    const companyId = String(template.company?.id ?? '').trim();

    let channel = this.resolveDefaultChannel(
      template.company?.canalId_notificameHub,
    );

    // O X-Api-Token vive na coluna compartilhada token_notificameHub (nao no
    // canal), e a forma estreita de template.company nao a expoe — buscamos a
    // empresa para resolver canal (quando ausente) e token de forma tipada.
    let apiToken: string | null = null;

    if (companyId) {
      const company = await this.companyRepository.findOne({
        where: { id: companyId },
        select: {
          id: true,
          canalId_notificameHub: true,
          token_notificameHub: true,
        },
      });

      if (!channel) {
        channel = this.resolveDefaultChannel(company?.canalId_notificameHub);
      }
      apiToken = company?.token_notificameHub ?? null;
    }

    if (!channel || !apiToken) {
      return template;
    }

    const channelIdentifier = channel.id;

    const remoteTemplates = await this.fetchRemoteTemplates(channelIdentifier, apiToken);
    const remoteTemplate = this.findRemoteTemplateMatch(remoteTemplates, template);
    const remoteStatus = this.extractRemoteTemplateStatus(remoteTemplate);

    if (
      remoteStatus &&
      this.normalizeTemplateStatus(remoteStatus) !==
        this.normalizeTemplateStatus(template.meta_status)
    ) {
      template.meta_status = remoteStatus;
      await this.templateRepository.save({
        id: template.id,
        meta_status: remoteStatus,
      });
    }

    return template;
  }

  private normalizeDispatchComponents(
    components: MessageQueuePayload['components'],
    templateVariables: Templates['variables'],
  ): MessageQueuePayload['components'] {
    const contractNumber = this.extractBodyVariableValue(
      components,
      templateVariables,
      'numero_contrato',
    );

    if (!contractNumber) {
      return components;
    }

    return components.map((component) =>
      this.applyOrderDetailsReferenceId(component, contractNumber),
    );
  }

  private extractBodyVariableValue(
    components: MessageQueuePayload['components'],
    templateVariables: Templates['variables'],
    variableName: string,
  ): string {
    const orderedVariableKeys = this.getOrderedTemplateVariableKeys(templateVariables);
    const variableIndex = orderedVariableKeys.findIndex((key) => key === variableName);

    if (variableIndex < 0) {
      return '';
    }

    const bodyComponent = components.find(
      (component) => String(component?.type ?? '').toUpperCase() === 'BODY',
    );

    if (!bodyComponent || !Array.isArray(bodyComponent.parameters)) {
      return '';
    }

    return String(bodyComponent.parameters[variableIndex]?.text ?? '').trim();
  }

  private getOrderedTemplateVariableKeys(
    templateVariables: Templates['variables'],
  ): string[] {
    try {
      const parsedVariables =
        typeof templateVariables === 'string'
          ? JSON.parse(templateVariables)
          : templateVariables ?? {};

      return Object.keys(parsedVariables)
        .sort((a, b) => Number(a) - Number(b))
        .map((key) => String(parsedVariables[key] ?? '').trim())
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  private applyOrderDetailsReferenceId(
    component: MessageQueuePayload['components'][number],
    contractNumber: string,
  ): MessageQueuePayload['components'][number] {
    const componentType = String(component?.type ?? '').toUpperCase();
    const subType = String(component?.sub_type ?? '').toUpperCase();

    if (componentType !== 'BUTTON' || subType !== 'ORDER_DETAILS') {
      return component;
    }

    const parameters = Array.isArray(component.parameters) ? component.parameters : [];
    const nextParameters = parameters.map((parameter) => {
      const action =
        parameter && typeof parameter === 'object'
          ? (parameter.action as Record<string, unknown> | undefined)
          : undefined;
      const orderDetails =
        action && typeof action === 'object'
          ? (action.order_details as Record<string, unknown> | undefined)
          : undefined;

      if (!orderDetails || typeof orderDetails !== 'object') {
        return parameter;
      }

      const order =
        orderDetails.order && typeof orderDetails.order === 'object'
          ? (orderDetails.order as Record<string, unknown>)
          : undefined;
      const items = Array.isArray(order?.items)
        ? order.items.map((item) =>
            item && typeof item === 'object'
              ? { ...(item as Record<string, unknown>), retailer_id: contractNumber }
              : item,
          )
        : undefined;

      return {
        ...parameter,
        action: {
          ...action,
          order_details: {
            ...orderDetails,
            reference_id: contractNumber,
            ...(order
              ? {
                  order: {
                    ...order,
                    ...(items ? { items } : {}),
                  },
                }
              : {}),
          },
        },
      };
    });

    return {
      ...component,
      parameters: nextParameters,
    };
  }
}
