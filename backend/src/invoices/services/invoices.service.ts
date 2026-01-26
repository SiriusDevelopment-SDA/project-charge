import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Client } from '../../clients/entities.ts/clients';
import { Company } from '../../companies/entities/companies';

import { IXCInvoicesService } from './ixcInvoicesService';
import { HubsoftInvoicesService } from './hubsoftInvoicesService';
import { SGPInvoicesService } from './sgpInvoicesService';

@Injectable()
export class InvoicesService {
  constructor(
    @InjectRepository(Client) private clientRepo: Repository<Client>,
    @InjectRepository(Company) private companyRepo: Repository<Company>,

    private readonly ixcService: IXCInvoicesService,
    private readonly hubsoftService: HubsoftInvoicesService,
    private readonly sgpService: SGPInvoicesService,
  ) {}

  async buscarFaturas(documento: string) {
    const documentoLimpo = documento.replace(/\D/g, '');

    const cliente = await this.clientRepo.findOne({
      where: { cnpj_cpf: documentoLimpo },
      relations: ['company'],
    });

    if (!cliente) {
      throw new NotFoundException('Cliente não encontrado');
    }

    const company = cliente.company;

    if (!company || !company.erp) {
      throw new BadRequestException('Empresa sem um ERP configurado');
    }

    switch (company.erp.toUpperCase()) {
      case 'IXC':
        return this.ixcService.buscarFaturas(cliente);

      case 'HUBSOFT':
        return this.hubsoftService.buscarFaturas(cliente);

      case 'SGP':
        return this.sgpService.buscarFaturas(cliente);

      default:
        throw new BadRequestException(`ERP não suportado: ${company.erp}`);
    }
  }
}
