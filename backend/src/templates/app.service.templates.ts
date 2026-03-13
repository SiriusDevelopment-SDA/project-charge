import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  OnModuleInit,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, ILike, Repository } from 'typeorm';

import { Templates } from './entities/templatesMeta';
import {
  DispatchBatchStatusDto,
  LatestDispatchBatchReportDto,
  SearchRequestDtoRelatories,
  SearchRequestDtoTemplates,
  SendTemplateDto,
  ToComponentDto,
} from './dto/search.request.dto.templates';
import { RelatoryDispatchTemplate } from './entities/relatory.entity';
import {
  TemplateDispatchBatch,
  TemplateDispatchBatchStatus,
} from './entities/template-dispatch-batch.entity';
import { DeleteTemplateDto } from './dto/delete.request.dto.templates';
import { CreateTemplateDTO } from './dto/create.request.dto.template';
import { Company } from '../companies/entities/companies';
import { CampaignMetricsGateway } from '../realtime/campaigns-metrics.gateway';

type ProviderDispatchEntry = {
  id?: string;
  status?: string;
  message?: string;
  error?: string;
};

type DispatchTemplateResult = {
  number: string;
  ok: boolean;
  status: RelatoryDispatchTemplate['status_sent'];
  relatoryId?: string;
  externalMessageId?: string | null;
  error?: string | null;
};

type SendTemplateRecipient = SendTemplateDto['to'][number];

const TEMPLATE_DISPATCHES_PER_SECOND = 15;
const TEMPLATE_DISPATCH_WINDOW_MS = 1000;

@Injectable()
export class AppServiceTemplate implements OnModuleInit {
  private readonly baseUrl = 'https://api.notificame.com.br/v2';
  private readonly companyDispatchQueue = new Map<string, Promise<void>>();

  constructor(
    @InjectRepository(Templates)
    private templateRepository: Repository<Templates>,

    @InjectRepository(RelatoryDispatchTemplate)
    private readonly relatoryDispatchRepository: Repository<RelatoryDispatchTemplate>,

    @InjectRepository(TemplateDispatchBatch)
    private readonly dispatchBatchRepository: Repository<TemplateDispatchBatch>,

    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,

    private readonly campaignMetricsGateway: CampaignMetricsGateway,
  ) {}

  async onModuleInit() {
    const pendingBatches = await this.dispatchBatchRepository.find({
      where: [{ status: 'queued' }, { status: 'processing' }],
      relations: {
        company: true,
      },
      order: {
        createdAt: 'ASC',
      },
    });

    pendingBatches.forEach((batch) => {
      if (!batch.company?.id) return;
      this.enqueueBatchProcessing(batch.id, batch.company.id);
    });
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

    return {
      page: safePage,
      total,
      data,
    };
  }

  async sendTemplate(data: SendTemplateDto) {
    const { templateId, account, to, campaignId } = data;

    const template = await this.templateRepository.findOne({
      where: {
        id: templateId,
        company: {
          account_chatwoot: String(account),
        },
      },
      relations: {
        company: true,
      },
      select: {
        id: true,
        name: true,
        language: true,
        variables: true,
        components: true,
        message: true,
        company: {
          id: true,
          canalId_notificameHub: true,
          token_notificameHub: true,
        },
      },
    });

    if (!template) {
      throw new NotFoundException('Template nao encontrado');
    }

    if (
      !template.company?.canalId_notificameHub ||
      !template.company?.token_notificameHub
    ) {
      throw new BadRequestException(
        'Empresa nao possui integracao ativa com a NotificaMe.',
      );
    }

    if (!to.length) {
      throw new BadRequestException('Nenhum destinatario informado para envio.');
    }

    const requiredTemplateVarsCount = this.extractRequiredTemplateVars(template).length;

    to.forEach((recipient) => {
      const safeComponents = this.getSafeRecipientComponents(recipient);

      this.validateRecipientTemplateVariables(
        recipient,
        safeComponents,
        requiredTemplateVarsCount,
      );
    });

    const batch = await this.dispatchBatchRepository.save({
      account: String(account),
      status: 'queued',
      totalRecipients: to.length,
      processedRecipients: 0,
      successCount: 0,
      failedCount: 0,
      rateLimitPerSecond: TEMPLATE_DISPATCHES_PER_SECOND,
      payload: {
        recipients: to,
      },
      template: { id: template.id },
      company: { id: template.company.id },
      campaign: campaignId ? { id: campaignId } : null,
    });

    this.enqueueBatchProcessing(batch.id, template.company.id);

    return {
      accepted: true,
      batchId: batch.id,
      status: batch.status,
      total: batch.totalRecipients,
      rateLimitPerSecond: batch.rateLimitPerSecond,
      estimatedDurationSeconds: this.getEstimatedBatchDurationSeconds(
        batch.totalRecipients,
        batch.rateLimitPerSecond,
      ),
    };
  }

