import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { InvoicesController } from './invoicesController';
import { Client } from '../../clients/entities.ts/clients';
import { Invoice } from '../entities/invoices';
import { Company } from '../../companies/entities/companies';
import { InvoiceSyncCron } from '../invoice-sync.cron';
import { RedisService } from '../../redis/redis.service';
import { IXCInvoicesService } from '../services/ixcInvoicesService';
import { MkInvoicesService } from '../services/mkInvoicesService';
import { InvoicesService } from '../invoices.service';
import type { TokenDeSessao } from '../../auth/company-scope';
import type { PixBatchRequestDto } from '../dto/search.request.dto.invoices';

/**
 * Escopo de empresa nas rotas de faturas (B1).
 *
 * O criterio do plano e por ROTA, nao so pela regra: mesma empresa passa,
 * outra empresa da 403, super_admin atravessa. A regra pura tem teste proprio
 * em `auth/company-scope.spec.ts`; aqui o que se prova e que o handler
 * REALMENTE a consulta antes de tocar no banco — o defeito seria justamente
 * alguem esquecer de ligar num dos tres.
 */
describe('InvoicesController — escopo de empresa', () => {
  const EMPRESA_A = '11111111-1111-4111-8111-111111111111';
  const EMPRESA_B = '22222222-2222-4222-8222-222222222222';

  const sessao = (over: Partial<TokenDeSessao> = {}): TokenDeSessao => ({
    sub: EMPRESA_A,
    account: '900',
    agentId: 'agente-1',
    agentRole: 'operator',
    ...over,
  });

  let controller: InvoicesController;
  let companyFindOne: jest.Mock;
  let clientFindOne: jest.Mock;
  let ixcGetPix: jest.Mock;
  let mkFetchPix: jest.Mock;
  let syncStateByAccount: jest.Mock;

  beforeEach(async () => {
    companyFindOne = jest.fn().mockResolvedValue({
      id: EMPRESA_A,
      // ERP fora dos ramos IXC/MK: cai no snapshot local, que e o caminho mais
      // curto para o teste chegar ao fim sem simular ERP.
      erp: 'SGP',
    });

    clientFindOne = jest.fn().mockResolvedValue(null);
    ixcGetPix = jest.fn().mockResolvedValue({ status: 'success', pix: 'x' });
    mkFetchPix = jest.fn().mockResolvedValue('pix-mk');
    syncStateByAccount = jest.fn().mockResolvedValue(null);

    const modulo = await Test.createTestingModule({
      controllers: [InvoicesController],
      providers: [
        { provide: getRepositoryToken(Client), useValue: { findOne: clientFindOne } },
        {
          provide: getRepositoryToken(Invoice),
          useValue: { find: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: getRepositoryToken(Company),
          useValue: { findOne: companyFindOne },
        },
        {
          provide: InvoiceSyncCron,
          useValue: { getStateByAccount: syncStateByAccount },
        },
        { provide: RedisService, useValue: { get: jest.fn(), set: jest.fn() } },
        { provide: IXCInvoicesService, useValue: { getPixByInvoice: ixcGetPix } },
        { provide: MkInvoicesService, useValue: { fetchPixByInvoice: mkFetchPix } },
        {
          provide: InvoicesService,
          useValue: { buildBatchResponse: jest.fn().mockReturnValue({ status: 'partial' }) },
        },
        // O `@UseGuards(PlanGuard)` de `searchOverdueClients` faz o Nest
        // instanciar o guard mesmo chamando o handler direto. Os guards nao
        // rodam neste teste — quem esta sob prova e o escopo dentro do
        // handler, nao a cadeia HTTP.
        { provide: JwtService, useValue: { verifyAsync: jest.fn() } },
      ],
    }).compile();

    controller = modulo.get(InvoicesController);
    jest.spyOn(controller['logger'], 'warn').mockImplementation();
  });

  const pedidoPix = (companyId?: string) =>
    ({ companyId, invoiceIds: ['9001'] }) as PixBatchRequestDto;

  describe('POST /invoices/pix/batch', () => {
    it('usa a empresa do token quando o corpo nao manda companyId', async () => {
      await controller.getPixBatch(pedidoPix(), sessao());

      expect(companyFindOne).toHaveBeenCalledWith({ where: { id: EMPRESA_A } });
    });

    it('aceita quando o corpo repete a empresa do token', async () => {
      await controller.getPixBatch(pedidoPix(EMPRESA_A), sessao());

      expect(companyFindOne).toHaveBeenCalledWith({ where: { id: EMPRESA_A } });
    });

    it('RECUSA com 403 quando o corpo pede outra empresa', async () => {
      await expect(
        controller.getPixBatch(pedidoPix(EMPRESA_B), sessao()),
      ).rejects.toThrow(ForbiddenException);
    });

    it('nao chega ao banco quando recusa', async () => {
      // A barreira precisa vir ANTES da consulta: se a query rodar e so o
      // retorno for barrado, o vazamento ja aconteceu no log e no tempo.
      await expect(
        controller.getPixBatch(pedidoPix(EMPRESA_B), sessao()),
      ).rejects.toThrow(ForbiddenException);

      expect(companyFindOne).not.toHaveBeenCalled();
    });

    it('deixa super_admin atravessar, e registra', async () => {
      companyFindOne.mockResolvedValue({ id: EMPRESA_B, erp: 'SGP' });
      const token = sessao({ agentRole: 'super_admin', agentId: 'suporte-1' });

      await controller.getPixBatch(pedidoPix(EMPRESA_B), token);

      expect(companyFindOne).toHaveBeenCalledWith({ where: { id: EMPRESA_B } });
      expect(controller['logger'].warn).toHaveBeenCalledWith(
        expect.stringContaining('suporte-1'),
      );
    });

    it('nao registra travessia quando super_admin fica na propria empresa', async () => {
      const token = sessao({ agentRole: 'super_admin' });

      await controller.getPixBatch(pedidoPix(EMPRESA_A), token);

      expect(controller['logger'].warn).not.toHaveBeenCalled();
    });
  });

  describe('POST /invoices/overdue-clients/search', () => {
    it('RECUSA com 403 quando o corpo pede outro account', async () => {
      await expect(
        controller.searchOverdueClients({ account: '901' }, sessao()),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('POST /invoices/pix/batch — ramos por ERP', () => {
    it('o ramo IXC recebe a empresa do token, nao a do corpo', async () => {
      companyFindOne.mockResolvedValue({ id: EMPRESA_A, erp: 'IXC' });

      await controller.getPixBatch(pedidoPix(), sessao());

      expect(ixcGetPix).toHaveBeenCalledWith({
        companyId: EMPRESA_A,
        invoiceId: '9001',
      });
    });

    it('o ramo MK recebe a empresa resolvida pelo escopo', async () => {
      const empresa = { id: EMPRESA_A, erp: 'MK' };
      companyFindOne.mockResolvedValue(empresa);

      await controller.getPixBatch(pedidoPix(), sessao());

      expect(mkFetchPix).toHaveBeenCalledWith(empresa, '9001');
    });
  });

  describe('POST /invoices/search', () => {
    it('RECUSA com 403 quando o corpo pede outra empresa', async () => {
      await expect(
        controller.getInvoices({ companyId: EMPRESA_B }, sessao()),
      ).rejects.toThrow(ForbiddenException);
    });

    it('filtra o cliente pela empresa da sessao na busca por documento', async () => {
      // Sem este filtro, digitar o CPF achava o cliente de QUALQUER empresa.
      await controller.getInvoices(
        { documents: [{ cnpj_cpf: '11122233344' }] } as never,
        sessao(),
      );

      expect(clientFindOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ company: { id: EMPRESA_A } }),
        }),
      );
    });

    it('super_admin sem alvo mantem a busca global por documento', async () => {
      await controller.getInvoices(
        { documents: [{ cnpj_cpf: '11122233344' }] } as never,
        sessao({ agentRole: 'super_admin' }),
      );

      const where = clientFindOne.mock.calls[0][0].where;
      expect(where).not.toHaveProperty('company');
    });
  });

  describe('rotas GET por account na URL', () => {
    it('open-client-ids RECUSA account de outra empresa', async () => {
      await expect(
        controller.getOpenClientIds('901', sessao()),
      ).rejects.toThrow(ForbiddenException);
      expect(companyFindOne).not.toHaveBeenCalled();
    });

    it('open-client-ids usa o account do token quando bate', async () => {
      companyFindOne.mockResolvedValue(null);

      await controller.getOpenClientIds('900', sessao());

      expect(companyFindOne).toHaveBeenCalledWith({
        where: { account_chatwoot: '900' },
      });
    });

    it('sync-state RECUSA account de outra empresa', async () => {
      await expect(controller.getSyncState('901', sessao())).rejects.toThrow(
        ForbiddenException,
      );
      expect(syncStateByAccount).not.toHaveBeenCalled();
    });

    it('sync-state deixa super_admin consultar outra empresa', async () => {
      syncStateByAccount.mockResolvedValue(null);

      await expect(
        controller.getSyncState('901', sessao({ agentRole: 'super_admin' })),
      ).rejects.toThrow(/Nenhuma empresa encontrada/);

      expect(syncStateByAccount).toHaveBeenCalledWith('901');
    });
  });
});
