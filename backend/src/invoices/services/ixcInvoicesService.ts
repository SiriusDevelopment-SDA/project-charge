import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Client } from '../../clients/entities.ts/clients';
import { InvoicesResponse } from '../types';
import { formatarDataBR, formatDateLocal2 } from '../../utils';

@Injectable()
export class IXCInvoicesService {
  constructor() { }

  async getInvoices(cliente: Client): Promise<InvoicesResponse> {
    const hoje = new Date()
    const fim = new Date()
    fim.setDate(fim.getDate() + 33)
  
    const formatDateISO = (d: Date) =>
      d.toISOString().slice(0, 10) // yyyy-MM-dd

    const content = {
      qtype: 'fn_areceber.id_cliente',
      query: cliente.clientId.toString(),
      oper: '=',
      page: '1',
      rp: '700',
      sortname: 'fn_areceber.id',
      sortorder: 'desc',
      grid_param: JSON.stringify([
        { TB: 'fn_areceber.liberado', OP: '=', P: 'S' },
        {
          TB: 'fn_areceber.status',
          OP: 'L',
          P: 'A'
        },
        {
          TB: 'fn_areceber.data_vencimento',
          OP: '<=',
          P: formatDateLocal2(fim),
        },
      ]),
    }
    const empresa = cliente.company;

    const authorizationHeader = `Basic ${Buffer.from(empresa.autorization).toString('base64')}`;

    const url = `https://${empresa.url}/webservice/v1/fn_areceber`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: authorizationHeader,
        'Content-Type': 'application/json',
        'ixcsoft': 'listar'
      },
      body: JSON.stringify(content),
    });
    if (!response.ok) {
      const err = await response.text();
      throw new BadRequestException(
        `Erro no ERP (IXC): ${response.status} -> ${err}`,
      );
    }

    const data = await response.json()

    const map = data.registros.map((t: any) => ({
      invoice_id: String(t.id) ?? null,
      contract_id: t.id_contrato ?? t.id_contrato_principal ?? t.id_contrato_avulso ?? null,
      invoice_due_date: formatarDataBR(t.data_vencimento) ?? null,
      invoice_amount: String(t.valor_aberto),
      status: 'A Receber',
      ticket_digitable_line: t.codigo_barras ?? null,
      code_pix: null,
      ticket_pdf_link: null,
    }))
    return {
      status: `${!map ? "error": "success"}`,
      message: `${!map ? "Falha ao consultar dados!" : "Dados consultados com sucesso"}`,
      invoices: map,
    };
  }
}