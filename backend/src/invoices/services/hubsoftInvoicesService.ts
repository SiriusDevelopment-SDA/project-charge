import {
  Injectable,
  BadRequestException,
} from '@nestjs/common';

import { Client } from '../../clients/entities.ts/clients';
import { Company } from '../../companies/entities/companies';

@Injectable()
export class HubsoftInvoicesService {
  constructor() {}

async gerarTokenOAuth(empresa: Company): Promise<string> {
    const cfg = empresa.config;

    if (!cfg?.client_id || !cfg?.username || !cfg?.password)throw new BadRequestException('Config Hubsoft não encontrada na empresa');

    const tokenUrl = `https://${empresa.url}/oauth/token`;

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: cfg.client_id,
        client_secret: cfg.client_secret ?? '',
        username: cfg.username,
        password: cfg.password,
        grant_type: 'password',
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new BadRequestException(
        `Hubsoft OAuth falhou (${response.status}): ${err}`,
      );
    }

    const data = await response.json();
    return data.access_token;
  }

async getInvoices(cliente: Client) {
    const token = await this.gerarTokenOAuth(cliente.company);

    const url = `https://${cliente.company.url}/api/v1/integracao/cliente/financeiro`;
    const params = `busca=cpf_cnpj&termo_busca=${cliente.cnpj_cpf.replace(/\D/g, '')}&apenas_pendente=sim&order_by=data_vencimento&order_type=desc`
    const response = await fetch(`${url}?${params}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const err = await response.text();
      throw new BadRequestException(`Erro no ERP (HUBSOFT): ${response.status} -> ${err}`);
    }

    const data = await response.json();
    const map = data.faturas.map((t: any) => ({
      invoice_id: String(t.id_fatura) ?? null,
      contract_id: String(t.cliente.servico.id_cliente_servico) ?? null,
      invoice_due_date: String(t.data_vencimento) ?? null,
      invoice_amount: String(t.valor),
      status: 'A Receber',
      ticket_digitable_line: t.codigo_barras ?? null,
      code_pix: t.pix_copia_cola ?? null,
      ticket_pdf_link: t.link ?? null,
    }))
    return {
      status: data.status,
      message: data.msg,
      invoices: map,
    };
  }
  }