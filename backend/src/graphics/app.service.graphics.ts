import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Overdue } from '../invoices/entities/Overdue';
import { Client } from '../clients/entities.ts/clients';

@Injectable()
export class AppServiceGraphics {

  constructor(
    @InjectRepository(Overdue)
    private readonly overdueRepo: Repository<Overdue>,

    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
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
    const monthsMap: Record<string, { default: number }> = {};

    overdueList.forEach(item => {

      const date = new Date(item.dueDate);

      const month = this.getMonthName(date.getMonth() + 1);

      if (!monthsMap[month]) {
        monthsMap[month] = { default: 0 };
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
        default: values.default
      })
    );

    return {
      inadimplentes: defaultCount,
      pagamentos: paymentsCount,
      months
    };

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