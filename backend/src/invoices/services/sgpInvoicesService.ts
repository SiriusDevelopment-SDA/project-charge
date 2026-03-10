import {
  Injectable,
  BadRequestException
} from '@nestjs/common';
import { Client } from '../../clients/entities.ts/clients';
import { formatarDataBR } from '../../utils';
import { InvoiceMapResultDto, InvoiceOverdueDto, InvoicesOverdueResponseDto, InvoicesResponseDto, ResultInvoicesOverdueDto } from '../dto/search.request.dto.invoices';
import { Invoice } from '../entities/invoices';
import { Raw, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Overdue } from '../entities/Overdue';

@Injectable()
export class SGPInvoicesService {
  overdueRepository: any;
  clientRepository: any;
  constructor(
      @InjectRepository(Invoice) private readonly invoiceRepository: Repository<Invoice>,
    ) { }
  
  async getInvoices(cliente: Client): Promise<InvoicesResponseDto> {
    const empresa = cliente.company;
    const config = empresa.config ?? {};
    const username = config.username;
    const password = config.password;
    if (!username || !password)throw new BadRequestException('Credenciais da SGP não configuradas (username/password)');


    const cpfCliente = String(cliente.cnpj_cpf).replace(/\D/g, '');

    const auth = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

    const url = `https://${empresa.url}/api/ura/titulos`;
    const endDate = new Date(); // hoje
    const startDate = new Date();

    startDate.setFullYear(startDate.getFullYear() - 50);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: auth,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        cpfcnpj: cpfCliente,
        status: 'abertos',
        ordenar: 'data_vencimento',
        ordenar_ordem: 'desc',
        data_vencimento_inicio: startDate.toISOString().split('T')[0],
        data_vencimento_fim: endDate.toISOString().split('T')[0]
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new BadRequestException(`Erro no ERP (SGP): ${response.status} -> ${err}`);
    }

    const data = await response.json();
    const map = data.titulos.map((t: any): InvoiceMapResultDto => ({
      invoice_id: String(t.id),
      contract_id: String(t.clienteContrato),
      invoice_due_date: formatarDataBR(t.dataVencimento),
      invoice_amount: String(t.valorCorrigido),
      invoice_status: 'A Receber',
      ticket_digitable_line: t.codigoBarras || "",
      ticket_pdf_link: t.link || "",
      code_pix: {
        status: t.codigoPix !== "" ? "success": "error",
        pix: t.codigoPix ?? null
      }
    })).sort((a: any, b: any) => {
      const parseDate = (str?: string) => {
        if (!str) return 0;
        const [day, month, year] = str.split('/');
        const fullYear = Number(year) < 100 ? 2000 + Number(year) : Number(year);
        return new Date(fullYear, Number(month) - 1, Number(day)).getTime();
      };
      return parseDate(b.invoice_due_date) - parseDate(a.invoice_due_date);
    });
    return Object.assign(new InvoicesResponseDto(),{
      status: `${!map ? "error": "success"}`,
      message: `${!map ? "Falha ao consultar dados!" : "Dados consultados com sucesso"}`,
      list: map,
    });
  }

   async getInvoicesOverdue(companyId: string): Promise<ResultInvoicesOverdueDto[]> {
    try {

      const clients = await this.clientRepository.find({
        where: {
          company: {
            id: companyId
          }
        },
        relations: ['company'],
      })

      const resultados: ResultInvoicesOverdueDto[] = [];
      const overdueToSave: Overdue[] = [];
      const now = new Date();

      for (const cliente of clients) {
        const normalized = cliente.cnpj_cpf.replace(/\D/g, '');

        const invoices = await this.invoiceRepository.find({
          where: {
            company: {
              id: cliente.company.id
            },
            client: Raw(
              (alias: string) => `regexp_replace(${alias}, '\\D', '', 'g') = :doc`,
              { doc: normalized }
            )
          }
        });

        console.log('CLIENTE:', cliente.name);
        console.log('DOC NORMALIZADO:', normalized);
        console.log('INVOICES ENCONTRADAS:', invoices.length);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const list: InvoiceOverdueDto[] = invoices
          .filter((inv) => {
            if (!inv.expiration) return false;

            const due = new Date(inv.expiration);
            due.setHours(0, 0, 0, 0)

            const status = inv.status?.trim().toLowerCase();

            return status === 'a receber' && due < today;
          })
          .map((inv) => {
            overdueToSave.push({
              invoiceId: String(inv.id_fatura ?? inv.id),
              client: normalized,
              companyId: cliente.company.id,
              dueDate: new Date(inv.expiration),
            } as Overdue)

            return {
              invoice_due_date: inv.expiration,
              invoice_status: inv.status as 'A Receber' | 'Pago' | 'Renegociado' | 'Perdido',
              overdue: true,
            };
          });

        if (!list.length) continue;

        resultados.push({
          client: cliente.name,
          document: normalized,
          erp: cliente.company.erp,
          invoices: {
            status: 'success',
            message: 'Faturas inadimplentes encontradas',
            list,
          } as InvoicesOverdueResponseDto
        });
      }

      if (overdueToSave.length) {
        await this.overdueRepository.upsert(overdueToSave, ['invoiceId', 'companyId'])
      }

      return resultados;

    } catch (error) {
      console.error('[getInvoicesOverdue]', error);

      return [];
    }
  }
}
