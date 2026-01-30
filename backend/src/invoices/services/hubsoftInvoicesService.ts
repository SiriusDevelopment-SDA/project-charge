import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Client } from '../../clients/entities.ts/clients';
import { Company } from '../../companies/entities/companies';

@Injectable()
export class HubsoftInvoicesService {
  constructor() {}

  /* ===============================
     1️⃣ GERAR TOKEN OAUTH HUBSOFT
  =============================== */
  private async gerarTokenOAuth(empresa: Company): Promise<string> {
    const cfg = empresa.config;

    if (!cfg?.client_id || !cfg?.username || !cfg?.password) {
      throw new BadRequestException(
        'Config Hubsoft não encontrada na empresa',
      );
    }

    const baseUrl = empresa.url.startsWith('http')
      ? empresa.url
      : `https://${empresa.url}`;

    const tokenUrl = `${baseUrl}/oauth/token`;

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

  /* ===============================
     2️⃣ BUSCAR FATURAS CPF / CNPJ
  =============================== */
  async buscarFaturas(cliente: Client) {

    console.log(cliente)

    const empresa = cliente.company;
    if (!empresa) {
      throw new BadRequestException('Empresa não encontrada');
    }

    const token = await this.gerarTokenOAuth(empresa);

    console.log(token)

    const baseUrl = empresa.url.startsWith('http')
      ? empresa.url
      : `https://${empresa.url}`;

    const url = `${baseUrl}/api/v1/integracao/cliente/financeiro?busca=cpf_cnpj&termo_busca=${cliente.cnpj_cpf.replace(/\D/g, '')}`;
    
    console.log(url)

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const err = await response.text();
      throw new BadRequestException(
        `Erro no ERP (HUBSOFT): ${response.status} -> ${err}`,
      );
    }

    const data = await response.json();

    return this.mapearFaturasHubsoft(data);
  }

  //Formata o retorno da requisição
  private mapearFaturasHubsoft(data: any) {
  const faturas = data?.faturas ?? [];

  return {
    status: 'success',
    msg: faturas.length
      ? 'Faturas encontradas'
      : 'Nenhuma fatura encontrada',
    faturas: faturas.map((fatura: any) => ({
      id_fatura: fatura.id_fatura,
      contratoId: fatura.cliente?.servico?.id_cliente_servico ?? null,
      status: fatura.status,
      quitado: fatura.quitado,
      valor_fatura: fatura.valor,
      data_vencimento_fatura: this.formatarData(fatura.data_vencimento),
      linha_digitavel_boleto: fatura.linha_digitavel ?? null,
      codigo_barras: fatura.codigo_barras ?? null,
      pix_copia_cola: fatura.pix_copia_cola ?? null,
      link_boleto_pdf: fatura.link ?? null,
      cliente: {
        nome: fatura.cliente?.nome_razaosocial ?? null,
        documento: fatura.cliente?.cpf_cnpj ?? null,
      },
    })),
  };
}


  /* ===============================
     4️⃣ FORMATAR DATA
  =============================== */
  private formatarData(data: string | null) {
    if (!data) return null;

    // Hubsoft vem como DD/MM/YYYY
    const [dia, mes, ano] = data.split('/');
    return `${ano}-${mes}-${dia}`;
  }
}
