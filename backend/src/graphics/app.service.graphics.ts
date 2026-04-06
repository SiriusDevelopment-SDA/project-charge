import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Invoice } from '../invoices/entities/invoices';
import { Client } from '../clients/entities.ts/clients';
import { RelatoryDispatchTemplate } from '../templates/entities/relatory.entity';
import { Campaign } from '../campaigns/entities/campanhas.entity';
import { DispatchBatch } from '../message-queue/entities/dispatch-batch.entity';
import { PaymentPromise } from '../payment-promise/entities/payment-promise.entity';
import { RedisService } from '../redis/redis.service';

const CACHE_TTL = 30; // seconds

@Injectable()
export class AppServiceGraphics {

  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,

    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,

    @InjectRepository(DispatchBatch)
    private readonly dispatchBatchRepo: Repository<DispatchBatch>,

    @InjectRepository(RelatoryDispatchTemplate)
    private readonly relatoryRepo: Repository<RelatoryDispatchTemplate>,

    @InjectRepository(Campaign)
    private readonly campaignRepo: Repository<Campaign>,

    @InjectRepository(PaymentPromise)
    private readonly paymentPromiseRepo: Repository<PaymentPromise>,

    private readonly redisService: RedisService,
  ) { }

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

    const dueDateSql = `CASE
      WHEN invoice.expiration ~ '^\\d{2}/\\d{2}/\\d{4}$' THEN TO_DATE(invoice.expiration, 'DD/MM/YYYY')
      WHEN invoice.expiration ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN TO_DATE(invoice.expiration, 'YYYY-MM-DD')
      ELSE NULL
    END`;

    const [clients, overdueRows] = await Promise.all([
      this.clientRepo.find({
        where: { company: { id: companyId } },
        select: ['cnpj_cpf'],
      }),
      this.invoiceRepo
        .createQueryBuilder('invoice')
        .innerJoin('invoice.client', 'client')
        .innerJoin('invoice.company', 'company')
        .where('company.id = :companyId', { companyId })
        .andWhere("LOWER(TRIM(invoice.status)) = 'a receber'")
        .andWhere(`${dueDateSql} < :today`, { today: todayStr })
        .select(`regexp_replace(COALESCE(client.cnpj_cpf, ''), '\\D', '', 'g')`, 'cnpj_cpf')
        .addSelect(dueDateSql, 'dueDate')
        .getRawMany<{ cnpj_cpf: string; dueDate: string | null }>(),
    ]);

    const overdueSet = new Set(overdueRows.map(r => r.cnpj_cpf));

    let defaultCount = 0;
    let paymentsCount = 0;

    for (const client of clients) {
      if (overdueSet.has(this.normalizeDoc(client.cnpj_cpf))) {
        defaultCount++;
      } else {
        paymentsCount++;
      }
    }

    const monthsMap: Record<string, { default: number; payments: number }> = {};

    for (const row of overdueRows) {
      if (!row.dueDate) continue;
      const date = new Date(row.dueDate);
      const month = this.getMonthName(date.getUTCMonth() + 1);
      if (!monthsMap[month]) monthsMap[month] = { default: 0, payments: 0 };
      monthsMap[month].default++;
    }

    const months = Object.entries(monthsMap).map(([month, values]) => ({
      month,
      default: values.default,
      payments: paymentsCount,
    }));

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
      .select('EXTRACT(MONTH FROM r.createdAt)', 'month')
      .addSelect('COUNT(r.id)', 'total')
      .where('r.company = :companyId', { companyId })
      .andWhere('EXTRACT(YEAR FROM r.createdAt) = :year', { year: currentYear })
      .groupBy('EXTRACT(MONTH FROM r.createdAt)')
      .getRawMany();

    const retornos = await this.relatoryRepo
      .createQueryBuilder('r')
      .select('EXTRACT(MONTH FROM r.createdAt)', 'month')
      .addSelect('COUNT(r.id)', 'total')
      .where('r.company = :companyId', { companyId })
      .andWhere('r.response = true')
      .andWhere('EXTRACT(YEAR FROM r.createdAt) = :year', { year: currentYear })
      .groupBy('EXTRACT(MONTH FROM r.createdAt)')
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

  async getCampaignsStats(companyId: string) {
    const cacheKey = `graphics:${companyId}:campaigns`;
    const cached = await this.redisService.get<Awaited<ReturnType<typeof this._computeCampaignsStats>>>(cacheKey);
    if (cached) return cached;

    const result = await this._computeCampaignsStats(companyId);
    await this.redisService.set(cacheKey, result, CACHE_TTL);
    return result;
  }

  private async _computeCampaignsStats(companyId: string) {
    const campaigns = await this.campaignRepo.find({
      where: { company: { id: companyId } },
      relations: ['clients'],
      order: { createdAt: 'DESC' },
      take: 10,
    });

    const stats = await Promise.all(
      campaigns.map(async (campaign, index) => {
        const totalClients = campaign.clients?.length ?? 0;

        const [totalDispatched, totalResponded] = await Promise.all([
          this.relatoryRepo.count({
            where: { campaign: { id: campaign.id } },
          }),
          this.relatoryRepo.count({
            where: { campaign: { id: campaign.id }, response: true },
          }),
        ]);

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
      }),
    );

    return stats;
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

  async invalidateDashboardCache(companyId: string) {
    await this.redisService.delByPrefix(`graphics:${companyId}:`);
  }

  private normalizeDoc(doc: string): string {
    return doc.replace(/\D/g, '');
  }

  private getMonthName(monthNumber: number): string {
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    return months[monthNumber - 1];
  }
}
