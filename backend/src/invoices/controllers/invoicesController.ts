import { Controller, Post, Body, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Client } from '../../clients/entities.ts/clients';
import { Company } from '../../companies/entities/companies';

import { IXCInvoicesService } from '../services/ixcInvoicesService';
import { HubsoftInvoicesService } from '../services/hubsoftInvoicesService';
import { SGPInvoicesService } from '../services/sgpInvoicesService';

@Controller('invoices')
export class InvoicesController {
  constructor(
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,

    private readonly ixcService: IXCInvoicesService,
    private readonly hubsoftService: HubsoftInvoicesService,
    private readonly sgpService: SGPInvoicesService,
  ) { }

  @Post()
  async getInvoices(@Body('documento') rawDocuments: string[] | string) {
    // 🔒 Normaliza SEMPRE para array
    const documents = Array.isArray(rawDocuments)
      ? rawDocuments
      : [rawDocuments];

    // 🔒 Limpa CPF/CNPJ
    const docs = documents.map(d =>
      String(d).replace(/\D/g, '')
    );

    // 🔍 Busca TODOS de uma vez (performático)
    const clientes = await this.clientRepo
      .createQueryBuilder('cliente')
      .leftJoinAndSelect('cliente.company', 'company')
      .where(
        "REPLACE(REPLACE(REPLACE(cliente.cnpj_cpf, '.', ''), '-', ''), '/', '') IN (:...docs)",
        { docs }
      )
      .getMany();

    if (!clientes.length) {
      throw new NotFoundException('Nenhum cliente encontrado');
    }

    // 🔄 Processa por ERP
    const resultados = [];

    for (const cliente of clientes) {
      const company = cliente.company;

      if (!company || !company.erp) {
        throw new BadRequestException(
          `Empresa sem ERP configurado para o cliente ${cliente.name}`
        );
      }

      switch (company.erp.toUpperCase()) {
        case 'IXC':
          resultados.push(
            await this.ixcService.buscarFaturas(cliente)
          );
          break;

        case 'HUBSOFT':
          resultados.push(
            await this.hubsoftService.buscarFaturas(cliente)
          );
          break;

        case 'SGP':
          resultados.push(
            await this.sgpService.buscarFaturas(cliente)
          );
          break;

        default:
          throw new BadRequestException(
            `ERP não suportado: ${company.erp}`
          );
      }
    }

    return resultados;
  }

}
