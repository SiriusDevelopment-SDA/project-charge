import {
  Injectable,
  BadRequestException,
} from '@nestjs/common';
import { Client } from '../../clients/entities.ts/clients';
import { ReqPixInvoice } from '../types';
import { formatarDataBR, formatDateLocal2 } from '../../utils';
import { InjectRepository } from '@nestjs/typeorm';
import { Company } from '../../companies/entities/companies';
import { Repository } from 'typeorm';
import { InvoiceMapResultDto, InvoicesResponseDto } from '../dto/search.request.dto.invoices';
import { ResponseFnAReceber } from '../types/ixcTypes';

@Injectable()
export class IXCInvoicesService {
  constructor(
    @InjectRepository(Company)
    private companyRepository: Repository<Company>,
  ) { }

  async getInvoices(cliente: Client): Promise<InvoicesResponseDto> {
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
            { TB: 'fn_areceber.status', OP: 'L', P: 'A' },
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
        let map: InvoiceMapResultDto[] = []
        
        if (data.registros) {
          map = await Promise.all(
            data.registros.map(async (t: ResponseFnAReceber): Promise<InvoiceMapResultDto> => {

              const contractId =
                t.id_contrato && t.id_contrato !== "" && t.id_contrato !== "0"
                  ? t.id_contrato
                  : t.id_contrato_principal && t.id_contrato_principal !== "" && t.id_contrato_principal !== "0"
                  ? t.id_contrato_principal
                  : t.id_contrato_avulso && t.id_contrato_avulso !== "" && t.id_contrato_avulso !== "0"
                  ? t.id_contrato_avulso
                  : null;
      
              const pix = await this.getPixByInvoice({
                companyId: empresa.id,
                invoiceId: String(t.id),
              })
              return {
                invoice_id: String(t.id) ?? null,
                contract_id: String(contractId),
                invoice_due_date: formatarDataBR(t.data_vencimento) ?? null,
                invoice_amount: String(t.valor_aberto),
                invoice_status: 'A Receber',
                ticket_digitable_line: null,
                ticket_pdf_link: null,
                code_pix: pix,
              };
            })
          );
      
          map.sort((a, b) => {
            const parseDate = (str?: string) => {
              if (!str) return 0;
              const [day, month, year] = str.split('/');
              const fullYear = Number(year) < 100 ? 2000 + Number(year) : Number(year);
              return new Date(fullYear, Number(month) - 1, Number(day)).getTime();
            };
            return parseDate(b.invoice_due_date) - parseDate(a.invoice_due_date);
          });
        }
      
        return Object.assign(new InvoicesResponseDto(), {
          status: data?.type ?? "success",
          message: data?.message ?? (data.page ? "Dados consultados com sucesso" : "Falha ao consultar dados!"),
          list: map,
        });
  }

  async getPixByInvoice(data: ReqPixInvoice) {
  
    try{
      const empresa = await this.companyRepository.findOne({where: { id: data.companyId }});
      if(!empresa)throw new BadRequestException(`EmpresaId: ${data.companyId} não encontrado!`);
      const authorizationHeader = `Basic ${Buffer.from(empresa.autorization).toString('base64')}`;
      const url = `https://${empresa.url}/webservice/v1/get_pix`;
  
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
      status: boletoData.type,
      pix: (boletoData.pix.dadosPix.pixCopiaECola && boletoData.pix.dadosPix.status === "ATIVA") ? boletoData.pix.dadosPix.pixCopiaECola : boletoData.pix.qrCode.qrcode
    };
    }catch(err: any){
      throw new BadRequestException(
        `${err.message ? err.message : "Falha ao encontrar boleto!"}`,
      );
    }
  
  }
}