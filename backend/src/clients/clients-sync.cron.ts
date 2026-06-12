import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { Company } from '../companies/entities/companies';
import { Client } from './entities.ts/clients';
import { IXCInvoicesService } from '../invoices/services/ixcInvoicesService';
import { SGPInvoicesService } from '../invoices/services/sgpInvoicesService';
import { MkInvoicesService } from '../invoices/services/mkInvoicesService';

const CHUNK_SIZE = 500;

function toChunks<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
  return result;
}

function getLastSync(company: Company): Date | undefined {
  const config = typeof company.config === 'string' ? JSON.parse(company.config) : (company.config ?? {});
  return config.lastClientSyncAt ? new Date(config.lastClientSyncAt) : undefined;
}

@Injectable()
export class ClientsSyncCron {
  private readonly logger = new Logger(ClientsSyncCron.name);

  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,

    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,

    private readonly ixcService: IXCInvoicesService,
    private readonly sgpService: SGPInvoicesService,
    private readonly mkService: MkInvoicesService,
  ) {}

  // Roda todo dia às 3h da manhã (horário de Brasília)
  @Cron('0 0 3 * * *', { timeZone: 'America/Sao_Paulo' })
  async syncClientsFromERP(): Promise<void> {
    this.logger.log('[ClientsSync] Iniciando sincronização de clientes do ERP');

    let totalSynced = 0;
    let totalSkipped = 0;

    const companies = await this.companyRepository.find({
      where: { active: true, },
    });

    if (!companies.length) {
      this.logger.verbose('[ClientsSync] Nenhuma empresa ativa encontrada');
    }

    for (const company of companies) {
      switch(company.erp){
        case 'IXC':{
          try {
            const since = getLastSync(company);
            this.logger.log(
              `[ClientsSync] IXC ${company.name} — ${since ? `incremental desde ${since.toISOString()}` : 'carga completa'}`,
            );
    
            const ixcClients = await this.ixcService.fetchClientsFromIXC(company, since);
    
            this.logger.log(`[ClientsSync] ${ixcClients.length} clientes encontrados no IXC para ${company.name}`);
    
            const seen = new Set<string>();
            const toUpsert: QueryDeepPartialEntity<Client>[] = [];
    
            for (const c of ixcClients) {
              const cnpj_cpf = c.cnpj_cpf?.replace(/\D/g, '');
              const whatsapp = (c.whatsapp || c.telefone_celular || c.fone_celular)?.replace(/\D/g, '');
    
              if (!cnpj_cpf || !whatsapp) { totalSkipped++; continue; }
              if (seen.has(cnpj_cpf)) { totalSkipped++; continue; }
              seen.add(cnpj_cpf);
    
              toUpsert.push({
                cnpj_cpf,
                name: c.razao,
                clientId: c.id,
                whatsapp,
                ...(c.email && { email: c.email }),
                ...(c.endereco && { street: c.endereco }),
                ...(c.numero && { numberHouse: c.numero }),
                ...(c.cidade_descricao && { city: c.cidade_descricao }),
                ...(c.cep && { zipCode: c.cep.replace(/\D/g, '').slice(0, 9) }),
                companyId: company.id ,
              });
            }
    
            for (const chunk of toChunks(toUpsert, CHUNK_SIZE)) {
              await this.clientRepository.upsert(chunk, ['cnpj_cpf', 'companyId']);
            }
    
            totalSynced += toUpsert.length;
            this.logger.log(`[ClientsSync] IXC ${company.name}: ${toUpsert.length} sincronizados`);
    
            await this.saveLastSync(company);
            } catch (error) {
              this.logger.error(`[ClientsSync] Erro ao sincronizar empresa IXC ${company.name}: ${error}`);
            }
            break;
        }
        case 'SGP': {
          try {
            const since = getLastSync(company);
            this.logger.log(
              `[ClientsSync] SGP ${company.name} — ${since ? `incremental desde ${since.toISOString()}` : 'carga completa'}`,
            );
    
            const sgpClients = await this.sgpService.fetchClientsFromSGP(company, since);
    
            this.logger.log(`[ClientsSync] ${sgpClients.length} clientes encontrados no SGP para ${company.name}`);
    
            const seen = new Set<string>();
            const toUpsert: QueryDeepPartialEntity<Client>[] = [];
    
            for (const c of sgpClients) {
              const cnpj_cpf = c.cpfcnpj?.replace(/\D/g, '');
              const phone = c.whatsapp || c.celular || c.fone
                || c.contatos?.celulares?.[0]
                || c.contatos?.telefones?.[0];
              const whatsapp = phone?.replace(/\D/g, '');
    
              if (!cnpj_cpf || !whatsapp) { totalSkipped++; continue; }
              if (seen.has(cnpj_cpf)) { totalSkipped++; continue; }
              seen.add(cnpj_cpf);
    
              const email = c.email || c.contatos?.emails?.[0];
              toUpsert.push({
                cnpj_cpf,
                name: c.nome,
                clientId: String(c.id),
                whatsapp,
                ...(email && { email }),
                ...(c.endereco?.logradouro && { street: c.endereco.logradouro }),
                ...(c.endereco?.numero != null && { numberHouse: String(c.endereco.numero) }),
                ...(c.endereco?.cidade && { city: c.endereco.cidade }),
                ...(c.endereco?.cep && { zipCode: c.endereco.cep.replace(/\D/g, '').slice(0, 9) }),
                companyId: company.id ,
              });
            }
    
            for (const chunk of toChunks(toUpsert, CHUNK_SIZE)) {
              await this.clientRepository.upsert(chunk, ['cnpj_cpf', 'companyId']);
            }
    
            totalSynced += toUpsert.length;
            this.logger.log(`[ClientsSync] SGP ${company.name}: ${toUpsert.length} sincronizados`);
    
            await this.saveLastSync(company);
          } catch (error: any) {
            const cause = error?.cause ? ` | causa: ${error.cause}` : '';
            this.logger.error(`[ClientsSync] Erro ao sincronizar empresa SGP ${company.name}: ${error}${cause}`);
          }
          break;
        }
        case 'MK': {
          try {
            const since = getLastSync(company);
            this.logger.log(
              `[ClientsSync] MK ${company.name} — ${since ? `incremental desde ${since.toISOString()}` : 'carga completa'}`,
            );

            const mkClients = await this.mkService.fetchClients(company, since);

            this.logger.log(`[ClientsSync] ${mkClients.length} clientes encontrados no MK para ${company.name}`);

            const seen = new Set<string>();
            const toUpsert: QueryDeepPartialEntity<Client>[] = [];

            for (const c of mkClients) {
              const mapped = this.mkService.toClientUpsert(c, company);
              if (!mapped) { totalSkipped++; continue; }

              const cnpj_cpf = String(mapped.cnpj_cpf);
              if (seen.has(cnpj_cpf)) { totalSkipped++; continue; }
              seen.add(cnpj_cpf);

              toUpsert.push(mapped);
            }

            for (const chunk of toChunks(toUpsert, CHUNK_SIZE)) {
              await this.clientRepository.upsert(chunk, ['cnpj_cpf', 'companyId']);
            }

            totalSynced += toUpsert.length;
            this.logger.log(`[ClientsSync] MK ${company.name}: ${toUpsert.length} sincronizados`);

            await this.saveLastSync(company);
          } catch (error: any) {
            const cause = error?.cause ? ` | causa: ${error.cause}` : '';
            this.logger.error(`[ClientsSync] Erro ao sincronizar empresa MK ${company.name}: ${error}${cause}`);
          }
          break;
        }
        default:
        this.logger.warn(`[ClientsSync] ERP não suportado: ${company.erp}`);
      }
      
    }

    this.logger.log(
      `[ClientsSync] Sincronização concluída — sincronizados: ${totalSynced}, ignorados (sem CPF/WhatsApp): ${totalSkipped}`,
    );
  }

  private async saveLastSync(company: Company): Promise<void> {
    const config = typeof company.config === 'string' ? JSON.parse(company.config) : (company.config ?? {});
    await this.companyRepository.update(company.id, {
      config: { ...config, lastClientSyncAt: new Date().toISOString() },
    });
  }
}
