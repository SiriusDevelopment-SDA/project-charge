import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../companies/entities/companies';
import { Client } from './entities.ts/clients';
import { IXCInvoicesService } from '../invoices/services/ixcInvoicesService';

@Injectable()
export class ClientsSyncCron {
  private readonly logger = new Logger(ClientsSyncCron.name);

  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,

    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,

    private readonly ixcService: IXCInvoicesService,
  ) {}

  // Roda todo dia às 3h da manhã
  @Cron('0 0 3 * * *')
  async syncClientsFromERP(): Promise<void> {
    this.logger.log('[ClientsSync] Iniciando sincronização de clientes do ERP');

    const companies = await this.companyRepository.find({
      where: { active: true, erp: 'IXC' },
    });

    if (!companies.length) {
      this.logger.verbose('[ClientsSync] Nenhuma empresa IXC ativa encontrada');
      return;
    }

    let totalCreated = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;

    for (const company of companies) {
      try {
        this.logger.log(`[ClientsSync] Buscando clientes da empresa: ${company.name}`);

        const ixcClients = await this.ixcService.fetchClientsFromIXC(company);

        this.logger.log(`[ClientsSync] ${ixcClients.length} clientes encontrados no IXC para ${company.name}`);

        for (const ixcClient of ixcClients) {
          if (ixcClients.indexOf(ixcClient) === 0) {
            this.logger.debug(`[ClientsSync] Sample fields: ${JSON.stringify(Object.keys(ixcClient as any))}`);
            this.logger.debug(`[ClientsSync] Sample values: cnpj_cpf=${ixcClient.cnpj_cpf} fone_celular=${(ixcClient as any).fone_celular} telefone_celular=${(ixcClient as any).telefone_celular} whatsapp=${(ixcClient as any).whatsapp}`);
          }

          const cnpj_cpf = ixcClient.cnpj_cpf?.replace(/\D/g, '');
          const whatsapp = (
            ixcClient.whatsapp ||
            ixcClient.telefone_celular ||
            ixcClient.fone_celular
          )?.replace(/\D/g, '');

          if (!cnpj_cpf || !whatsapp) {
            totalSkipped++;
            continue;
          }

          const existing = await this.clientRepository.findOne({
            where: { cnpj_cpf },
          });

          if (existing) {
            await this.clientRepository.update(existing.id, {
              name: ixcClient.razao,
              clientId: ixcClient.id,
              whatsapp,
              email: ixcClient.email ?? existing.email,
              street: ixcClient.endereco ?? existing.street,
              numberHouse: ixcClient.numero ?? existing.numberHouse,
              city: ixcClient.cidade_descricao ?? existing.city,
              zipCode: ixcClient.cep?.replace(/\D/g, '').slice(0, 9) ?? existing.zipCode,
            });
            totalUpdated++;
          } else {
            const newClient = this.clientRepository.create({
              cnpj_cpf,
              name: ixcClient.razao,
              clientId: ixcClient.id,
              whatsapp,
              email: ixcClient.email,
              street: ixcClient.endereco,
              numberHouse: ixcClient.numero,
              city: ixcClient.cidade_descricao,
              zipCode: ixcClient.cep?.replace(/\D/g, '').slice(0, 9),
              company,
            });
            await this.clientRepository.save(newClient);
            totalCreated++;
          }
        }
      } catch (error) {
        this.logger.error(`[ClientsSync] Erro ao sincronizar empresa ${company.name}: ${error}`);
      }
    }

    this.logger.log(
      `[ClientsSync] Sincronização concluída — criados: ${totalCreated}, atualizados: ${totalUpdated}, ignorados (sem CPF/WhatsApp): ${totalSkipped}`,
    );
  }
}
