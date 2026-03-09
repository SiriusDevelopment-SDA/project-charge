import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, ILike, Repository } from 'typeorm';

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

  async getMetricsByAccount(account: string) {
    const safeAccount = String(account ?? '').trim();
    const cacheKey = `campaigns:${safeAccount}:metrics`;
    const cached = await this.redisService.get<any>(cacheKey);
    if (cached) return cached;

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [campaigns, relatoriesToday, relatories24h] = await Promise.all([
      this.findByAccount(account),
      this.relatoryRepository.find({
        where: {
          company: { account_chatwoot: String(account) },
          date_dispatch: Between(todayStart, todayEnd),
        },
      }),
      this.relatoryRepository.find({
        where: {
          company: { account_chatwoot: String(account) },
          date_dispatch: Between(last24h, now),
        },
      }),
    ]);

    const activeCampaigns = campaigns.filter((campaign) => campaign.isEnabled).length;
    const totalCampaigns = campaigns.length;
    const dispatchesToday = relatoriesToday.length;

    const success24h = relatories24h.filter((relatory) => {
      const normalized = String(relatory.status_sent ?? '').toLowerCase();
      return !normalized.includes('error') && !normalized.includes('fail');
    }).length;

    const deliveryRate24h = relatories24h.length
      ? Number(((success24h / relatories24h.length) * 100).toFixed(1))
      : 0;

    const enabledCampaigns = campaigns.filter((campaign) => campaign.isEnabled);

    const nextDispatchCandidates = enabledCampaigns
      .map((campaign) => ({
        campaignId: campaign.id,
        timezone: campaign.timezone ?? 'America/Sao_Paulo',
        nextDispatchAt: this.getNextDispatchAt(campaign, now),
      }))
      .filter(
        (
          candidate,
        ): candidate is {
          campaignId: string;
          timezone: string;
          nextDispatchAt: Date;
        } =>
          candidate.nextDispatchAt instanceof Date,
      )
      .sort((a, b) => a.nextDispatchAt.getTime() - b.nextDispatchAt.getTime());

    const nextDispatchData = nextDispatchCandidates[0];
    const nextDispatch = nextDispatchData?.nextDispatchAt ?? null;
    const nextDispatchTimezone =
      nextDispatchData?.timezone ?? 'America/Sao_Paulo';
    const nextDispatchCount = nextDispatch
      ? nextDispatchCandidates.filter(
          (candidate) => candidate.nextDispatchAt.getTime() === nextDispatch.getTime(),
        ).length
      : 0;

    const payload = {
      totalCampaigns,
      activeCampaigns,
      dispatchesToday,
      deliveryRate24h,
      nextDispatchTime: nextDispatch
        ? nextDispatch.toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: nextDispatchTimezone,
          })
        : null,
      nextDispatchLabel: this.getNextDispatchLabel(
        nextDispatch,
        nextDispatchCount,
        now,
        nextDispatchTimezone,
      ),
    };

    await this.redisService.set(cacheKey, payload, 10);
    return payload;
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

  private getNextDispatchAt(campaign: Campaign, now: Date): Date | null {
    const [hour, minute] = (campaign.dispatchTime ?? '00:00')
      .split(':')
      .map(Number);

    const start = new Date(campaign.startDate);
    const end = new Date(campaign.endDate);

    if (!campaign.recurring) {
      const dispatchAt = new Date(start);
      dispatchAt.setHours(hour, minute, 0, 0);
      return dispatchAt >= now ? dispatchAt : null;
    }

    if (now > end) return null;

    const candidate = new Date(now);
    candidate.setHours(hour, minute, 0, 0);

    if (candidate < now) {
      candidate.setDate(candidate.getDate() + 1);
    }

    if (candidate < start) {
      candidate.setTime(start.getTime());
      candidate.setHours(hour, minute, 0, 0);
    }

    if (candidate > end) return null;

    return candidate;
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

  private getNextDispatchLabel(
    nextDispatch: Date | null,
    nextDispatchCount: number,
    now: Date,
    timeZone: string,
  ) {
    if (!nextDispatch) return 'Sem disparos agendados';

    const dispatchDayKey = this.getDayKey(nextDispatch, timeZone);
    const nowDayKey = this.getDayKey(now, timeZone);

    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowDayKey = this.getDayKey(tomorrow, timeZone);

    const sameDay = dispatchDayKey === nowDayKey;
    const isTomorrow = dispatchDayKey === tomorrowDayKey;

    const dateLabel = sameDay
      ? 'Hoje'
      : isTomorrow
        ? 'Amanhã'
        : nextDispatch.toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            timeZone,
          });

    const count = Number(nextDispatchCount) || 0;
    const campaignLabel = count === 1 ? 'campanha' : 'campanhas';
    return `${dateLabel} · ${count} ${campaignLabel}`;
  }

  private getDayKey(date: Date, timeZone: string) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }
}
