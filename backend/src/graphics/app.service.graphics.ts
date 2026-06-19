import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Invoice } from '../invoices/entities/invoices';
import { Client } from '../clients/entities.ts/clients';
import { RelatoryDispatchTemplate } from '../templates/entities/relatory.entity';
import { Templates } from '../templates/entities/templatesMeta';
import { Campaign } from '../campaigns/entities/campanhas.entity';
import { DispatchBatch } from '../message-queue/entities/dispatch-batch.entity';
import { PaymentPromise } from '../payment-promise/entities/payment-promise.entity';
import { RedisService } from '../redis/redis.service';
import { extractChargedAmount } from './charged-amount.util';

const CACHE_TTL = 300; // seconds (5 minutes — dados de cobrança não mudam por segundo)

@Injectable()
export class AppServiceGraphics {

  /** Prevents thundering herd: concurrent requests share one in-flight compute promise per cache key. */
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,

    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,

    @InjectRepository(DispatchBatch)
    private readonly dispatchBatchRepo: Repository<DispatchBatch>,

    @InjectRepository(RelatoryDispatchTemplate)
    private readonly relatoryRepo: Repository<RelatoryDispatchTemplate>,

    @InjectRepository(Templates)
    private readonly templatesRepo: Repository<Templates>,

    @InjectRepository(Campaign)
    private readonly campaignRepo: Repository<Campaign>,

    @InjectRepository(PaymentPromise)
    private readonly paymentPromiseRepo: Repository<PaymentPromise>,

