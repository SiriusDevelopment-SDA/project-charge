import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, ILike, Not, Repository } from 'typeorm';
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

@Injectable()
export class CampaignsService {
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
  ) {}

  async create(createDto: CreateCampaignDto) {
    await this.ensureCampaignNameIsUnique(createDto.name);
    this.validateMinimumDispatchWindow(createDto);

    const template = await this.templatesService.getTemplateOrFail(
      createDto.templateId,
    );

    const requiredKeys =
      this.templatesService.extractRequiredTemplateVars(template);

    const { validClients, removedClients } =
      this.clientService.filterClientsByRequiredVars(
        createDto.templateMapVars,
        requiredKeys,
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
    const cacheKey = `campaigns:${safeAccount}:list`;
    const cached = await this.redisService.get<Campaign[]>(cacheKey);
    if (cached) return cached;

    const campaigns = await this.campaignRepository.find({
      where: { company: { account_chatwoot: String(account) } },
      relations: ['template', 'category'],
      order: { createdAt: 'DESC' },
    });

    await this.redisService.set(cacheKey, campaigns, 20);
    return campaigns;
  }

  async remove(id: string) {
    const campaign = await this.findOne(id);
    const account = campaign.company?.account_chatwoot ?? null;

    try {
      await this.campaignRepository.remove(campaign);
      await this.invalidateCampaignCache(account);
      this.notifyMetricsRefresh(account);
      return {
        campaignId: campaign.id,
        message: 'Campanha deletada com sucesso!',
        status: 'success',
      };
    } catch {
      return {
        campaignId: campaign.id,
        message: 'Erro ao deletar campanha',
        status: 'error',
      };
    }
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
    const dispatchAt = this.getDispatchDate(
      createDto.startDate,
      createDto.dispatchTime,
    );

    const validClientIds = Array.from(
      new Set(validClients.map((client) => client.clientId).filter(Boolean)),
    );

    const campaign = this.campaignRepository.create({
      ...createDto,
      status: dispatchAt > new Date() ? 'queue' : 'pending',
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

  async getMetricsByAccount(account: string) {
    const safeAccount = String(account ?? '').trim();
    if (!safeAccount) {
      throw new BadRequestException('account e obrigatorio');
    }

    const cacheKey = `campaigns:${safeAccount}:metrics`;

    const cached = await this.redisService.get(cacheKey);
    if (cached && this.hasCompleteDeliveryMetrics(cached)) {
      return cached;
    }

    const now = new Date();

    const campaigns = await this.findByAccount(safeAccount);

    const [dispatchStats, deliveryMetrics, nextDispatch] = await Promise.all([
      this.getDispatchStats(safeAccount),
      this.calculateDeliveryRate(safeAccount, now),
      this.getNextDispatch(campaigns, now),
    ]);

    const payload = {
      totalCampaigns: campaigns.length,
      activeCampaigns: campaigns.filter((campaign) => campaign.isEnabled).length,
      dispatchesToday: dispatchStats,
      totalDispatch: deliveryMetrics.totalDispatch,
      totalDispatchSuccess: deliveryMetrics.totalDispatchSuccess,
      totalDispatch24h: deliveryMetrics.totalDispatch24h,
      totalDispatchSuccess24h: deliveryMetrics.totalDispatchSuccess24h,
      deliveryRateTotal: deliveryMetrics.deliveryRateTotal,
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
      'totalDispatch24h',
      'totalDispatchSuccess24h',
      'deliveryRateTotal',
      'deliveryRate24h',
    ];

    return numericKeys.every((key) => {
      const value = data[key];
      return typeof value === 'number' && Number.isFinite(value);
    });
  }


  ///funcoes extras
  private getDispatchDate(startDate: string, dispatchTime: string) {
    const [hour, minute] = dispatchTime.split(':').map(Number);
    const date = new Date(startDate);
    date.setHours(hour, minute, 0, 0);
    return date;
  }

  private validateMinimumDispatchWindow(createDto: CreateCampaignDto) {
    const dispatchAt = this.getDispatchDate(
      createDto.startDate,
      createDto.dispatchTime,
    );
    const minimumWindowMs = 59 * 60 * 1000;

    if (dispatchAt.getTime() - Date.now() < minimumWindowMs) {
      throw new BadRequestException({
        code: 'CAMPAIGN_DISPATCH_TOO_SOON',
        message:
          'O disparo da campanha precisa estar agendado com no minimo 59 minutos de antecedencia.',
      });
    }
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

  private async getDispatchStats(account: string) {
    const todayStart = new Date();
    todayStart.setHours(0,0,0,0);
  
    const todayEnd = new Date();
    todayEnd.setHours(23,59,59,999);
  
    return this.relatoryRepository.count({
      where: {
        company: { account_chatwoot: account },
        date_dispatch: Between(todayStart, todayEnd)
      }
    });
  }

  private async calculateDeliveryRate(account: string, now: Date) {
    const last24h = new Date(now.getTime() - 86400000);
  
    const result = await this.relatoryRepository.query(`
      SELECT 
        COUNT(*) AS total_all,
  
        COUNT(*) FILTER (
          WHERE status_sent IN ('sent','delivered','read')
        ) AS success_all,
  
        COUNT(*) FILTER (
          WHERE date_dispatch >= $2
        ) AS total_24h,
  
        COUNT(*) FILTER (
          WHERE date_dispatch >= $2
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
        ,1) AS delivery_rate_24h
  
      FROM relatory_dispatch_template
      WHERE "companyId" = (
        SELECT id FROM company WHERE account_chatwoot = $1
      )
    `, [account, last24h]);
  
    return {
      totalDispatch: Number(result[0].total_all),
      totalDispatchSuccess: Number(result[0].success_all),
    
      totalDispatch24h: Number(result[0].total_24h),
      totalDispatchSuccess24h: Number(result[0].success_24h),
    
      deliveryRateTotal: Number(result[0].delivery_rate_total),
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

      const start = new Date(campaign.startDate);
      const end = new Date(campaign.endDate);

      if (
        Number.isNaN(start.getTime()) ||
        Number.isNaN(end.getTime()) ||
        end < now
      ) {
        continue;
      }

      const [parsedHour, parsedMinute] = String(
        campaign.dispatchTime ?? '00:00',
      )
        .split(':')
        .map(Number);

      const hour = Number.isFinite(parsedHour) ? parsedHour : 0;
      const minute = Number.isFinite(parsedMinute) ? parsedMinute : 0;
      const timeZone = campaign.timezone ?? 'America/Sao_Paulo';

      let candidate: Date | null = null;

      if (campaign.recurring) {
        const base = start > now ? start : now;
        const baseParts = this.getZonedParts(base, timeZone);

        candidate = this.toUtcFromZonedDateTime({
          timezone: timeZone,
          year: baseParts.year,
          month: baseParts.month,
          day: baseParts.day,
          hour,
          minute,
          second: 0,
        });

        if (candidate < base) {
          const nextDay = new Date(
            Date.UTC(baseParts.year, baseParts.month - 1, baseParts.day),
          );
          nextDay.setUTCDate(nextDay.getUTCDate() + 1);

          candidate = this.toUtcFromZonedDateTime({
            timezone: timeZone,
            year: nextDay.getUTCFullYear(),
            month: nextDay.getUTCMonth() + 1,
            day: nextDay.getUTCDate(),
            hour,
            minute,
            second: 0,
          });
        }
      } else {
        const startParts = this.getZonedParts(start, timeZone);
        candidate = this.toUtcFromZonedDateTime({
          timezone: timeZone,
          year: startParts.year,
          month: startParts.month,
          day: startParts.day,
          hour,
          minute,
          second: 0,
        });

        if (candidate < now) {
          candidate = null;
        }
      }

      if (!candidate) continue;
      if (candidate < start || candidate > end) continue;

      if (!nextDate || candidate < nextDate) {
        nextDate = candidate;
        nextTimeZone = timeZone;
        count = 1;
      } else if (candidate.getTime() === nextDate.getTime()) {
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
