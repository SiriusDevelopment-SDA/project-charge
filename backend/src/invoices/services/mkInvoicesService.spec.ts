import { MkInvoicesService, MkInvoiceRecord } from './mkInvoicesService';
import type { RedisService } from '../../redis/redis.service';

/**
 * Cobre as regras de negócio puras da Parte 2 (faturas) do adapter MK/PROXER:
 * - formatSyncDate produz DD/MM/YYYY (formato exigido pela WSMKFaturasAbertas);
 * - toInvoiceUpsert mapeia lista+detalhe para o snapshot e retorna null sem Vcto.
 * Métodos de rede (getInvoices/getInvoicesByDateWindowBatch) não são exercitados
 * aqui — dependem da API externa e do shape ainda não confirmado.
 */
describe('MkInvoicesService — faturas (Parte 2)', () => {
  const redisStub = {} as unknown as RedisService;
  const service = new MkInvoicesService(redisStub);

  describe('formatSyncDate', () => {
    it('formata a data como DD/MM/YYYY', () => {
      const date = new Date(2019, 8, 15); // 15/09/2019 (mês 8 = setembro)
      expect(service.formatSyncDate(date)).toBe('15/09/2019');
    });

    it('aplica zero-padding em dia e mês', () => {
      const date = new Date(2026, 0, 5); // 05/01/2026
      expect(service.formatSyncDate(date)).toBe('05/01/2026');
    });
  });

  describe('toInvoiceUpsert', () => {
    const context = {
      clientId: 'client-uuid',
      companyId: 'company-uuid',
      syncTime: new Date('2026-06-10T12:00:00.000Z'),
    };

    it('mapeia uma fatura com vencimento (Vcto) e PDF (PathDownload)', () => {
      const record: MkInvoiceRecord = {
        cd_fatura: 49291,
        codpessoa: 3253,
        status: 'Em aberto',
        valor: 146.52,
        Vcto: '15/09/2019',
        PathDownload: 'https://erp.example.com/tmp/xxx.PDF',
        Valor: 'R$ 146,52',
      };

      const result = service.toInvoiceUpsert(record, context);

      expect(result).toEqual({
        id_fatura: '49291',
        contractId: undefined,
        value: '146.52',
        status: 'A Receber',
        expiration: '15/09/2019',
        ticketDigitableLine: null,
        ticketPdfLink: 'https://erp.example.com/tmp/xxx.PDF',
        pixCode: null,
        lastSyncAt: context.syncTime,
        clientId: 'client-uuid',
        companyId: 'company-uuid',
      });
    });

    it('retorna null quando não há vencimento (Vcto ausente)', () => {
      const record: MkInvoiceRecord = {
        cd_fatura: 1,
        codpessoa: 2,
        valor: 10,
      };
      expect(service.toInvoiceUpsert(record, context)).toBeNull();
    });

    it('usa ticketPdfLink null quando PathDownload ausente', () => {
      const record: MkInvoiceRecord = {
        cd_fatura: 7,
        codpessoa: 9,
        valor: 50,
        Vcto: '01/02/2026',
      };
      const result = service.toInvoiceUpsert(record, context);
      expect(result?.ticketPdfLink).toBeNull();
      expect(result?.pixCode).toBeNull();
    });
  });
});
