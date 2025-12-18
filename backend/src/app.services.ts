import { Injectable } from '@nestjs/common';
import { Client } from './entities/clients';
import { GetClientsDto } from './dto/clientsDto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';

@Injectable()
export class AppService {
  constructor(
    @InjectRepository(Client)
    private clientRepository: Repository<Client>,
  ) {}

  async getClients({
    name,
    whatsapp,
    account,
    page = 1,
    limit = 10,
    relationInvoices,
    relationService,
    sortorder,
  }: GetClientsDto) {
    const safeLimit = limit > 0 ? limit : 10;
    const safePage = page > 0 ? page : 1;
    const skip = (safePage - 1) * safeLimit;
  
    const order =
      sortorder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  
    let where: any;
  
    // 🔹 Sempre filtra pelo account (company)
    if (name || whatsapp) {
      where = [
        name
          ? {
              name: ILike(`%${name}%`),
              company: { account_chatwoot: account },
            }
          : null,
        whatsapp
          ? {
              whatsapp: ILike(`%${whatsapp}%`),
              company: { account_chatwoot: account },
            }
          : null,
      ].filter(Boolean);
    } else {
      where = {
        company: {
          account_chatwoot: account,
        },
      };
    }
  
    const [data, total] = await this.clientRepository.findAndCount({
      where,
      skip,
      take: safeLimit,
      order: {
        createdAt: order,
      },
      relations: {
        company: true,
        services: !!relationService,
        invoices: !!relationInvoices,
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
        },
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