import {
  Injectable,
  BadRequestException,
} from '@nestjs/common';

import { Client } from '../../clients/entities.ts/clients';
import { Company } from '../../companies/entities/companies';
import { InvoiceMapResultDto, InvoicesResponseDto } from '../dto/search.request.dto.invoices';
import { HubsoftFatura } from '../types/hubsoftTypes';
import { ErpDefinition } from '../../integrations/erp/erp.types';

/**
 * Capacidades do Hubsoft. Ver `integrations/erp/erp.types.ts`.
 *
 * Este service NÃO está ligado em cron nenhum: não existe `fetchClients*` nem
 * `getInvoicesByDateWindowBatch` aqui, e nem `ClientsSyncCron` nem
 * `InvoiceSyncCron` o injetam. Por isso `syncClients`/`syncInvoices` são false —
 * a base local de uma empresa Hubsoft nunca é populada (ver RAP 10: 4.651
 * clientes vindos de outra origem e 0 faturas).
 *
 * `pix: false` apesar de `getInvoices` mapear `code_pix`: o consumidor
 * (`template-dispatch-payload.service.ts`) sobrescreve o campo com `undefined`,
 * então o valor buscado nunca chega ao disparo.
 *
 * `preflight: 'credential'` — `/oauth/token` valida a credencial inteira, mas o
 * único endpoint de negócio implementado busca por CPF/CNPJ de um cliente
 * específico e não devolve total.
 */
export const HUBSOFT_ERP: ErpDefinition = {
  code: 'HUBSOFT',
  label: 'Hubsoft',
  syncClients: false,
  syncInvoices: false,
  pix: false,
  dispatch: true,
  preflight: 'credential',
  ressalva:
    'Não sincroniza clientes nem faturas — a base local nunca é populada. O disparo funciona apenas com dados vindos de outra origem, e sem PIX.',
  credenciais: [
    {
      campo: 'client_id',
      destino: 'config',
      obrigatorio: true,
      descricao: 'client_id da aplicação OAuth no Hubsoft.',
    },
    {
      campo: 'client_secret',
      destino: 'config',
      // O service trata ausente como string vazia (`client_secret ?? ''`),
      // então nem toda instalação exige.
      obrigatorio: false,
      descricao: 'client_secret da aplicação OAuth. Opcional em algumas instalações.',
    },
    {
      campo: 'username',
      destino: 'config',
      obrigatorio: true,
      descricao: 'Usuário do grant password.',
    },
    {
      campo: 'password',
      destino: 'config',
      obrigatorio: true,
      descricao: 'Senha do grant password.',
    },
  ],
};

@Injectable()
export class HubsoftInvoicesService {
  constructor() { }

  async gerarTokenOAuth(empresa: Company): Promise<string> {
    const cfg = empresa.config;

    if (!cfg?.client_id || !cfg?.username || !cfg?.password) throw new BadRequestException('Config Hubsoft não encontrada na empresa');

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

  async getInvoices(cliente: Client): Promise<InvoicesResponseDto> {
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

    let map: InvoiceMapResultDto[] = []

    map = data.faturas.map((t: HubsoftFatura
    ): InvoiceMapResultDto => ({
      invoice_id: String(t.id_fatura) ?? null,
      contract_id: String(t.cliente.servico.id_cliente_servico) ?? null,
      invoice_due_date: String(t.data_vencimento) ?? null,
      invoice_amount: String(t.valor),
      invoice_status: 'A Receber',
      ticket_digitable_line: t.codigo_barras ?? null,
      ticket_pdf_link: t.link ?? null,
      code_pix: String(t.pix_copia_cola)
    })).sort((a: any, b: any) => {
      const parseDate = (str?: string) => {
        if (!str) return 0;
        const [day, month, year] = str.split('/');
        const fullYear = Number(year) < 100 ? 2000 + Number(year) : Number(year);
        return new Date(fullYear, Number(month) - 1, Number(day)).getTime();
      };
      return parseDate(b.invoice_due_date) - parseDate(a.invoice_due_date);
    });

    return {
      status: data.status,
      message: data.msg,
      list: map,
    };
  }

}