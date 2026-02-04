import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Client } from '../../clients/entities.ts/clients';

interface SGPTitulo {
  id: number;
  clienteNome?: string;
  clienteCpfcnpj?: string;
  clienteContrato?: number;
  status?: string;
  valor?: number;
  dataVencimento?: string;
  linhaDigitavel?: string;
  codigoBarras?: string;
  codigoPix?: string;
  link?: string;
}

@Injectable()
export class SGPInvoicesService {
  async buscarFaturas(cliente: Client) {
    const empresa = cliente.company;

    //Validações
    if (!empresa) {
      throw new NotFoundException('Empresa não vinculada ao cliente');
    }

    if (empresa.erp !== 'SGP') {
      return null;
    }

    const config = empresa.config ?? {};
    const username = config.username;
    const password = config.password;

    if (!username || !password) {
      throw new BadRequestException(
        'Credenciais da SGP não configuradas (username/password)',
      );
    }

    const cpfCliente = String(cliente.cnpj_cpf).replace(/\D/g, '');

    const auth = `Basic ${Buffer.from(
      `${username}:${password}`,
    ).toString('base64')}`;

    const baseUrl = empresa.url.startsWith('http')
      ? empresa.url
      : `https://${empresa.url}`;

    const url = `${baseUrl}/api/ura/titulos`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: auth,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        cpfcnpj: cpfCliente,
        cliente_id: cliente.clientId,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new BadRequestException(
        `Erro no ERP (SGP): ${response.status} -> ${err}`,
      );
    }

    const data: { titulos?: SGPTitulo[] } = await response.json();

    const titulosFiltrados: SGPTitulo[] = Array.isArray(data?.titulos)
      ? data.titulos.filter((t: SGPTitulo) => {
          const cpfTitulo = t.clienteCpfcnpj
            ? String(t.clienteCpfcnpj).replace(/\D/g, '')
            : null;

          // Retorna só faturas com status "aberto"
          return (
            cpfTitulo === cpfCliente &&
            t.status?.toLowerCase() === 'aberto'
          );
        })
      : [];

    return this.mapearFaturasSGP(titulosFiltrados);
  }

  // Formata o retorno da requisição
  private mapearFaturasSGP(titulos: SGPTitulo[]) {
    return {
      status: 'success',
      msg: titulos.length
        ? 'Faturas em aberto encontradas'
        : 'Nenhuma fatura em aberto encontrada',
      faturas: titulos.map((t: SGPTitulo) => ({
        id_fatura: t.id ?? null,
        contratoId: t.clienteContrato ?? null,
        status: t.status ?? null,
        quitado: false,
        valor_fatura: Number(t.valor ?? 0),
        data_vencimento_fatura: t.dataVencimento ?? null,
        linha_digitavel_boleto: t.linhaDigitavel ?? null,
        codigo_barras: t.codigoBarras ?? null,
        pix_copia_cola: t.codigoPix ?? null,
        link_boleto_pdf: t.link ?? null,
        cliente: {
          nome: t.clienteNome ?? null,
          documento: t.clienteCpfcnpj ?? null,
        },
      })),
    };
  }
}
