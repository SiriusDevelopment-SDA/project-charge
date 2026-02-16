export interface HubsoftResponse {
    status: string;
    msg: string;
    faturas: HubsoftFatura[];
  }
  
  export interface HubsoftFatura {
    id_fatura: number;
    quitado: boolean;
    status: string;
  
    nosso_numero: string;
    nosso_numero_dv: string | null;
  
    linha_digitavel: string | null;
    codigo_barras: string | null;
    pix_copia_cola: string | null;
    link: string | null;
  
    agencia_codigo_beneficiario: string | null;
    beneficiario: string | null;
  
    numero_documento: number | null;
  
    especie: string | null;
    especie_dinheiro: string;
  
    aceite: string | null;
    local_pagamento: string | null;
    carteira: string | null;
  
    tipo_cobranca: string;
  
    valor: number;
    valor_pago: number | null;
  
    data_vencimento: string;
    data_cadastro: string;
    data_pagamento: string | null;
  
    data_documento: string | null;
    data_processamento: string | null;
  
    empresa: HubsoftEmpresa;
  
    detalhamento: HubsoftDetalhamento[];
  
    cliente: HubsoftCliente;
  }
  
  export interface HubsoftEmpresa {
    documento: string;
    nome_razaosocial: string;
    nome_fantasia: string;
  }
  
  export interface HubsoftDetalhamento {
    id_cobranca: number;
    descricao: string;
    valor: number;
    valor_original: number;
    status: string;
  }
  
  export interface HubsoftCliente {
    codigo_cliente: number;
    nome_razaosocial: string;
    cpf_cnpj: string;
  
    servico: HubsoftServico;
  }
  
  export interface HubsoftServico {
    id_cliente_servico: number;
    numero_plano: number;
    nome: string;
    valor: number;
  
    status: string;
    status_prefixo: string;
  
    endereco_cadastral: HubsoftEndereco;
    endereco_instalacao: HubsoftEndereco;
    endereco_fiscal: HubsoftEndereco;
    endereco_cobranca: HubsoftEndereco;
  }
  
  export interface HubsoftEndereco {
    completo: string;
    endereco: string;
    numero: string;
    complemento: string | null;
    referencia: string | null;
    bairro: string;
    cep: string;
    estado: string;
    uf: string;
    cidade: string;
  
    coordenadas: HubsoftCoordenadas;
  }
  
  export interface HubsoftCoordenadas {
    latitude: number | null;
    longitude: number | null;
  }
  