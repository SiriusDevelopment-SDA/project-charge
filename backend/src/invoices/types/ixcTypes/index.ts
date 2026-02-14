export interface ResponseFnAReceber {
    id: string
    id_cliente: string;
    id_conta: string;
    filial_id: string;
    data_emissao: string;       // DD/MM/YYYY
    data_vencimento: string;    // DD/MM/YYYY
    valor: string;
    previsao: 'M' | 'A' | 'S';  // mensal, anual, semanal (confirme sua regra)
    tipo_recebimento: string;   // ex: "Pix"
    id_carteira_cobranca: string;
    liberado: 'S' | 'N';
    id_conta_class_finan_a?: string;
    documento?: string;
    obs?: string;
    status?: string;
    id_saida?: string;
    gerencianet_token?: string;
    tipo_conta?: string;
    id_cobranca?: string;
    status_cobranca?: string;
    id_nota_gerada?: string;
    id_im_imovel?: string;
    impresso?: string;
    arquivo_remessa_baixado?: string;
    duplicata?: string;
    id_sip?: string;
    tipo_renegociacao?: string;
    id_renegociacao?: string;
    id_renegociacao_novo?: string;
    forma_recebimento?: string;
    credito_data?: string;
    baixa_data?: string;
    baixa_id_operador?: string;
    cancelamento_id_operador?: string;
    numero_parcela_recorrente?: string;
    nparcela?: string;
    id_contrato_principal?: string;
    previsao_conta_receita?: string;
    tipo_cobranca?: string;
    parcela_proporcional?: string;
    tipo_pagamento_cartao?: string;
    titulo_protestado?: string;
    desconto_condicional_valor?: string;
    validade_desconto_condicional?: string;
    id_nota_gerada_opc2?: string;
    id_nota_gerada_opc3?: string;
    id_nota_gerada_opc4?: string;
    id_lote_geracao_financeiro_fatura?: string;
    valor_aberto?: string;
    valor_recebido?: string;
    pagamento_valor?: string;
    pagamento_data?: string;
    valor_cancelado?: string;
    data_cancelamento?: string;
    titulo_importado?: string;
    aguardando_confirmacao_pagamento?: string;
    parcelado_cartao?: string;
    recebido_via_pix?: string;
    id_remessa?: string;
    nn_boleto?: string;
    boleto?: string;
    gateway_link?: string;
    linha_digitavel?: string;
    id_remessa_alteracao?: string;
    motivo_alteracao?: string;
    pix_txid?: string;
    libera_periodo?: string;
    id_mot_cancelamento?: string;
    id_contrato?: string;
    id_contrato_avulso?: string;
    ultima_atualizacao?: string;
    id_conta_class_finan?: string;
    valor_class_finan?: string;
    json_class_finan?: string;
    id_nf_gerada?: string;
    id_nf_opcional2?: string;
    id_nf_opcional3?: string;
    id_nf_opcional4?: string;
  }
  