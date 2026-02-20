import { BadRequestException, Injectable } from '@nestjs/common';
import { Client } from '../clients/entities.ts/clients';
import { SearchRequestDtoClients } from './dto/search.request.dto.clients';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike, FindOptionsWhere, Raw, In } from 'typeorm';

@Injectable()
export class AppServiceClient {
  constructor(
    @InjectRepository(Client)
    private clientRepository: Repository<Client>,
  ) {}

  async getClients({
    query,
    account,
    page = 1,
    limit = 10,
    relationInvoices,
    relationService,
    sortorder,
  }: SearchRequestDtoClients) {
    const safeLimit = limit > 0 ? limit : 10;
    const safePage = page > 0 ? page : 1;
    const skip = (safePage - 1) * safeLimit;
  
    const order =
      sortorder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const normalizedQuery = query?.replace(/\D/g, '');
 
    const where: FindOptionsWhere<Client>[] = [
      {
        company: {
          account_chatwoot: String(account),
        },
        name: ILike(`%${query}%`),
      },
      {
        company: {
          account_chatwoot: String(account),
        },
        whatsapp: ILike(`%${query}%`),
      },
      ...(normalizedQuery
        ? [
            {
              company: {
                account_chatwoot: String(account),
              },
              cnpj_cpf: Raw(
                (alias: string) =>
                  `regexp_replace(${alias}, '\\D', '', 'g') ILIKE '%${normalizedQuery}%'`
              ),
            },
          ]
        : []),
    ];
    

    const [data, total] = await this.clientRepository.findAndCount({
      where,
      skip,
      take: safeLimit,
      order: {
        createdAt: order,
      },
      relations: {
        company: true,
        services: !!relationService || false,
        invoices: !!relationInvoices || false,
      },
      select: {
        id: true,
        name: true,
        cnpj_cpf: true,
        email: true,
        whatsapp: true,
        createdAt: true,
        company: {
          id: true,
          account_chatwoot: true,
          name: true
        },
        services: {
          name: true,
          id_servico: true,
          status: true,
        }
      },
    });
  
    return {
      total,
      page: safePage,
      limit: safeLimit,
      data,
    };
  }
}