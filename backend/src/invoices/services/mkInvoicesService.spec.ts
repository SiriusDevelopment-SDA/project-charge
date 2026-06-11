import { MkInvoicesService, MkInvoiceRecord } from "./mkInvoicesService";
import type { RedisService } from "../../redis/redis.service";

/**
 * Cobre as regras de negócio puras da Parte 2 (faturas) do adapter MK/PROXER:
 * - formatSyncDate produz DD/MM/YYYY (formato exigido pela WSMKFaturasAbertas);
 * - toInvoiceUpsert mapeia lista+detalhe para o snapshot e retorna null sem Vcto.
 * Métodos de rede (getInvoices/getInvoicesByDateWindowBatch) não são exercitados
 * aqui — dependem da API externa e do shape ainda não confirmado.
 */
describe("MkInvoicesService — faturas (Parte 2)", () => {
  const redisStub = {} as unknown as RedisService;
  const service = new MkInvoicesService(redisStub);

  // `repairMkEncoding` é privado; acessamos via cast para teste de unidade sem
  // alterar a visibilidade de produção.
  const repair = (value: unknown): unknown =>
    (
      service as unknown as { repairMkEncoding(v: unknown): unknown }
    ).repairMkEncoding(value);

  describe("formatSyncDate", () => {
    it("formata a data como DD/MM/YYYY", () => {
      const date = new Date(2019, 8, 15); // 15/09/2019 (mês 8 = setembro)
      expect(service.formatSyncDate(date)).toBe("15/09/2019");
    });

    it("aplica zero-padding em dia e mês", () => {
      const date = new Date(2026, 0, 5); // 05/01/2026
      expect(service.formatSyncDate(date)).toBe("05/01/2026");
    });
  });

  describe("toInvoiceUpsert", () => {
    const context = {
      clientId: "client-uuid",
      companyId: "company-uuid",
      syncTime: new Date("2026-06-10T12:00:00.000Z"),
    };

    it("mapeia uma fatura com vencimento (Vcto) e PDF (PathDownload)", () => {
      const record: MkInvoiceRecord = {
        cd_fatura: 49291,
        codpessoa: 3253,
        status: "Em aberto",
        valor: 146.52,
        Vcto: "15/09/2019",
        PathDownload: "https://erp.example.com/tmp/xxx.PDF",
        Valor: "R$ 146,52",
      };

      const result = service.toInvoiceUpsert(record, context);

      expect(result).toEqual({
        id_fatura: "49291",
        contractId: undefined,
        value: "146.52",
        status: "A Receber",
        expiration: "15/09/2019",
        ticketDigitableLine: null,
        ticketPdfLink: "https://erp.example.com/tmp/xxx.PDF",
        pixCode: null,
        lastSyncAt: context.syncTime,
        clientId: "client-uuid",
        companyId: "company-uuid",
      });
    });

    it("retorna null quando não há vencimento (Vcto ausente)", () => {
      const record: MkInvoiceRecord = {
        cd_fatura: 1,
        codpessoa: 2,
        valor: 10,
      };
      expect(service.toInvoiceUpsert(record, context)).toBeNull();
    });

    it("usa ticketPdfLink null quando PathDownload ausente", () => {
      const record: MkInvoiceRecord = {
        cd_fatura: 7,
        codpessoa: 9,
        valor: 50,
        Vcto: "01/02/2026",
      };
      const result = service.toInvoiceUpsert(record, context);
      expect(result?.ticketPdfLink).toBeNull();
      expect(result?.pixCode).toBeNull();
    });
  });

  describe("repairMkEncoding", () => {
    it("repara o padrão quebrado da MK (bytes UTF-8 crus em code points latin1)", () => {
      // "INFORMAÇÃO" chega da MK como os bytes UTF-8 crus expostos como code
      // points latin1: 0xC3 0x87 (Ç) e 0xC3 0x83 (Ã). Reinterpretados como
      // UTF-8, voltam ao texto correto. Construído por code point para não
      // depender da codificação deste arquivo de teste.
      const broken =
        "INFORMA" + String.fromCharCode(0xc3, 0x87, 0xc3, 0x83) + "O";
      const expected = "INFORMA" + String.fromCharCode(0xc7, 0xc3) + "O"; // INFORMAÇÃO
      expect(repair(broken)).toBe(expected);
    });

    it("mantém ASCII puro inalterado", () => {
      expect(repair("RICARDO FELIPE")).toBe("RICARDO FELIPE");
    });

    it("não altera strings com code point > 0xFF (guard)", () => {
      // O guard de `repairMkEncoding` só dispara para code points > 0xFF, que
      // não cabem em 1 byte latin1 e portanto não fazem parte do padrão quebrado
      // da MK (cujos bytes crus são sempre 0x80-0xFF). Ex.: "日本" (U+65E5/U+672C)
      // e um emoji devem voltar intactos. Construído por code point para não
      // depender da codificação deste arquivo de teste.
      const cjk = String.fromCharCode(0x65e5, 0x672c); // 日本
      expect(repair(cjk)).toBe(cjk);

      const withEmoji = "pagamento " + String.fromCodePoint(0x1f600);
      expect(repair(withEmoji)).toBe(withEmoji);
    });

    it("repara recursivamente strings dentro de objetos e arrays", () => {
      const broken = "INFORMA" + String.fromCharCode(0xc3, 0x87) + "O";
      const fixed = "INFORMA" + String.fromCharCode(0xc7) + "O"; // "INFORMAÇO"
      const input = {
        nome: broken,
        lista: ["ASCII", broken],
        codigo: 49291,
      };
      expect(repair(input)).toEqual({
        nome: fixed,
        lista: ["ASCII", fixed],
        codigo: 49291,
      });
    });
  });
});
