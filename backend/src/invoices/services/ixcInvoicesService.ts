import {
  Injectable,
  BadRequestException,
} from '@nestjs/common';
import { Client } from '../../clients/entities.ts/clients';
import { InvoiceMapResult, InvoicesResponse, ReqPixInvoice } from '../types';
import { formatarDataBR, formatDateLocal2 } from '../../utils';
import { InjectRepository } from '@nestjs/typeorm';
import { Company } from '../../companies/entities/companies';
import { Repository } from 'typeorm';

@Injectable()
export class IXCInvoicesService {
  constructor(
    @InjectRepository(Company)
    private companyRepository: Repository<Company>,
  ) { }

  async getInvoices(cliente: Client): Promise<InvoicesResponse> {
    const fim = new Date()
    fim.setDate(fim.getDate() + 33)

    const content = {
      qtype: 'fn_areceber.id_cliente',
      query: cliente.clientId.toString(),
      oper: '=',
      page: '1',
      rp: '700',
      sortname: 'fn_areceber.data_vencimento',
      sortorder: 'asc',
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
  // Mapeia e busca os links dos boletos
  const map: InvoiceMapResult[] = await Promise.all(
    data.registros.map(async (t: any) => {
      const contractId =
        t.id_contrato && t.id_contrato !== "" && t.id_contrato !== "0"
          ? t.id_contrato
          : t.id_contrato_principal && t.id_contrato_principal !== "" && t.id_contrato_principal !== "0"
          ? t.id_contrato_principal
          : t.id_contrato_avulso && t.id_contrato_avulso !== "" && t.id_contrato_avulso !== "0"
          ? t.id_contrato_avulso
          : null;

      const pix =  await this.getPixByInvoice({
        companyId: empresa.id,
        invoiceId: String(t.id),
      })
      return {
        invoice_id: String(t.id) ?? null,
        contract_id: contractId,
        invoice_due_date: formatarDataBR(t.data_vencimento) ?? null,
        invoice_amount: String(t.valor_aberto),
        invoice_status: 'A Receber',
        ticket_digitable_line: t.codigo_barras ?? null,
        code_pix: pix,
        // ticket_pdf_link: boletoData?.registros?.[0]?.link ?? null,
      };
    })
  );

  // Ordena pelas datas
  map.sort((a, b) => {
    const parseDate = (str?: string) => {
      if (!str) return 0;
      const [day, month, year] = str.split('/');
      const fullYear = Number(year) < 100 ? 2000 + Number(year) : Number(year);
      return new Date(fullYear, Number(month) - 1, Number(day)).getTime();
    };
    return parseDate(b.invoice_due_date) - parseDate(a.invoice_due_date);
  });

  return {
    status: map.length ? "success" : "error",
    message: map.length ? "Dados consultados com sucesso" : "Falha ao consultar dados!",
    invoices: map,
  };
  }
  
  async getInvoiceById(invoice: {
    companyId: string,
    invoices: string,
    interest?: "S" | "N",
    fine?: "S" | "N",
    update_ticket?: "S" | "N",
    ticket_type?: "dados" | "email" | "sms",
    base64?: "S" | "N",
    print_layout?: "",
  }) {
   const content = {
      boletos: invoice.invoices,
      juro: invoice.interest || "S",
      multa: invoice.fine || "S",
      atualiza_boleto: invoice.update_ticket || "S",
      tipo_boleto: invoice.ticket_type || "dados",
      base64 : invoice.base64 || "N",
      layout_impressao: invoice.print_layout || ""
    }

    try{
      const empresa = await this.companyRepository.findOne({where: { id: invoice.companyId }});
      if(!empresa)throw new BadRequestException(`EmpresaId: ${invoice.companyId} não encontrado!`);
      const authorizationHeader = `Basic ${Buffer.from(empresa.autorization).toString('base64')}`;
      const url = `https://${empresa.url}/webservice/v1/get_boleto`;


    console.log("content", content)
    console.log("url", url)
    console.log("password", authorizationHeader)

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: authorizationHeader,
        // 'Content-Type': 'application/json'
      },
      body: JSON.stringify(content),
    });
    const boletoData = await response.json();

    if (!response.ok) {
      const err = await response.text();
      throw new BadRequestException(
        `Erro no ERP (IXC): ${response.status} -> ${err}`,
      );
    }
    return boletoData;
    }catch(err: any){
      throw new BadRequestException(
        `${err.message ? err.message : "Falha ao encontrar boleto!"}`,
      );
    }

  }

  async getPixByInvoice(data: ReqPixInvoice) {
  
    try{
      const empresa = await this.companyRepository.findOne({where: { id: data.companyId }});
      if(!empresa)throw new BadRequestException(`EmpresaId: ${data.companyId} não encontrado!`);
      const authorizationHeader = `Basic ${Buffer.from(empresa.autorization).toString('base64')}`;
      const url = `https://${empresa.url}/webservice/v1/get_pix`;
  
    console.log("url", url)
    console.log("password", authorizationHeader)
  
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: authorizationHeader,
        'Content-Type': 'application/json',
        'ixcsoft': 'listar'
      },
      body: JSON.stringify({id_areceber: data.invoiceId}),
    });
    const boletoData = await response.json();
    return {
      pix: (boletoData.pix.dadosPix.pixCopiaECola && boletoData.pix.dadosPix.status === "ATIVA") || boletoData.pix.qrCode.qrcode,
      status: boletoData.type
    };
    }catch(err: any){
      throw new BadRequestException(
        `${err.message ? err.message : "Falha ao encontrar boleto!"}`,
      );
    }
  
  }
}