import { toast } from 'react-toastify';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import {
  compilarTemplate,
  extrairDocumentosClientes,
  getTipoPlanilha,
  processarDocumentos,
  todasColunasPreenchidas,
  validarArquivo,
  validarSelecaoCliente,
} from './validation';

vi.mock('react-toastify', () => ({
  toast: {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

describe('validation utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('extrai e normaliza apenas documentos válidos', () => {
    const rows = [
      { cnpj_cpf: '123.456.789-09' },
      { cnpj_cpf: '12.345.678/0001-90' },
      { cnpj_cpf: '12345' },
    ];

    const result = extrairDocumentosClientes(rows);

    expect(result).toEqual(['12345678909', '12345678000190']);
  });

  it('lança erro quando coluna cnpj_cpf não existe', () => {
    expect(() =>
      extrairDocumentosClientes([{ documento: '123' }] as any[]),
    ).toThrow('Planilha inválida: coluna cnpj_cpf ausente');
  });

  it('valida extensão e tamanho do arquivo', () => {
    const validFile = new File(['abc'], 'clientes.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    expect(() => validarArquivo(validFile)).not.toThrow();

    const invalidTypeFile = new File(['abc'], 'clientes.txt', {
      type: 'text/plain',
    });
    expect(() => validarArquivo(invalidTypeFile)).toThrow(
      'Arquivo inválido. Envie um XLSX.',
    );

    const largeFile = new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'big.xlsx', {
      type: 'application/vnd.ms-excel',
    });
    expect(() => validarArquivo(largeFile)).toThrow('Arquivo muito grande.');
  });

  it('notifica sucesso ou erro ao processar documentos', () => {
    processarDocumentos([]);
    expect(toast.error).toHaveBeenCalledWith('Nenhum CNPJ/CPF válido encontrado');

    processarDocumentos(['12345678909', '12345678000190']);
    expect(toast.success).toHaveBeenCalledWith(
      '2 documentos processados com sucesso',
    );
  });

  it('compila template substituindo variáveis mapeadas', () => {
    const message = 'Olá {{1}}, vencimento {{2}} e {{3}}';
    const variables = { '1': 'nome_cliente', '2': 'data_vencimento' };
    const mapped = { nome_cliente: 'Ana', data_vencimento: '10/03/2026' };

    const result = compilarTemplate(message, variables, mapped);

    expect(result).toBe('Olá Ana, vencimento 10/03/2026 e ');
  });

  it('identifica tipo da planilha pelo nome do arquivo', () => {
    expect(getTipoPlanilha('LEADs_manha.xlsx')).toBe('lead');
    expect(getTipoPlanilha('clientes_base.xlsx')).toBe('cliente');
    expect(getTipoPlanilha('arquivo.xlsx')).toBe('desconhecida');
  });

  it('considera colunas obrigatórias preenchidas exceto status', () => {
    expect(
      todasColunasPreenchidas({
        whatsapp: '5511999999999',
        nome_cliente: 'Maria',
        status: 'válido',
      }),
    ).toBe(true);

    expect(
      todasColunasPreenchidas({
        whatsapp: '',
        nome_cliente: 'Maria',
        status: 'válido',
      }),
    ).toBe(false);
  });

  it('bloqueia seleção de cobrança quando cliente não possui fatura aberta', () => {
    const result = validarSelecaoCliente(
      {
        id: '1',
        name: 'Cliente 1',
        cnpj_cpf: '12345678909',
        invoices: { list: [{ invoice_status: 'Pago' }] } as any,
      },
      { category: 'Cobrança' } as any,
    );

    expect(result).toBe(false);
    expect(toast.warning).toHaveBeenCalled();
  });

  it('permite seleção quando não é template de cobrança', () => {
    const result = validarSelecaoCliente(
      { id: '1', name: 'Cliente 1', cnpj_cpf: '12345678909' } as any,
      { category: 'Comercial' } as any,
    );

    expect(result).toBe(true);
    expect(toast.warning).not.toHaveBeenCalled();
  });
});