    private readonly redisService: RedisService,
  ) { }

  /** Ensures only one in-flight compute runs at a time for a given cache key. */
  private async withSingleFlight<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key);
    if (existing) return existing as Promise<T>;

    const promise = fn().finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, promise);
    return promise;
  }

  async getCharges(companyId: string) {
    const cacheKey = `graphics:${companyId}:charges`;
    const cached = await this.redisService.get<ReturnType<typeof this._computeCharges>>(cacheKey);
    if (cached) return cached;

    const result = await this._computeCharges(companyId);
    await this.redisService.set(cacheKey, result, CACHE_TTL);
    return result;
  }

  private async _computeCharges(companyId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1; // 1-12

    const dueDateSql = `CASE
      WHEN invoice.expiration ~ '^\\d{2}/\\d{2}/\\d{4}$' THEN TO_DATE(invoice.expiration, 'DD/MM/YYYY')
      WHEN invoice.expiration ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN TO_DATE(invoice.expiration, 'YYYY-MM-DD')
      ELSE NULL
    END`;

    const [totalClients, overdueRows, paidRows] = await Promise.all([
      this.clientRepo
        .createQueryBuilder('client')
        .innerJoin('client.company', 'company')
        .where('company.id = :companyId', { companyId })
        .getCount(),

      // Monthly overdue count grouped by due date month (current year, up to current month)
      this.invoiceRepo
        .createQueryBuilder('invoice')
        .innerJoin('invoice.client', 'client')
        .innerJoin('invoice.company', 'company')
        .where('company.id = :companyId', { companyId })
        .andWhere("LOWER(TRIM(invoice.status)) = 'a receber'")
        .andWhere(`${dueDateSql} < :today`, { today: todayStr })
        .andWhere(`EXTRACT(YEAR FROM ${dueDateSql}) = :year`, { year: currentYear })
        .andWhere(`EXTRACT(MONTH FROM ${dueDateSql}) <= :month`, { month: currentMonth })
        .select(`EXTRACT(MONTH FROM ${dueDateSql})`, 'monthNum')
        .addSelect(`regexp_replace(COALESCE(client.cnpj_cpf, ''), '\\D', '', 'g')`, 'cnpj_cpf')
        .getRawMany<{ monthNum: string; cnpj_cpf: string }>(),

      // Monthly paid invoice count grouped by lastSyncAt month (current year, up to current month)
      this.invoiceRepo
        .createQueryBuilder('invoice')
        .innerJoin('invoice.company', 'company')
        .where('company.id = :companyId', { companyId })
        .andWhere("LOWER(TRIM(invoice.status)) = 'pago'")
        .andWhere('invoice.lastSyncAt IS NOT NULL')
        .andWhere('EXTRACT(YEAR FROM invoice.lastSyncAt) = :year', { year: currentYear })
        .andWhere('EXTRACT(MONTH FROM invoice.lastSyncAt) <= :month', { month: currentMonth })
        .select('EXTRACT(MONTH FROM invoice.lastSyncAt)', 'monthNum')
        .addSelect('COUNT(invoice.id)', 'count')
        .groupBy('EXTRACT(MONTH FROM invoice.lastSyncAt)')
        .getRawMany<{ monthNum: string; count: string }>(),
    ]);

    // Totals for KPI delinquency rate — cnpj_cpf já vem normalizado da query
    const defaultCount = new Set(overdueRows.map((r) => r.cnpj_cpf).filter(Boolean)).size;
    const paymentsCount = totalClients - defaultCount;

    // Monthly inadimplência: distinct clients per month
    const monthlyOverdueMap = new Map<number, Set<string>>();
    for (const row of overdueRows) {
      const m = Math.round(parseFloat(row.monthNum));
      if (!monthlyOverdueMap.has(m)) monthlyOverdueMap.set(m, new Set());
      if (row.cnpj_cpf) monthlyOverdueMap.get(m)!.add(row.cnpj_cpf);
    }

    // Monthly pagamentos from paidRows
    const monthlyPaidMap = new Map<number, number>();
    for (const row of paidRows) {
      const m = Math.round(parseFloat(row.monthNum));
      monthlyPaidMap.set(m, parseInt(row.count) || 0);
    }

    // Build months array Jan..currentMonth
    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const months = [];
    for (let m = 1; m <= currentMonth; m++) {
      months.push({
        month: monthNames[m - 1],
        default: monthlyOverdueMap.get(m)?.size ?? 0,
        payments: monthlyPaidMap.get(m) ?? 0,
      });
    }

    return { inadimplentes: defaultCount, pagamentos: paymentsCount, months };
  }

  async getMonthlyDispatches(companyId: string) {
    const cacheKey = `graphics:${companyId}:dispatches`;
    const cached = await this.redisService.get<Awaited<ReturnType<typeof this._computeMonthlyDispatches>>>(cacheKey);
    if (cached) return cached;

    const result = await this._computeMonthlyDispatches(companyId);
    await this.redisService.set(cacheKey, result, CACHE_TTL);
    return result;
  }

  private async _computeMonthlyDispatches(companyId: string) {
    const currentYear = new Date().getFullYear();

    const results = await this.dispatchBatchRepo
      .createQueryBuilder('batch')
      .select('EXTRACT(MONTH FROM batch.createdAt)', 'month')
      .addSelect('SUM(batch.totalRecipients)', 'total')
      .where('batch.company = :companyId', { companyId })
      .andWhere('EXTRACT(YEAR FROM batch.createdAt) = :year', { year: currentYear })
      .groupBy('EXTRACT(MONTH FROM batch.createdAt)')
      .orderBy('EXTRACT(MONTH FROM batch.createdAt)', 'ASC')
      .getRawMany();

    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

    const monthsMap = new Map(
      monthNames.map((name, index) => [index + 1, { month: name, value: 0 }])
    );

    results.forEach(row => {
      const monthNum = parseInt(row.month);
      const entry = monthsMap.get(monthNum);
      if (entry) {
        entry.value = parseInt(row.total) || 0;
      }
    });

    return Array.from(monthsMap.values());
  }

  async getMonthlyReturnRate(companyId: string) {
    const cacheKey = `graphics:${companyId}:return-rate`;
    const cached = await this.redisService.get<Awaited<ReturnType<typeof this._computeMonthlyReturnRate>>>(cacheKey);
    if (cached) return cached;

    const result = await this._computeMonthlyReturnRate(companyId);
    await this.redisService.set(cacheKey, result, CACHE_TTL);
    return result;
  }

  private async _computeMonthlyReturnRate(companyId: string) {
    const currentYear = new Date().getFullYear();
    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

    const disparos = await this.relatoryRepo
      .createQueryBuilder('r')
      .innerJoin('r.template', 't')
      .select('EXTRACT(MONTH FROM r.date_dispatch)', 'month')
      .addSelect('COUNT(r.id)', 'total')
      .where('r.company = :companyId', { companyId })
      .andWhere('EXTRACT(YEAR FROM r.date_dispatch) = :year', { year: currentYear })
      .andWhere("LOWER(t.category) LIKE '%cobr%'")
      .groupBy('EXTRACT(MONTH FROM r.date_dispatch)')
      .getRawMany();

    const retornos = await this.relatoryRepo
      .createQueryBuilder('r')
      .innerJoin('r.template', 't')
      .select('EXTRACT(MONTH FROM r.date_dispatch)', 'month')
      .addSelect('COUNT(r.id)', 'total')
      .where('r.company = :companyId', { companyId })
      .andWhere('r.response = true')
      .andWhere('EXTRACT(YEAR FROM r.date_dispatch) = :year', { year: currentYear })
      .andWhere("LOWER(t.category) LIKE '%cobr%'")
      .groupBy('EXTRACT(MONTH FROM r.date_dispatch)')
      .getRawMany();

    const monthsMap = new Map(
      monthNames.map((name, i) => [i + 1, { month: name, disparo: 0, retorno: 0 }])
    );

    disparos.forEach(row => {
      const entry = monthsMap.get(parseInt(row.month));
      if (entry) entry.disparo = parseInt(row.total) || 0;
    });

    retornos.forEach(row => {
      const entry = monthsMap.get(parseInt(row.month));
      if (entry) entry.retorno = parseInt(row.total) || 0;
    });

    return Array.from(monthsMap.values());
  }

  // Resolve por `account` (account_chatwoot da empresa VISUALIZADA), igual ao
  // resto do dashboard (collections metrics) e à tela Campanhas. Antes usava o
  // id da empresa do usuário LOGADO (me.company.id), que difere da empresa
  // visualizada quando um super_admin troca de conta — fazia a aba vir vazia.
  async getCampaignsStats(account: string) {
    const cacheKey = `graphics:account:${account}:campaigns`;
    const cached = await this.redisService.get<Awaited<ReturnType<typeof this._computeCampaignsStats>>>(cacheKey);
    if (cached) return cached;

    return this.withSingleFlight(cacheKey, async () => {
      const result = await this._computeCampaignsStats(account);
      await this.redisService.set(cacheKey, result, CACHE_TTL);
      return result;
    });
  }

  private async _computeCampaignsStats(account: string) {
    const campaigns = await this.campaignRepo.find({
      where: { company: { account_chatwoot: String(account) } },
      select: { id: true, name: true },
      order: { createdAt: 'DESC' },
      take: 10,
    });

    if (campaigns.length === 0) return [];

    const campaignIds = campaigns.map((c) => c.id);

    // 2 aggregation queries instead of 30 (10 campaigns × 3 per-campaign queries).
    // Each query fans out over all campaign IDs at once, eliminating connection pool pressure.
    const [clientRows, dispatchRows] = await Promise.all([
      this.campaignRepo.manager.query<{ campaignId: string; count: string }[]>(
        `SELECT "campaignId", COUNT("clientId") AS count
         FROM campaign_clients
         WHERE "campaignId" = ANY($1)
         GROUP BY "campaignId"`,
        [campaignIds],
      ),
      this.relatoryRepo.manager.query<{ campaignId: string; totalDispatched: string; totalResponded: string }[]>(
        `SELECT "campaignId",
                COUNT(*) AS "totalDispatched",
                SUM(CASE WHEN response = true THEN 1 ELSE 0 END) AS "totalResponded"
         FROM relatory_dispatch_template
         WHERE "campaignId" = ANY($1)
         GROUP BY "campaignId"`,
        [campaignIds],
      ),
    ]);

    const clientMap = new Map(clientRows.map((r) => [r.campaignId, parseInt(r.count) || 0]));
    const dispatchMap = new Map(dispatchRows.map((r) => [r.campaignId, {
      dispatched: parseInt(r.totalDispatched) || 0,
      responded: parseInt(r.totalResponded) || 0,
    }]));

    return campaigns.map((campaign, index) => {
      const totalClients = clientMap.get(campaign.id) ?? 0;
      const d = dispatchMap.get(campaign.id);
      const totalDispatched = d?.dispatched ?? 0;
      const totalResponded = d?.responded ?? 0;

      const usage = totalClients > 0
        ? Math.min(Math.round((totalDispatched / totalClients) * 100), 100)
        : 0;

      const response = totalDispatched > 0
        ? Math.round((totalResponded / totalDispatched) * 100)
        : 0;

      return {
        id: String(index + 1).padStart(2, '0'),
        name: campaign.name,
        usage,
        response,
      };
    });
  }

  async getPaymentPromisesStats(companyId: string) {
    const cacheKey = `graphics:${companyId}:promises`;
    const cached = await this.redisService.get<Awaited<ReturnType<typeof this._computePaymentPromisesStats>>>(cacheKey);
    if (cached) return cached;
    const result = await this._computePaymentPromisesStats(companyId);
    await this.redisService.set(cacheKey, result, CACHE_TTL);
    return result;
  }

  private async _computePaymentPromisesStats(companyId: string) {
    const currentYear = new Date().getFullYear();
    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

    const [statusRows, monthlyRows] = await Promise.all([
      this.paymentPromiseRepo
        .createQueryBuilder('pp')
        .select('pp.status', 'status')
        .addSelect('COUNT(pp.id)', 'count')
        .addSelect('SUM(pp.promised_amount)', 'amount')
        .where('pp.company_id = :companyId', { companyId })
        .groupBy('pp.status')
        .getRawMany<{ status: string; count: string; amount: string }>(),

      this.paymentPromiseRepo
        .createQueryBuilder('pp')
        .select('EXTRACT(MONTH FROM pp.created_at)', 'month')
        .addSelect('COUNT(pp.id)', 'total')
        .addSelect("SUM(CASE WHEN pp.status = 'kept' THEN 1 ELSE 0 END)", 'kept')
        .where('pp.company_id = :companyId', { companyId })
        .andWhere('EXTRACT(YEAR FROM pp.created_at) = :year', { year: currentYear })
        .groupBy('EXTRACT(MONTH FROM pp.created_at)')
        .getRawMany<{ month: string; total: string; kept: string }>(),
    ]);

    const byStatus = { kept: 0, broken: 0, pending: 0, cancelled: 0 };
    let keptAmount = 0;
    for (const row of statusRows) {
      const status = row.status as keyof typeof byStatus;
      if (status in byStatus) byStatus[status] = parseInt(row.count) || 0;
      if (status === 'kept') keptAmount = parseFloat(row.amount) || 0;
    }
    const total = byStatus.kept + byStatus.broken + byStatus.pending + byStatus.cancelled;
    const keptRate = total > 0 ? Math.round((byStatus.kept / total) * 100) : 0;

    const monthsMap = new Map(monthNames.map((name, i) => [i + 1, { month: name, total: 0, kept: 0 }]));
    for (const row of monthlyRows) {
      const entry = monthsMap.get(parseInt(row.month));
      if (entry) { entry.total = parseInt(row.total) || 0; entry.kept = parseInt(row.kept) || 0; }
    }

    return { total, ...byStatus, keptAmount, keptRate, monthly: Array.from(monthsMap.values()) };
  }

  async getDelinquencyAging(companyId: string) {
    const cacheKey = `graphics:${companyId}:aging`;
    const cached = await this.redisService.get<Awaited<ReturnType<typeof this._computeDelinquencyAging>>>(cacheKey);
    if (cached) return cached;
    const result = await this._computeDelinquencyAging(companyId);
    await this.redisService.set(cacheKey, result, CACHE_TTL);
    return result;
  }

  private async _computeDelinquencyAging(companyId: string) {
    const dueDateSql = `CASE
      WHEN invoice.expiration ~ '^\\d{2}/\\d{2}/\\d{4}$' THEN TO_DATE(invoice.expiration, 'DD/MM/YYYY')
      WHEN invoice.expiration ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN TO_DATE(invoice.expiration, 'YYYY-MM-DD')
      ELSE NULL
    END`;

    const daysOverdueSql = `(CURRENT_DATE - (${dueDateSql}))`;

    const bucketSql = `CASE
      WHEN ${daysOverdueSql} BETWEEN 1 AND 30 THEN '1-30 dias'
      WHEN ${daysOverdueSql} BETWEEN 31 AND 60 THEN '31-60 dias'
      WHEN ${daysOverdueSql} BETWEEN 61 AND 90 THEN '61-90 dias'
      WHEN ${daysOverdueSql} BETWEEN 91 AND 120 THEN '91-120 dias'
      WHEN ${daysOverdueSql} > 120 THEN '+120 dias'
      ELSE NULL
    END`;

    const rows = await this.invoiceRepo
      .createQueryBuilder('invoice')
      .innerJoin('invoice.company', 'company')
      .where('company.id = :companyId', { companyId })
      .andWhere("LOWER(TRIM(invoice.status)) = 'a receber'")
      .andWhere(`(${dueDateSql}) < CURRENT_DATE`)
      .andWhere(`(${dueDateSql}) IS NOT NULL`)
      .select(bucketSql, 'bucket')
      .addSelect('COUNT(invoice.id)', 'count')
      .addSelect('SUM(CAST(invoice.value AS numeric))', 'totalValue')
      .groupBy(bucketSql)
      .having(`(${bucketSql}) IS NOT NULL`)
      .getRawMany<{ bucket: string; count: string; totalValue: string }>();

    const order = ['1-30 dias', '31-60 dias', '61-90 dias', '91-120 dias', '+120 dias'];
    const map = new Map(order.map(label => [label, { label, count: 0, totalValue: 0 }]));
    for (const row of rows) {
      const entry = map.get(row.bucket);
      if (entry) { entry.count = parseInt(row.count) || 0; entry.totalValue = parseFloat(row.totalValue) || 0; }
    }

    return { buckets: Array.from(map.values()) };
  }

  async getPaymentForecast(companyId: string) {
    const cacheKey = `graphics:${companyId}:forecast`;
    const cached = await this.redisService.get<Awaited<ReturnType<typeof this._computePaymentForecast>>>(cacheKey);
    if (cached) return cached;
    const result = await this._computePaymentForecast(companyId);
    await this.redisService.set(cacheKey, result, CACHE_TTL);
    return result;
  }

  private async _computePaymentForecast(companyId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const future = new Date(today);
    future.setDate(future.getDate() + 30);

    const rows = await this.paymentPromiseRepo
      .createQueryBuilder('pp')
      .where('pp.company_id = :companyId', { companyId })
      .andWhere("pp.status = 'pending'")
      .andWhere('pp.promised_payment_date >= :today', { today: today.toISOString().split('T')[0] })
      .andWhere('pp.promised_payment_date <= :future', { future: future.toISOString().split('T')[0] })
      .select('pp.promised_payment_date', 'date')
      .addSelect('SUM(COALESCE(pp.promised_amount, pp.total_debt))', 'amount')
      .addSelect('COUNT(pp.id)', 'count')
      .groupBy('pp.promised_payment_date')
      .orderBy('pp.promised_payment_date', 'ASC')
      .getRawMany<{ date: string; amount: string; count: string }>();

    const weeks = [
      { label: 'Semana 1', amount: 0, count: 0 },
      { label: 'Semana 2', amount: 0, count: 0 },
      { label: 'Semana 3', amount: 0, count: 0 },
      { label: 'Semana 4+', amount: 0, count: 0 },
    ];

    for (const row of rows) {
      const date = new Date(row.date);
      const diffDays = Math.floor((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      const weekIdx = Math.min(Math.floor(diffDays / 7), 3);
      weeks[weekIdx].amount += parseFloat(row.amount) || 0;
      weeks[weekIdx].count += parseInt(row.count) || 0;
    }

    weeks.forEach(w => { w.amount = Math.round(w.amount * 100) / 100; });

    const total = weeks.reduce((sum, w) => sum + w.amount, 0);
    return { weeks, total: Math.round(total * 100) / 100 };
  }

  async getDebtConversion(companyId: string) {
    const cacheKey = `graphics:${companyId}:debt-conversion`;
    const cached = await this.redisService.get<Awaited<ReturnType<typeof this._computeDebtConversion>>>(cacheKey);
    if (cached) return cached;
    const result = await this._computeDebtConversion(companyId);
    await this.redisService.set(cacheKey, result, CACHE_TTL);
    return result;
  }

  private async _computeDebtConversion(companyId: string) {
    const bracketSql = `CASE
      WHEN pp.total_debt < 1000 THEN 'até R$1k'
      WHEN pp.total_debt < 5000 THEN 'R$1k–5k'
      WHEN pp.total_debt < 10000 THEN 'R$5k–10k'
      WHEN pp.total_debt < 50000 THEN 'R$10k–50k'
      ELSE '+R$50k'
    END`;

    const rows = await this.paymentPromiseRepo
      .createQueryBuilder('pp')
      .where('pp.company_id = :companyId', { companyId })
      .andWhere("pp.status IN ('kept', 'broken', 'cancelled')")
      .select(bracketSql, 'bracket')
      .addSelect('COUNT(pp.id)', 'total')
      .addSelect("SUM(CASE WHEN pp.status = 'kept' THEN 1 ELSE 0 END)", 'kept')
      .groupBy(bracketSql)
      .getRawMany<{ bracket: string; total: string; kept: string }>();

    const order = ['até R$1k', 'R$1k–5k', 'R$5k–10k', 'R$10k–50k', '+R$50k'];
    const map = new Map(order.map(label => [label, { label, total: 0, kept: 0, keptRate: 0 }]));
    for (const row of rows) {
      const entry = map.get(row.bracket);
      if (entry) {
        entry.total = parseInt(row.total) || 0;
        entry.kept = parseInt(row.kept) || 0;
        entry.keptRate = entry.total > 0 ? Math.round((entry.kept / entry.total) * 100) : 0;
      }
    }

    return { brackets: Array.from(map.values()) };
  }

  async getPaymentProfile(companyId: string) {
    const cacheKey = `graphics:${companyId}:payment-profile`;
    const cached = await this.redisService.get<Awaited<ReturnType<typeof this._computePaymentProfile>>>(cacheKey);
    if (cached) return cached;
    const result = await this._computePaymentProfile(companyId);
    await this.redisService.set(cacheKey, result, CACHE_TTL);
    return result;
  }

  private async _computePaymentProfile(companyId: string) {
    const expSql = `CASE
      WHEN i.expiration ~ '^\\d{2}/\\d{2}/\\d{4}$' THEN TO_TIMESTAMP(i.expiration, 'DD/MM/YYYY')
      WHEN i.expiration ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN TO_TIMESTAMP(i.expiration, 'YYYY-MM-DD')
      ELSE NULL
    END`;

    const [distRows, trendRows] = await Promise.all([
      this.invoiceRepo.manager.query<{ bucket: string; count: string }[]>(
        `WITH client_avg AS (
          SELECT
            i."clientId",
            AVG(EXTRACT(EPOCH FROM (i."lastSyncAt" - (${expSql}))) / 86400) AS avg_days_late
          FROM invoice i
          WHERE i."companyId" = $1
            AND LOWER(TRIM(i.status)) = 'pago'
            AND i."lastSyncAt" IS NOT NULL
            AND (${expSql}) IS NOT NULL
          GROUP BY i."clientId"
        )
        SELECT
          CASE
            WHEN avg_days_late <= 0 THEN 'Pontual'
            WHEN avg_days_late <= 15 THEN 'Atrasa 1-15d'
            WHEN avg_days_late <= 30 THEN 'Atrasa 15-30d'
            ELSE 'Crônico +30d'
          END AS bucket,
          COUNT(*)::text AS count
        FROM client_avg
        GROUP BY bucket`,
        [companyId],
      ),

      this.invoiceRepo.manager.query<{ month: Date; on_time_pct: string }[]>(
        `WITH paid AS (
          SELECT
            DATE_TRUNC('month', i."lastSyncAt") AS month,
            EXTRACT(EPOCH FROM (i."lastSyncAt" - (${expSql}))) / 86400 AS days_late
          FROM invoice i
          WHERE i."companyId" = $1
            AND LOWER(TRIM(i.status)) = 'pago'
            AND i."lastSyncAt" IS NOT NULL
            AND (${expSql}) IS NOT NULL
            AND i."lastSyncAt" >= NOW() - INTERVAL '6 months'
        )
        SELECT
          month,
          ROUND(100.0 * COUNT(CASE WHEN days_late <= 0 THEN 1 END) / NULLIF(COUNT(*), 0), 1)::text AS on_time_pct
        FROM paid
        GROUP BY month
        ORDER BY month ASC`,
        [companyId],
      ),
    ]);

    const bucketOrder = ['Pontual', 'Atrasa 1-15d', 'Atrasa 15-30d', 'Crônico +30d'];
    const totalClients = distRows.reduce((s, r) => s + parseInt(r.count), 0);

    const distribution = bucketOrder.map((label) => {
      const row = distRows.find((r) => r.bucket === label);
      const count = row ? parseInt(row.count) : 0;
      return { label, count, pct: totalClients > 0 ? Math.round((count / totalClients) * 100) : 0 };
    });

    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const trend = trendRows.map((r) => ({
      month: monthNames[new Date(r.month).getUTCMonth()],
      onTimePct: parseFloat(r.on_time_pct) || 0,
    }));

    return { distribution, trend };
  }

  /**
   * Métricas agregadas de UM template (efetividade + recuperação financeira).
   * Filtra por `templateId` apenas: é UUID único por empresa (gerado por
   * `@PrimaryGeneratedColumn('uuid')`), logo já é seguro multi-tenant — um id de
   * empresa A nunca casa com relatórios da empresa B.
   */
  async getTemplateMetrics(templateId: string) {
    const cacheKey = `graphics:template:${templateId}:metrics`;
    const cached = await this.redisService.get<Awaited<ReturnType<typeof this._computeTemplateMetrics>>>(cacheKey);
    if (cached) return cached;

    return this.withSingleFlight(cacheKey, async () => {
      const result = await this._computeTemplateMetrics(templateId);
      await this.redisService.set(cacheKey, result, CACHE_TTL);
      return result;
    });
  }

  private async _computeTemplateMetrics(templateId: string) {
    // Agregados (COUNT/SUM) em SQL — barato e exato.
    const aggPromise = this.relatoryRepo
      .createQueryBuilder('r')
      .select('COUNT(r.id)', 'dispatched')
      .addSelect("SUM(CASE WHEN r.status_sent IN ('delivered','read') THEN 1 ELSE 0 END)", 'delivered')
      .addSelect("SUM(CASE WHEN r.status_sent IN ('error','failed','undelivered') THEN 1 ELSE 0 END)", 'failed')
      .addSelect('SUM(CASE WHEN r.response = true THEN 1 ELSE 0 END)', 'responded')
      .addSelect('SUM(COALESCE(r.recovered_amount, 0))', 'recovered')
      .addSelect('MIN(r.date_dispatch)', 'firstDispatchAt')
      .addSelect('MAX(r.date_dispatch)', 'lastDispatchAt')
      .where('r.template = :templateId', { templateId })
      .getRawOne<{
        dispatched: string;
        delivered: string;
        failed: string;
        responded: string;
        recovered: string;
        firstDispatchAt: Date | string | null;
        lastDispatchAt: Date | string | null;
      }>();

    // Nome do template (entity separada). Não falha se não existir.
    const templatePromise = this.templatesRepo.findOne({
      where: { id: templateId },
      select: { id: true, name: true },
    });

    // amountCharged: o valor está embutido no jsonb `components_maped`, não há
    // FK para invoice. Extração em JS (robusta) sobre só essa coluna.
    const componentsPromise = this.relatoryRepo
      .createQueryBuilder('r')
      .select('r.components_maped', 'components_maped')
      .where('r.template = :templateId', { templateId })
      .getRawMany<{ components_maped: unknown }>();

    const [agg, template, componentRows] = await Promise.all([
      aggPromise,
      templatePromise,
      componentsPromise,
    ]);

    const dispatched = parseInt(agg?.dispatched ?? '0', 10) || 0;
    const delivered = parseInt(agg?.delivered ?? '0', 10) || 0;
    const failed = parseInt(agg?.failed ?? '0', 10) || 0;
    const responded = parseInt(agg?.responded ?? '0', 10) || 0;
    const amountRecovered = Math.round((parseFloat(agg?.recovered ?? '0') || 0) * 100) / 100;

    const amountCharged =
      Math.round(
        componentRows.reduce((sum, row) => sum + extractChargedAmount(row.components_maped), 0) * 100,
      ) / 100;

    const responseRate = dispatched > 0 ? Math.round((responded / dispatched) * 100) : 0;
    const recoveryRate = amountCharged > 0 ? Math.round((amountRecovered / amountCharged) * 100) : 0;

    const toIso = (value: Date | string | null | undefined): string | null => {
      if (!value) return null;
      const d = value instanceof Date ? value : new Date(value);
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    };

    return {
      templateId,
      templateName: template?.name ?? '',
      dispatched,
      delivered,
      failed,
      responded,
      responseRate,
      amountCharged,
      amountRecovered,
      recoveryRate,
      firstDispatchAt: toIso(agg?.firstDispatchAt),
      lastDispatchAt: toIso(agg?.lastDispatchAt),
    };
  }

  async invalidateDashboardCache(companyId: string) {
    await this.redisService.delByPrefix(`graphics:${companyId}:`);
  }

  private normalizeDoc(doc: string): string {
    return doc.replace(/\D/g, '');
  }

}
