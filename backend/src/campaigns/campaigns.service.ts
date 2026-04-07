import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, ILike, In, Not, Repository } from 'typeorm';
import { DateTime } from 'luxon';
import { Campaign } from './entities/campanhas.entity';
import { CreateCampaignDto } from './dto/create-campanhas.dto';
import { UpdateCampaignDto } from './dto/update-campanhas.dto';
import { AppServiceTemplate } from '../templates/app.service.templates';
import { AppServiceClient } from '../clients/app.service.clients';
import { TemplateMapVar } from './types/index';
import { RelatoryDispatchTemplate } from '../templates/entities/relatory.entity';
import { Company } from '../companies/entities/companies';
import { CampaignMetricsGateway } from '../realtime/campaigns-metrics.gateway';
import { RedisService } from '../redis/redis.service';
import { MessageQueueService } from '../message-queue/message-queue.service';

@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);

  constructor(
    @InjectRepository(Campaign)
    private readonly campaignRepository: Repository<Campaign>,

    @InjectRepository(RelatoryDispatchTemplate)
    private readonly relatoryRepository: Repository<RelatoryDispatchTemplate>,

    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,

    private readonly templatesService: AppServiceTemplate,
    private readonly clientService: AppServiceClient,
    private readonly campaignMetricsGateway: CampaignMetricsGateway,
    private readonly redisService: RedisService,
    private readonly messageQueueService: MessageQueueService,
  ) {}

  private readonly emptyDeliveryMetrics = {
    totalDispatch: 0,
    totalDispatchSuccess: 0,
    totalDispatchToday: 0,
    totalDispatchSuccessToday: 0,
    totalDispatch24h: 0,
    totalDispatchSuccess24h: 0,
    deliveryRateTotal: 0,
    deliveryRateToday: 0,
    deliveryRate24h: 0,
  };

  async create(createDto: CreateCampaignDto) {
    await this.ensureCampaignNameIsUnique(createDto.name);
    this.validateMinimumDispatchWindow(createDto);

    const template = await this.templatesService.getTemplateOrFail(
      createDto.templateId,
    );
    await this.templatesService.ensureTemplateApprovedForUsage(template);

    const allRequiredKeys = this.templatesService.extractRequiredTemplateVars(template);
    const invoicePixVars = new Set([
      'data_vencimento_fatura',
      'numero_contrato',
      'valor_fatura',
      'linha_digitavel_boleto',
      'link_boleto_pdf',
      'code_pix',
      'codigo_qr',
      'codigo_qr_code',
      'codigo_pix'
    ]);
    const requiredKeysForCreation = allRequiredKeys.filter(key => !invoicePixVars.has(key));

    const { validClients, removedClients } =
      this.clientService.filterClientsByRequiredVars(
        createDto.templateMapVars,
        requiredKeysForCreation,
      );


    if (validClients.length === 0) {
      this.clientService.noValidClientsException(removedClients);
    }

    const campaign = await this.persistCampaign(createDto, validClients);
    const account = await this.getAccountByCompanyId(createDto.company);
    await this.invalidateCampaignCache(account);
    this.notifyMetricsRefresh(account);

    return {
      campaign,
      warnings: this.buildWarnings(removedClients),
    };
  }

  async findAll(): Promise<Campaign[]> {
    return await this.campaignRepository.find({
      relations: ['template', 'category'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Campaign> {
    const campaign = await this.campaignRepository.findOne({
      where: { id },
      relations: ['template', 'category', 'company'],
    });

    if (!campaign) {
      throw new BadRequestException('Campanha nao encontrada.');
    }

    return campaign;
  }

  async findByAccount(account: string): Promise<Campaign[]> {
    const safeAccount = String(account ?? '').trim();
    const reconciledCampaignIds =
      await this.messageQueueService.reconcileCampaignStatuses(safeAccount);

    if (reconciledCampaignIds.length) {
      await this.invalidateCampaignCache(safeAccount);
    }

    const cacheKey = `campaigns:${safeAccount}:list`;
    const cached =
      reconciledCampaignIds.length === 0
        ? await this.redisService.get<Campaign[]>(cacheKey)
        : null;
    if (cached) return cached;

    const campaigns = await this.campaignRepository.find({
      where: { company: { account_chatwoot: String(account) } },
      relations: ['template', 'category'],
      order: { createdAt: 'DESC' },
    });

    await this.redisService.set(cacheKey, campaigns, 20);
    return campaigns;
  }

  async findByClientIds(
    clientIds: string[],
  ): Promise<Record<string, Campaign[]>> {
    if (!clientIds.length) return {};

    const rows: { campaignId: string; clientId: string }[] =
      await this.campaignRepository.manager.query(
        `SELECT "campaignId", "clientId" FROM campaign_clients WHERE "clientId" = ANY($1)`,
        [clientIds],
      );

    if (!rows.length) return {};

    const uniqueCampaignIds = [...new Set(rows.map((r) => r.campaignId))];

    const campaigns = await this.campaignRepository.find({
      where: { id: In(uniqueCampaignIds) },
      relations: ['template', 'category'],
    });

    const campaignById = new Map(campaigns.map((c) => [c.id, c]));
    const result: Record<string, Campaign[]> = {};

    for (const row of rows) {
      const campaign = campaignById.get(row.campaignId);
      if (!campaign) continue;
      if (!result[row.clientId]) result[row.clientId] = [];
      result[row.clientId].push(campaign);
    }

    return result;
  }

  async remove(id: string) {
    const campaign = await this.findOne(id);
    const account = campaign.company?.account_chatwoot ?? null;
    const manager = this.campaignRepository.manager;

    await manager.transaction(async (em) => {
      await em.query(
        `UPDATE relatory_dispatch_template SET "campaignId" = NULL WHERE "campaignId" = $1`,
        [id],
      );
      await em.query(
        `UPDATE dispatch_batch SET "campaignId" = NULL WHERE "campaignId" = $1`,
        [id],
      );
      await em.query(
        `UPDATE message_queue SET "campaignId" = NULL WHERE "campaignId" = $1`,
        [id],
      );
      await em.remove(campaign);
    });

    await this.invalidateCampaignCache(account);
    this.notifyMetricsRefresh(account);
    return {
      campaignId: id,
      message: 'Campanha deletada com sucesso!',
      status: 'success',
    };
  }

  async update(id: string, updateDto: UpdateCampaignDto): Promise<Campaign> {
    const campaign = await this.campaignRepository.preload({
      id,
      ...updateDto,
    });

    if (!campaign) {
      throw new NotFoundException(`Campanha do id ${id} nao encontrada!`);
    }

    const updatedCampaign = await this.campaignRepository.save(campaign);
    const account = await this.getAccountByCampaignId(updatedCampaign.id);
    await this.invalidateCampaignCache(account);
    this.notifyMetricsRefresh(account);

    return updatedCampaign;
  }

  async toggleStatus(id: string): Promise<Campaign> {
    const campaign = await this.findOne(id);
    campaign.isEnabled = !campaign.isEnabled;

    const updatedCampaign = await this.campaignRepository.save(campaign);
    const account = campaign.company?.account_chatwoot ?? null;
    await this.invalidateCampaignCache(account);
    this.notifyMetricsRefresh(account);

    return updatedCampaign;
  }

  private async ensureCampaignNameIsUnique(name: string) {
    const exists = await this.campaignRepository.exists({
      where: { name: ILike(name) },
    });

    if (exists) {
      throw new ConflictException({
        code: 'CAMPAIGN_NAME_EXISTS',
        message: 'Ja existe uma campanha com esse mesmo nome!',
        field: 'name',
      });
    }
  }

  private async persistCampaign(
    createDto: CreateCampaignDto,
    validClients: TemplateMapVar[],
  ) {
    const normalizedStartDate = this.normalizeCampaignBoundary(
      createDto.startDate,
      createDto.timezone,
      'start',
    );
    const normalizedEndDate = this.normalizeCampaignBoundary(
      createDto.endDate,
      createDto.timezone,
      'end',
    );

    const validClientIds = Array.from(
      new Set(validClients.map((client) => client.clientId).filter(Boolean)),
    );

    const campaign = this.campaignRepository.create({
      ...createDto,
      startDate: normalizedStartDate,
      endDate: normalizedEndDate,
      status: 'queue',
      isEnabled: createDto.isEnabled ?? true,
      templateMapVars: validClients,
      company: { id: createDto.company },
      template: { id: createDto.templateId },
      category: { id: createDto.categoryId },
      clients: validClientIds.map((clientId) => ({ id: clientId })),
    });

    return this.campaignRepository.save(campaign);
  }

  async markCustomerRespondedAfterCharge(
    account: string,
    number: string,
    respondedAt?: string,
  ) {
    const safeAccount = String(account ?? '').trim();
    const normalizedIncoming = this.normalizePhone(number);

    if (!safeAccount || !normalizedIncoming) {
      throw new BadRequestException('account e number sao obrigatorios');
    }

    const responseDate = respondedAt ? new Date(respondedAt) : new Date();
    if (Number.isNaN(responseDate.getTime())) {
      throw new BadRequestException('respondedAt invalido');
    }

    const relatories = await this.relatoryRepository.find({
      where: {
        company: { account_chatwoot: safeAccount },
      },
      relations: ['template', 'campaign', 'campaign.category'],
      order: { date_dispatch: 'DESC' },
      take: 500,
    });

    const target = relatories.find((item) => {
      if (item.response) return false;
      if (!this.isCollectionRelatory(item)) return false;

      const normalizedStored = this.normalizePhone(item.number);
      if (!normalizedStored) return false;

      const sameNumber =
        normalizedStored === normalizedIncoming ||
        normalizedStored.endsWith(normalizedIncoming) ||
        normalizedIncoming.endsWith(normalizedStored);

      if (!sameNumber) return false;

      return item.date_dispatch <= responseDate;
    });

    if (!target) {
      return {
        success: false,
        updated: false,
        message: 'Nenhum disparo de cobranca sem resposta encontrado para este numero.',
      };
    }

    target.response = true;
    target.response_at = responseDate;
    await this.relatoryRepository.save(target);

    await this.invalidateCampaignCache(safeAccount);
    this.notifyMetricsRefresh(safeAccount);

    return {
      success: true,
      updated: true,
      relatoryId: target.id,
      account: safeAccount,
      number: normalizedIncoming,
      responseAt: responseDate.toISOString(),
    };
  }

  async getCollectionsMetricsByAccount(account: string) {
    const safeAccount = String(account ?? '').trim();
    if (!safeAccount) {
      throw new BadRequestException('account e obrigatorio');
    }

    const cacheKey = `campaigns:${safeAccount}:collections-metrics`;
    const cached = await this.redisService.get<any>(cacheKey);
    if (cached) return cached;

    const now = new Date();
    const start30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const oneDayMs = 24 * 60 * 60 * 1000;

    const relatories = await this.relatoryRepository.find({
      where: {
        company: { account_chatwoot: safeAccount },
        date_dispatch: Between(start30d, now),
      },
      relations: ['template', 'campaign', 'campaign.category'],
      order: { date_dispatch: 'DESC' },
    });

    const collectionRelatories = relatories.filter((item) =>
      this.isCollectionRelatory(item),
    );

    const chargedCustomers30d = collectionRelatories.length;
    const respondedAfterCharge30d = collectionRelatories.filter(
      (item) => item.response === true,
    ).length;
    const responseRate30d = chargedCustomers30d
      ? Number(((respondedAfterCharge30d / chargedCustomers30d) * 100).toFixed(1))
      : 0;

    const openFollowups = collectionRelatories.filter((item) => !item.response).length;
    const noResponseOver24h = collectionRelatories.filter((item) => {
      if (item.response) return false;
      return now.getTime() - new Date(item.date_dispatch).getTime() >= oneDayMs;
    }).length;

    const lastResponse = collectionRelatories
      .filter((item) => item.response)
      .map((item) => item.response_at ?? item.updatedAt ?? null)
      .filter((date): date is Date => date instanceof Date)
      .sort((a, b) => b.getTime() - a.getTime())[0];

    const payload = {
      chargedCustomers30d,
      respondedAfterCharge30d,
      responseRate30d,
      openFollowups,
      noResponseOver24h,
      lastResponseAt: lastResponse ? lastResponse.toISOString() : null,
    };

    await this.redisService.set(cacheKey, payload, 10);
    return payload;
  }

  async getMetricsByAccount(
    account: string,
    filters?: { search?: string; category?: string },
  ) {
    const safeAccount = String(account ?? '').trim();
    if (!safeAccount) {
      throw new BadRequestException('account e obrigatorio');
    }

    const normalizedFilters = this.normalizeMetricsFilters(filters);

    const reconciledCampaignIds =
      await this.messageQueueService.reconcileCampaignStatuses(safeAccount);

    if (reconciledCampaignIds.length) {
      await this.invalidateCampaignCache(safeAccount);
    }

    const cacheKey = this.buildMetricsCacheKey(safeAccount, normalizedFilters);

    const cached =
      reconciledCampaignIds.length === 0
        ? await this.redisService.get(cacheKey)
        : null;
    if (cached && this.hasCompleteDeliveryMetrics(cached)) {
      return cached;
    }

    const now = new Date();

    const campaigns = this.applyCampaignMetricsFilters(
      await this.findByAccount(safeAccount),
      normalizedFilters,
    );
    const campaignIds = campaigns
      .map((campaign) => campaign.id)
      .filter(Boolean);

    const [dispatchStats, deliveryMetrics, nextDispatch] =
      campaignIds.length === 0
        ? [0, this.emptyDeliveryMetrics, null]
        : await Promise.all([
            this.getDispatchStats(safeAccount, campaignIds),
            this.calculateDeliveryRate(safeAccount, now, campaignIds),
            this.getNextDispatch(campaigns, now),
          ]);

    const payload = {
      totalCampaigns: campaigns.length,
      activeCampaigns: campaigns.filter((campaign) => campaign.isEnabled).length,
      dispatchesToday: dispatchStats,
      totalDispatch: deliveryMetrics.totalDispatch,
      totalDispatchSuccess: deliveryMetrics.totalDispatchSuccess,
      totalDispatchToday: deliveryMetrics.totalDispatchToday,
      totalDispatchSuccessToday: deliveryMetrics.totalDispatchSuccessToday,
      totalDispatch24h: deliveryMetrics.totalDispatch24h,
      totalDispatchSuccess24h: deliveryMetrics.totalDispatchSuccess24h,
      deliveryRateTotal: deliveryMetrics.deliveryRateTotal,
      deliveryRateToday: deliveryMetrics.deliveryRateToday,
      deliveryRate24h: deliveryMetrics.deliveryRate24h,
      nextDispatchTime: nextDispatch?.nextDispatchTime ?? null,
      nextDispatchLabel: nextDispatch?.label ?? 'Sem disparos agendados',
    };

    await this.redisService.set(cacheKey, payload, 10);

    return payload;
  }

  private hasCompleteDeliveryMetrics(payload: unknown) {
    if (!payload || typeof payload !== 'object') return false;

    const data = payload as Record<string, unknown>;
    const numericKeys = [
      'totalDispatch',
      'totalDispatchSuccess',
      'totalDispatchToday',
      'totalDispatchSuccessToday',
      'totalDispatch24h',
      'totalDispatchSuccess24h',
      'deliveryRateTotal',
      'deliveryRateToday',
      'deliveryRate24h',
    ];

    return numericKeys.every((key) => {
      const value = data[key];
      return typeof value === 'number' && Number.isFinite(value);
    });
  }


  ///funcoes extras
  private getDispatchDate(
    startDate: string | Date,
    dispatchTime: string,
    timeZone: string,
  ) {
    const baseDate = this.toDateTimeInZone(startDate, timeZone);
    const [parsedHour, parsedMinute] = String(dispatchTime ?? '00:00')
      .split(':')
      .map(Number);

    return DateTime.fromObject(
      {
        year: baseDate.year,
        month: baseDate.month,
        day: baseDate.day,
        hour: Number.isFinite(parsedHour) ? parsedHour : 0,
        minute: Number.isFinite(parsedMinute) ? parsedMinute : 0,
        second: 0,
        millisecond: 0,
      },
      { zone: this.resolveTimeZone(timeZone) },
    )
      .toUTC()
      .toJSDate();
  }

  private validateMinimumDispatchWindow(createDto: CreateCampaignDto) {
    if (createDto.recurringType === 'monthly_days') return;

    const normalizedStartDate = this.normalizeCampaignBoundary(
      createDto.startDate,
      createDto.timezone,
      'start',
    );
    const normalizedEndDate = this.normalizeCampaignBoundary(
      createDto.endDate,
      createDto.timezone,
      'end',
    );
    const dispatchAt = this.getDispatchDate(
      createDto.startDate,
      createDto.dispatchTime,
      createDto.timezone,
    );

    if (normalizedEndDate < normalizedStartDate) {
      throw new BadRequestException(
        'A data final da campanha deve ser maior ou igual a data inicial.',
      );
    }

    if (dispatchAt > normalizedEndDate) {
      throw new BadRequestException(
        'O horario de disparo precisa estar dentro da janela da campanha.',
      );
    }

    const minimumWindowMs = 59 * 60 * 1000;
    if (dispatchAt.getTime() - Date.now() < minimumWindowMs) {
      throw new BadRequestException({
        code: 'CAMPAIGN_DISPATCH_TOO_SOON',
        message:
          'O disparo da campanha precisa estar agendado com no minimo 59 minutos de antecedencia.',
      });
    }
  }

  private normalizeCampaignBoundary(
    date: string | Date,
    timeZone: string,
    boundary: 'start' | 'end',
  ) {
    const zonedDate = this.toDateTimeInZone(date, timeZone);
    return (boundary === 'start'
      ? zonedDate.startOf('day')
      : zonedDate.endOf('day'))
      .toUTC()
      .toJSDate();
  }

  private toDateTimeInZone(date: string | Date, timeZone: string) {
    const baseDate = date instanceof Date ? date : new Date(date);
    const zone = this.resolveTimeZone(timeZone);
    return DateTime.fromJSDate(baseDate, { zone });
  }

  private resolveTimeZone(timeZone: string | null | undefined) {
    const safeZone = String(timeZone ?? '').trim() || 'America/Sao_Paulo';
    const current = DateTime.now().setZone(safeZone);

    if (current.isValid) {
      return safeZone;
    }

    this.logger.warn(
      `Timezone invalida "${safeZone}" na campanha. Aplicando America/Sao_Paulo como fallback.`,
    );

    return 'America/Sao_Paulo';
  }

  private buildWarnings(removedClients: TemplateMapVar[]) {
    return removedClients.map((client) => ({
      doc: client.cnpj_cpf,
      reason: 'MISSING_REQUIRED_TEMPLATE_VARS',
    }));
  }

  private notifyMetricsRefresh(account: string | null | undefined) {
    const safeAccount = String(account ?? '').trim();
    if (!safeAccount) return;
    this.campaignMetricsGateway.emitCampaignsSync(safeAccount);
  }

  private async invalidateCampaignCache(account: string | null | undefined) {
    const safeAccount = String(account ?? '').trim();
    if (!safeAccount) return;
    await this.redisService.delByPrefix(`campaigns:${safeAccount}:`);
  }

  private normalizeMetricsFilters(filters?: {
    search?: string;
    category?: string;
  }) {
    const search = String(filters?.search ?? '').trim().toLowerCase();
    const category = String(filters?.category ?? '').trim().toLowerCase();

    return {
      search,
      category,
    };
  }

  private buildMetricsCacheKey(
    account: string,
    filters: { search: string; category: string },
  ) {
    const searchKey = encodeURIComponent(filters.search || 'all');
    const categoryKey = encodeURIComponent(filters.category || 'all');
    return `campaigns:${account}:metrics:${searchKey}:${categoryKey}`;
  }

  private applyCampaignMetricsFilters(
    campaigns: Campaign[],
    filters: { search: string; category: string },
  ) {
    return campaigns.filter((campaign) => {
      const campaignName = String(campaign.name ?? '').trim().toLowerCase();
      const categoryName = String(campaign.category?.name ?? '')
        .trim()
        .toLowerCase();

      const matchesSearch =
        !filters.search || campaignName.includes(filters.search);
      const matchesCategory =
        !filters.category || categoryName === filters.category;

      return matchesSearch && matchesCategory;
    });
  }

  private normalizePhone(number: string | null | undefined) {
    return String(number ?? '').replace(/\D/g, '');
  }

  private isCollectionRelatory(relatory: RelatoryDispatchTemplate) {
    const templateCategory = String(relatory.template?.category ?? '').toLowerCase();
    const campaignCategory = String(relatory.campaign?.category?.name ?? '').toLowerCase();

    return (
      templateCategory.includes('cobr') ||
      campaignCategory.includes('cobr')
    );
  }

  private async getAccountByCompanyId(companyId: string) {
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
      select: { account_chatwoot: true },
    });

    return company?.account_chatwoot ?? null;
  }

  private async getAccountByCampaignId(campaignId: string) {
    const campaign = await this.campaignRepository.findOne({
      where: { id: campaignId },
      relations: ['company'],
      select: {
        id: true,
        company: {
          account_chatwoot: true,
        },
      },
    });

    return campaign?.company?.account_chatwoot ?? null;
  }

  private async getDispatchStats(account: string, campaignIds: string[]) {
    if (campaignIds.length === 0) {
      return 0;
    }

    const todayStart = new Date();
    todayStart.setHours(0,0,0,0);
  
    const todayEnd = new Date();
    todayEnd.setHours(23,59,59,999);

    return this.relatoryRepository
      .createQueryBuilder('relatory')
      .innerJoin('relatory.company', 'company')
      .where('company.account_chatwoot = :account', { account })
      .andWhere('relatory.date_dispatch BETWEEN :todayStart AND :todayEnd', {
        todayStart,
        todayEnd,
      })
      .andWhere('relatory.campaignId IS NOT NULL')
      .andWhere('relatory.campaignId IN (:...campaignIds)', { campaignIds })
      .getCount();
  }

  private async calculateDeliveryRate(
    account: string,
    now: Date,
    campaignIds: string[],
  ) {
    if (campaignIds.length === 0) {
      return this.emptyDeliveryMetrics;
    }

    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const last24h = new Date(now.getTime() - 86400000);
  
    const result = await this.relatoryRepository.query(`
      SELECT 
        COUNT(*) AS total_all,
  
        COUNT(*) FILTER (
          WHERE status_sent IN ('sent','delivered','read')
        ) AS success_all,

        COUNT(*) FILTER (
          WHERE date_dispatch >= $2
        ) AS total_today,

        COUNT(*) FILTER (
          WHERE date_dispatch >= $2
          AND status_sent IN ('sent','delivered','read')
        ) AS success_today,
  
        COUNT(*) FILTER (
          WHERE date_dispatch >= $3
        ) AS total_24h,
  
        COUNT(*) FILTER (
          WHERE date_dispatch >= $3
          AND status_sent IN ('sent','delivered','read')
        ) AS success_24h,
  
        ROUND(
          COUNT(*) FILTER (
            WHERE status_sent IN ('sent','delivered','read')
          ) * 100.0 / NULLIF(COUNT(*),0)
        ,1) AS delivery_rate_total,

        ROUND(
          COUNT(*) FILTER (
            WHERE date_dispatch >= $2
            AND status_sent IN ('sent','delivered','read')
          ) * 100.0 /
          NULLIF(
            COUNT(*) FILTER (
              WHERE date_dispatch >= $2
            ),0)
        ,1) AS delivery_rate_today,
  
        ROUND(
          COUNT(*) FILTER (
            WHERE date_dispatch >= $3
            AND status_sent IN ('sent','delivered','read')
          ) * 100.0 /
          NULLIF(
            COUNT(*) FILTER (
              WHERE date_dispatch >= $3
            ),0)
        ,1) AS delivery_rate_24h
  
      FROM relatory_dispatch_template
      WHERE "companyId" = (
        SELECT id FROM company WHERE account_chatwoot = $1
      )
        AND "campaignId" IS NOT NULL
        AND "campaignId" = ANY($4::uuid[])
    `, [account, todayStart, last24h, campaignIds]);
  
    return {
      totalDispatch: Number(result[0].total_all),
      totalDispatchSuccess: Number(result[0].success_all),

      totalDispatchToday: Number(result[0].total_today),
      totalDispatchSuccessToday: Number(result[0].success_today),
      totalDispatch24h: Number(result[0].total_24h),
      totalDispatchSuccess24h: Number(result[0].success_24h),

      deliveryRateTotal: Number(result[0].delivery_rate_total),
      deliveryRateToday: Number(result[0].delivery_rate_today),
      deliveryRate24h: Number(result[0].delivery_rate_24h)
    };
  }

  private getNextDispatch(campaigns: Campaign[], now: Date) {
    let nextDate: Date | null = null;
    let count = 0;
    let nextTimeZone = 'America/Sao_Paulo';

    for (const campaign of campaigns) {
      if (!campaign.isEnabled) continue;
      if (campaign.status === 'finished') continue;
      const timeZone = this.resolveTimeZone(campaign.timezone);
      const nowInZone = this.toDateTimeInZone(now, timeZone);
      const startDay = this.toDateTimeInZone(
        campaign.startDate,
        timeZone,
      ).startOf('day');
      const endDay = this.toDateTimeInZone(
        campaign.endDate,
        timeZone,
      ).startOf('day');

      if (
        !startDay.isValid ||
        !endDay.isValid ||
        endDay.toMillis() < nowInZone.startOf('day').toMillis()
      ) {
        continue;
      }

      const [parsedHour, parsedMinute] = String(campaign.dispatchTime ?? '00:00')
        .split(':')
        .map(Number);
      const hour = Number.isFinite(parsedHour) ? parsedHour : 0;
      const minute = Number.isFinite(parsedMinute) ? parsedMinute : 0;

      let candidate = campaign.recurring
        ? nowInZone.set({ hour, minute, second: 0, millisecond: 0 })
        : startDay.set({ hour, minute, second: 0, millisecond: 0 });

      if (campaign.recurring) {
        if (candidate.toMillis() <= nowInZone.toMillis()) {
          candidate = candidate.plus({ days: 1 });
        }

        if (candidate.startOf('day').toMillis() < startDay.toMillis()) {
          candidate = startDay.set({ hour, minute, second: 0, millisecond: 0 });
        }
      } else if (candidate.toMillis() <= nowInZone.toMillis()) {
        continue;
      }

      if (candidate.startOf('day').toMillis() > endDay.toMillis()) {
        continue;
      }

      const candidateDate = candidate.toUTC().toJSDate();

      if (!nextDate || candidateDate < nextDate) {
        nextDate = candidateDate;
        nextTimeZone = timeZone;
        count = 1;
      } else if (candidateDate.getTime() === nextDate.getTime()) {
        count++;
      }
    }

    if (!nextDate) return null;

    const dispatchDayKey = this.getDayKey(nextDate, nextTimeZone);
    const nowDayKey = this.getDayKey(now, nextTimeZone);

    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowDayKey = this.getDayKey(tomorrow, nextTimeZone);

    const dateLabel =
      dispatchDayKey === nowDayKey
        ? 'Hoje'
        : dispatchDayKey === tomorrowDayKey
          ? 'Amanhã'
          : nextDate.toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: '2-digit',
              timeZone: nextTimeZone,
            });

    const campaignLabel = count === 1 ? 'campanha' : 'campanhas';

    return {
      nextDispatchTime: nextDate.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: nextTimeZone,
      }),
      nextDispatchDate: dateLabel,
      label: `${dateLabel} · ${count} ${campaignLabel}`,
    };
  }

  private getDayKey(date: Date, timeZone: string) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }

  private getZonedParts(date: Date, timeZone: string) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(date);

    const get = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)?.value ?? 0);

    return {
      year: get('year'),
      month: get('month'),
      day: get('day'),
      hour: get('hour'),
      minute: get('minute'),
      second: get('second'),
    };
  }

  private getTimeZoneOffsetMs(date: Date, timeZone: string) {
    const zoned = this.getZonedParts(date, timeZone);
    const zonedAsUtc = Date.UTC(
      zoned.year,
      zoned.month - 1,
      zoned.day,
      zoned.hour,
      zoned.minute,
      zoned.second,
    );

    return zonedAsUtc - date.getTime();
  }

  private toUtcFromZonedDateTime(params: {
    timezone: string;
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
  }) {
    const guessUtc = new Date(
      Date.UTC(
        params.year,
        params.month - 1,
        params.day,
        params.hour,
        params.minute,
        params.second,
      ),
    );

    const offsetMs = this.getTimeZoneOffsetMs(guessUtc, params.timezone);
    return new Date(guessUtc.getTime() - offsetMs);
  }
}
