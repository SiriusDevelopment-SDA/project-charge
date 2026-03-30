import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Overdue } from '../invoices/entities/Overdue';
import { Client } from '../clients/entities.ts/clients';
import { RelatoryDispatchTemplate } from '../templates/entities/relatory.entity';
import { Campaign } from '../campaigns/entities/campanhas.entity';
import { DispatchBatch } from '../message-queue/entities/dispatch-batch.entity';

@Injectable()
export class AppServiceGraphics {

  constructor(
    @InjectRepository(Overdue)
    private readonly overdueRepo: Repository<Overdue>,

    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,

    @InjectRepository(DispatchBatch)
    private readonly dispatchBatchRepo: Repository<DispatchBatch>,

    @InjectRepository(RelatoryDispatchTemplate)
    private readonly relatoryRepo: Repository<RelatoryDispatchTemplate>,

    @InjectRepository(Campaign)
    private readonly campaignRepo: Repository<Campaign>,
  ) { }

  async getCharges(companyId: string) {

    // Buscar clientes da empresa
    const clients = await this.clientRepo.find({
      where: {
        company: {
          id: companyId
        }
      }
    });

    // Buscar inadimplentes
    const overdueList = await this.overdueRepo.find({
      where: { companyId }
    });

    // Criar Set de CPFs inadimplentes
    const overdueSet = new Set(
      overdueList.map(o => this.normalizeDoc(o.client))
    );

    let defaultCount = 0;
    let paymentsCount = 0;

    // Mapa de meses
    const monthsMap: Record<string, { default: number; payments: number }> = {};

    overdueList.forEach(item => {

      const date = new Date(item.dueDate);

      const month = this.getMonthName(date.getUTCMonth() + 1);

      if (!monthsMap[month]) {
        monthsMap[month] = { default: 0, payments: 0 };
      }

      monthsMap[month].default++;

    });

    // Verificar clientes
    clients.forEach(client => {

      const normalizedCpf = this.normalizeDoc(client.cnpj_cpf);

      const isOverdue = overdueSet.has(normalizedCpf);

      if (isOverdue) {
        defaultCount++;
      } else {
        paymentsCount++;
      }

    });

    // Converter para array (gráfico)
    const months = Object.entries(monthsMap).map(
      ([month, values]) => ({
        month,
        default: values.default,
        payments: paymentsCount
      })
    );

    return {
      inadimplentes: defaultCount,
      pagamentos: paymentsCount,
      months
    };

  }

  async getMonthlyDispatches(companyId: string) {
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

  // 🔧 Normaliza CPF/CNPJ
  private normalizeDoc(doc: string): string {
    return doc.replace(/\D/g, '');
  }

  private getMonthName(monthNumber: number): string {

    const months = [
      'Jan',
      'Fev',
      'Mar',
      'Abr',
      'Mai',
      'Jun',
      'Jul',
      'Ago',
      'Set',
      'Out',
      'Nov',
      'Dez'
    ];

    return months[monthNumber - 1];

  }

}