  async getDispatchBatchStatus(dto: DispatchBatchStatusDto) {
    const batch = await this.dispatchBatchRepository.findOne({
      where: {
        id: dto.batchId,
        company: {
          account_chatwoot: String(dto.account),
        },
      },
      relations: {
        company: true,
        template: true,
        campaign: true,
      },
    });

    if (!batch) {
      throw new NotFoundException('Lote de disparo nao encontrado.');
    }

    return this.mapDispatchBatchResponse(batch);
  }

  async getLatestDispatchBatchReport(dto: LatestDispatchBatchReportDto) {
    const queryBuilder = this.dispatchBatchRepository
      .createQueryBuilder('batch')
      .innerJoin('batch.company', 'company')
      .leftJoinAndSelect('batch.template', 'template')
      .leftJoinAndSelect('batch.campaign', 'campaign')
      .where('company.account_chatwoot = :account', {
        account: String(dto.account),
      })
      .orderBy('batch.createdAt', 'DESC')
      .take(1);

    if (dto.manualOnly) {
      queryBuilder.andWhere('batch."campaignId" IS NULL');
    }

    if (dto.campaignOnly) {
      queryBuilder.andWhere('batch."campaignId" IS NOT NULL');
    }

    const batch = await queryBuilder.getOne();

    if (!batch) {
      return {
        batch: null,
        records: [],
      };
    }

    const records = await this.relatoryDispatchRepository
      .createQueryBuilder('relatory')
      .leftJoinAndSelect('relatory.template', 'template')
      .where('relatory."dispatchBatchId" = :batchId', {
        batchId: batch.id,
      })
      .orderBy('relatory.createdAt', 'DESC')
      .getMany();

    return {
      batch: this.mapDispatchBatchResponse(batch),
      records: records.map((record) => this.mapDispatchBatchRecord(record)),
    };
  }

  async getRelatoriesDispatchTemplate(dto: SearchRequestDtoRelatories) {
    const {
      account,
      page,
      limit,
      sortorder,
      query,
      manualOnly,
      campaignOnly,
      batchId,
    } = dto;
    const safeLimit = limit > 0 ? limit : 10;
    const safePage = page > 0 ? page : 1;
    const skip = (safePage - 1) * safeLimit;
    const order = sortorder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const safeQuery = `%${String(query ?? '').trim()}%`;

    const queryBuilder = this.relatoryDispatchRepository
      .createQueryBuilder('relatory')
      .leftJoinAndSelect('relatory.template', 'template')
      .innerJoin('relatory.company', 'company')
      .where('company.account_chatwoot = :account', {
        account: String(account),
      })
      .andWhere('(relatory.name ILIKE :query OR relatory.number ILIKE :query)', {
        query: safeQuery,
      })
      .orderBy('relatory.createdAt', order)
      .skip(skip)
      .take(safeLimit);

    if (manualOnly) {
      queryBuilder.andWhere('relatory."campaignId" IS NULL');
    }

    if (campaignOnly) {
      queryBuilder.andWhere('relatory."campaignId" IS NOT NULL');
    }

    if (batchId) {
      queryBuilder.andWhere('relatory."dispatchBatchId" = :batchId', {
        batchId,
      });
    }

    const [data, total] = await queryBuilder.getManyAndCount();

    return {
      page: safePage,
      total,
      data,
    };
  }

