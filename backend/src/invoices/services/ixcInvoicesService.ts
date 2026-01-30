import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, ILike, Repository } from 'typeorm';
import { Client } from '../../clients/entities.ts/clients';
import { Company } from '../../companies/entities/companies';

@Injectable()
export class IXCInvoicesService {
  constructor() { }

  async buscarFaturas(cliente: Client) {
    /* ===============================
       1️⃣ PAYLOAD IXC
    =============================== */
    const content = {
      qtype: 'fn_areceber.id_cliente',
      query: cliente.clientId,
      oper: '=',
      page: '1',
      rp: '700',
      sortname: 'fn_areceber.data_vencimento',
      sortorder: 'desc',
      grid_param: [
        { TB: 'fn_areceber.liberado', OP: '=', P: 'S' },
        { TB: 'fn_areceber.status', OP: '!=', P: 'C' },
        {
          TB: 'fn_areceber.data_vencimento',
          OP: '<=',
          P: new Date(Date.now() + 33 * 86400000)
            .toISOString()
            .slice(0, 10),
        },
      ],
    };

    console.log(content)

    /* ===============================
       2️⃣ BUSCA CLIENTE
    =============================== */

    const empresa = cliente.company;

    if (!empresa?.autorization || !empresa.url) {
      throw new BadRequestException(
        'Credenciais do IXC não configuradas',
      );
    }

    console.log(cliente)

    /* ===============================
       3️⃣ AUTH BASIC (IGUAL N8N)
    =============================== */
    const authorizationHeader = `Basic ${Buffer
      .from(empresa.autorization)
      .toString('base64')}`;

    const url = `https://${empresa.url}/webservice/v1/fn_areceber`;

    console.log(url)

    /* ===============================
       4️⃣ REQUEST CORRETO (POST)
    =============================== */
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: authorizationHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(content),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new BadRequestException(
        `Erro no ERP (IXC): ${response.status} -> ${err}`,
      );
    }

    const res = await response.json()

    console.log(res);
  }
}