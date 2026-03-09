import { NotFoundException } from '@nestjs/common';
import { InvoicesController } from './invoicesController';

describe('InvoicesController', () => {
  const clientRepo = {
    findOne: jest.fn(),
  };

  const ixcService = {
    getInvoices: jest.fn(),
  };

  const hubsoftService = {
    getInvoices: jest.fn(),
  };

  const sgpService = {
    getInvoices: jest.fn(),
  };

  const controller = new InvoicesController(
    clientRepo as any,
    ixcService as any,
    hubsoftService as any,
    sgpService as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('POST /invoices/search retorna NotFound quando documents esta vazio', async () => {
    await expect(
      controller.getInvoices({ documents: [] } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('processa clientes IXC com sucesso', async () => {
    const client = {
      name: 'Cliente IXC',
      company: { erp: 'IXC' },
    };
    const invoices = { list: [] };

    clientRepo.findOne.mockResolvedValue(client);
    ixcService.getInvoices.mockResolvedValue(invoices);

    const result = await controller.getInvoices({
      documents: [{ cnpj_cpf: '12.345.678/0001-00' }],
    } as any);

    expect(result.status).toBe('success');
    expect(result.data).toHaveLength(1);
    expect(result.errors).toBeUndefined();
    expect(ixcService.getInvoices).toHaveBeenCalledWith(client);
  });

  it('retorna partial quando um documento falha', async () => {
    const client = {
      name: 'Cliente IXC',
      company: { erp: 'IXC' },
    };

    clientRepo.findOne
      .mockResolvedValueOnce(client)
      .mockResolvedValueOnce(null);
    ixcService.getInvoices.mockResolvedValue({ list: [] });

    const result = await controller.getInvoices({
      documents: [{ cnpj_cpf: '111' }, { cnpj_cpf: '222' }],
    } as any);

    expect(result.status).toBe('partial');
    expect(result.data).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors?.[0].reason).toMatch(/Cliente/i);
  });

  it('retorna error para ERP nao suportado', async () => {
    clientRepo.findOne.mockResolvedValue({
      name: 'Cliente sem ERP',
      company: { erp: 'NAO_SUPORTADO' },
    });

    const result = await controller.getInvoices({
      documents: [{ cnpj_cpf: '123' }],
    } as any);

    expect(result.status).toBe('error');
    expect(result.data).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors?.[0].reason).toMatch(/ERP/i);
  });

  it('retorna error quando ocorre excecao inesperada no processamento', async () => {
    clientRepo.findOne.mockResolvedValue({
      name: 'Cliente IXC',
      company: { erp: 'IXC' },
    });
    ixcService.getInvoices.mockRejectedValue(new Error('boom'));

    const result = await controller.getInvoices({
      documents: [{ cnpj_cpf: '123' }],
    } as any);

    expect(result.status).toBe('error');
    expect(result.data).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors?.[0].reason).toMatch(/Erro inesperado/i);
  });
});