  async disableTemplate(templateId: string) {
    const template = await this.templateRepository.findOne({
      where: {
        id: templateId,
        isEnabled: true,
      },
    });

    if (!template) {
      throw new HttpException(
        'Template nao encontrado ou ja desativado',
        HttpStatus.NOT_FOUND,
      );
    }

    template.isEnabled = false;
    await this.templateRepository.save(template);

    return {
      statusCode: 204,
      message: 'Template desativado!',
    };
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

    if (!company) {
      throw new NotFoundException('Empresa nao encontrada!');
    }

    if (!company.canalId_notificameHub || !company.token_notificameHub) {
      throw new BadRequestException(
        'Empresa nao possui integracao ativa com a NotificaMe.',
      );
    }

    const payload = {
      from: company.canalId_notificameHub,
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

    const response = await fetch(`${this.baseUrl}/templates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Token': company.token_notificameHub,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new BadRequestException(`Erro ao criar template no meta: ${error}`);
    }

    const responseData = await response.json();

    await this.templateRepository.save([
      {
        active: true,
        isEnabled: true,
        language: dto.language,
        message:
          dto.components
            .filter((component) => component.type.toUpperCase() === 'BODY')
            .map((component) => component.text)[0] ?? '',
        meta_id: responseData.id,
        meta_status: responseData.status,
        variables: dto.variables,
        components: dto.components,
        company: { id: dto.companyId },
        name: dto.name,
      },
    ]);

    return responseData;
  }

  async getTemplateOrFail(templateId: string) {
    const template = await this.templateRepository.findOne({
      where: {
        id: templateId,
        isEnabled: true,
      },
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

  private enqueueBatchProcessing(batchId: string, companyId: string) {
    const previousQueue = this.companyDispatchQueue.get(companyId) ?? Promise.resolve();

    const nextQueue = previousQueue
      .catch(() => undefined)
      .then(async () => {
        await this.processDispatchBatch(batchId);
      });

    this.companyDispatchQueue.set(companyId, nextQueue);

    void nextQueue.finally(() => {
      if (this.companyDispatchQueue.get(companyId) === nextQueue) {
        this.companyDispatchQueue.delete(companyId);
      }
    });
  }

  private async processDispatchBatch(batchId: string) {
    const batch = await this.dispatchBatchRepository.findOne({
      where: {
        id: batchId,
      },
      relations: {
        template: {
          company: true,
        },
        company: true,
        campaign: true,
      },
    });

    if (!batch || this.isDispatchBatchFinished(batch.status)) {
      return;
    }

    const template = batch.template;

    if (
      !template?.company?.canalId_notificameHub ||
      !template.company?.token_notificameHub
    ) {
      await this.failDispatchBatch(
        batch.id,
        'Empresa nao possui integracao ativa com a NotificaMe.',
      );
      return;
    }

    const remainingRecipients = this.getPendingBatchRecipients(batch);
    const requiredTemplateVarsCount = this.extractRequiredTemplateVars(template).length;
    const startedAt = batch.startedAt ?? new Date();
    let processedRecipients = batch.processedRecipients;
    let successCount = batch.successCount;
    let failedCount = batch.failedCount;

    await this.dispatchBatchRepository.update(batch.id, {
      status: 'processing',
      startedAt,
      errorMessage: null,
    });

    try {
      for (
        let startIndex = 0;
        startIndex < remainingRecipients.length;
        startIndex += batch.rateLimitPerSecond
      ) {
        const batchStartedAt = Date.now();
        const recipientsWindow = remainingRecipients.slice(
          startIndex,
          startIndex + batch.rateLimitPerSecond,
        );

        const dispatchResults = await Promise.all(
          recipientsWindow.map((recipient) =>
            this.dispatchTemplateToRecipient({
              template,
              recipient,
              campaignId: batch.campaign?.id,
              dispatchBatchId: batch.id,
              requiredTemplateVarsCount,
            }),
          ),
        );

        processedRecipients += dispatchResults.length;
        successCount += dispatchResults.filter((result) => result.ok).length;
        failedCount += dispatchResults.filter((result) => !result.ok).length;

        await this.dispatchBatchRepository.update(batch.id, {
          processedRecipients,
          successCount,
          failedCount,
          status: 'processing',
          startedAt,
        });

        const hasMoreRecipients =
          startIndex + batch.rateLimitPerSecond < remainingRecipients.length;

        if (hasMoreRecipients) {
          await this.waitForNextDispatchWindow(batchStartedAt);
        }
      }

      await this.dispatchBatchRepository.update(batch.id, {
        processedRecipients,
        successCount,
        failedCount,
        status: this.resolveCompletedBatchStatus(successCount, failedCount),
        startedAt,
        finishedAt: new Date(),
        errorMessage: null,
      });

      this.campaignMetricsGateway.emitCampaignsSync(batch.account);
    } catch (error: unknown) {
      await this.failDispatchBatch(
        batch.id,
        error instanceof Error ? error.message : 'Erro inesperado ao processar lote.',
      );
    }
  }

  private getPendingBatchRecipients(batch: TemplateDispatchBatch) {
    const recipients = Array.isArray(batch.payload?.recipients)
      ? batch.payload.recipients
      : [];

    return recipients.slice(batch.processedRecipients);
  }

  private async failDispatchBatch(batchId: string, errorMessage: string) {
    const batch = await this.dispatchBatchRepository.findOne({
      where: { id: batchId },
    });

    if (!batch) {
      return;
    }

    await this.dispatchBatchRepository.update(batch.id, {
      status: 'failed',
      finishedAt: new Date(),
      errorMessage,
    });

    this.campaignMetricsGateway.emitCampaignsSync(batch.account);
  }

  private mapDispatchBatchResponse(batch: TemplateDispatchBatch) {
    const progressPercentage =
      batch.totalRecipients > 0
        ? Math.min(
            100,
            Math.round((batch.processedRecipients / batch.totalRecipients) * 100),
          )
        : 0;

    return {
      id: batch.id,
      status: batch.status,
      totalRecipients: batch.totalRecipients,
      processedRecipients: batch.processedRecipients,
      successCount: batch.successCount,
      failedCount: batch.failedCount,
      rateLimitPerSecond: batch.rateLimitPerSecond,
      startedAt: batch.startedAt ?? null,
      finishedAt: batch.finishedAt ?? null,
      errorMessage: batch.errorMessage ?? null,
      progressPercentage,
      estimatedDurationSeconds: this.getEstimatedBatchDurationSeconds(
        batch.totalRecipients,
        batch.rateLimitPerSecond,
      ),
      templateId: batch.template?.id ?? null,
      templateName: batch.template?.name ?? null,
      campaignId: batch.campaign?.id ?? null,
      createdAt: batch.createdAt,
      updatedAt: batch.updatedAt,
    };
  }

  private mapDispatchBatchRecord(record: RelatoryDispatchTemplate) {
    return {
      id: record.id,
      name: record.name,
      number: record.number,
      message: record.message ?? null,
      date_dispatch: record.date_dispatch,
      status_sent: record.status_sent,
      response: record.response,
      response_at: record.response_at ?? null,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      templateId: record.template?.id,
    };
  }

  private getEstimatedBatchDurationSeconds(totalRecipients: number, rateLimitPerSecond: number) {
    if (totalRecipients <= 0 || rateLimitPerSecond <= 0) {
      return 0;
    }

    return Math.ceil(totalRecipients / rateLimitPerSecond);
  }

  private resolveCompletedBatchStatus(
    successCount: number,
    failedCount: number,
  ): TemplateDispatchBatchStatus {
    if (successCount > 0 && failedCount > 0) {
      return 'partial';
    }

    if (successCount > 0) {
      return 'completed';
    }

    return 'failed';
  }

  private isDispatchBatchFinished(status: TemplateDispatchBatchStatus) {
    return status === 'completed' || status === 'partial' || status === 'failed';
  }

  private async dispatchTemplateToRecipient(params: {
    template: Templates;
    recipient: SendTemplateRecipient;
    campaignId?: string;
    dispatchBatchId?: string;
    requiredTemplateVarsCount: number;
  }): Promise<DispatchTemplateResult> {
    const {
      template,
      recipient,
      campaignId,
      dispatchBatchId,
      requiredTemplateVarsCount,
    } = params;
    const safeComponents = this.getSafeRecipientComponents(recipient);

    this.validateRecipientTemplateVariables(
      recipient,
      safeComponents,
      requiredTemplateVarsCount,
    );

    const content = this.buildProviderDispatchPayload(
      template,
      recipient,
      safeComponents,
      requiredTemplateVarsCount,
    );

    try {
      const providerResponse = await fetch(
        `${this.baseUrl}/channels/whatsapp/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Api-Token': template.company!.token_notificameHub,
          },
          body: JSON.stringify(content),
        },
      );

      const responseData = await this.readJsonResponse(providerResponse);
      const providerEntry = this.extractProviderEntry(responseData);
      const externalMessageId = this.getProviderExternalMessageId(
        providerEntry,
        responseData,
      );
      const status = this.normalizeDispatchStatus(
        providerEntry.status,
        providerResponse.ok,
      );
      const providerMessage =
        this.getProviderMessage(providerEntry, responseData, providerResponse) ??
        template.message;

      const relatory = await this.saveDispatchRelatory({
        template,
        recipient,
        campaignId,
        dispatchBatchId,
        status,
        componentsMaped: safeComponents as Record<string, any>,
        externalMessageId,
        message: providerMessage,
      });

      return {
        number: recipient.number,
        ok: status !== 'failed',
        status,
        relatoryId: relatory.id,
        externalMessageId,
      };
    } catch (error: unknown) {
      const errorMessage = `Dispatch error: ${
        error instanceof Error ? error.message : 'unknown error'
      }`;

      const relatory = await this.saveDispatchRelatory({
        template,
        recipient,
        campaignId,
        dispatchBatchId,
        status: 'failed',
        componentsMaped: { components: safeComponents },
        message: errorMessage,
      });

      return {
        number: recipient.number,
        ok: false,
        status: 'failed',
        relatoryId: relatory.id,
        error: errorMessage,
      };
    }
  }

  private getSafeRecipientComponents(recipient: SendTemplateRecipient) {
    return Array.isArray(recipient.components) ? recipient.components : [];
  }

  private validateRecipientTemplateVariables(
    recipient: SendTemplateRecipient,
    safeComponents: ToComponentDto['components'],
    requiredTemplateVarsCount: number,
  ) {
    const bodyComponent = safeComponents.find((component) => component.type === 'BODY');
    const parametersLength = bodyComponent?.parameters?.length ?? 0;

    if (requiredTemplateVarsCount !== parametersLength) {
      throw new BadRequestException(
        `Template exige ${requiredTemplateVarsCount} variaveis, recebido ${parametersLength}`,
      );
    }

    if (!String(recipient.number ?? '').trim()) {
      throw new BadRequestException('Numero do destinatario nao informado.');
    }
  }

  private buildProviderDispatchPayload(
    template: Templates,
    recipient: SendTemplateRecipient,
    safeComponents: ToComponentDto['components'],
    requiredTemplateVarsCount: number,
  ) {
    const bodyComponent = safeComponents.find((component) => component.type === 'BODY');
    const parametersLength = bodyComponent?.parameters?.length ?? 0;

    return {
      from: template.company!.canalId_notificameHub,
      to: recipient.number,
      contents: [
        {
          type: 'template',
          template: {
            name: template.name,
            language: { code: template.language },
            components:
              requiredTemplateVarsCount > 0 && parametersLength > 0
                ? safeComponents
                : [{ type: 'BODY', parameters: [] }],
          },
        },
      ],
      message_activity_sharing: true,
      message_send_ttl_seconds: 3600,
    };
  }

  private saveDispatchRelatory(params: {
    template: Templates;
    recipient: SendTemplateRecipient;
    campaignId?: string;
    dispatchBatchId?: string;
    status: RelatoryDispatchTemplate['status_sent'];
    componentsMaped: Record<string, any>;
    message: string | null;
    externalMessageId?: string | null;
  }): Promise<RelatoryDispatchTemplate> {
    const {
      template,
      recipient,
      campaignId,
      dispatchBatchId,
      status,
      componentsMaped,
      message,
      externalMessageId,
    } = params;

    return this.relatoryDispatchRepository.save({
      date_dispatch: new Date(),
      external_message_id: externalMessageId ?? undefined,
      status_sent: status,
      template: { id: template.id },
      name: recipient.name ?? recipient.number,
      number: recipient.number,
      components_maped: componentsMaped,
      company: { id: template.company!.id },
      campaign: campaignId ? { id: campaignId } : null,
      dispatchBatch: dispatchBatchId ? { id: dispatchBatchId } : null,
      message: message ?? '',
    });
  }

  private async waitForNextDispatchWindow(batchStartedAt: number) {
    const elapsedMs = Date.now() - batchStartedAt;

    if (elapsedMs >= TEMPLATE_DISPATCH_WINDOW_MS) {
      return;
    }

    await this.delay(TEMPLATE_DISPATCH_WINDOW_MS - elapsedMs);
  }

  private async delay(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async readJsonResponse(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  private extractProviderEntry(responseData: unknown): ProviderDispatchEntry {
    if (Array.isArray(responseData)) {
      return (responseData[0] as ProviderDispatchEntry | undefined) ?? {};
    }

    if (responseData && typeof responseData === 'object') {
      return responseData as ProviderDispatchEntry;
    }

    return {};
  }

  private getProviderExternalMessageId(
    providerEntry: ProviderDispatchEntry,
    responseData: unknown,
  ) {
    const rawId =
      providerEntry.id ??
      (responseData &&
      typeof responseData === 'object' &&
      !Array.isArray(responseData)
        ? (responseData as ProviderDispatchEntry).id
        : undefined);

    return String(rawId ?? '').trim() || null;
  }

  private getProviderMessage(
    providerEntry: ProviderDispatchEntry,
    responseData: unknown,
    response: Response,
  ) {
    const responseObject =
      responseData && typeof responseData === 'object' && !Array.isArray(responseData)
        ? (responseData as ProviderDispatchEntry)
        : undefined;

    const rawMessage =
      providerEntry.message ??
      providerEntry.error ??
      responseObject?.message ??
      responseObject?.error ??
      (response.ok ? '' : `HTTP ${response.status}`);

    return String(rawMessage ?? '').trim() || null;
  }

  private normalizeDispatchStatus(
    rawStatus: unknown,
    isSuccess: boolean,
  ): RelatoryDispatchTemplate['status_sent'] {
    const normalized = String(rawStatus ?? '').trim().toLowerCase();

    if (normalized === 'queued' || normalized === 'queue') return 'queued';
    if (
      normalized === 'sent' ||
      normalized === 'accepted' ||
      normalized === 'submitted' ||
      normalized === 'dispatched'
    ) {
      return 'sent';
    }
    if (normalized === 'delivered') return 'delivered';
    if (normalized === 'read') return 'read';
    if (normalized === 'pending') return 'pending';
    if (
      normalized === 'failed' ||
      normalized === 'error' ||
      normalized.startsWith('error_')
    ) {
      return 'failed';
    }

    return isSuccess ? 'pending' : 'failed';
  }
}
