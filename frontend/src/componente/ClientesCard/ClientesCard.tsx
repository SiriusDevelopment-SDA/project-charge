import { useMemo, useState } from "react";
import type { Cliente, PaymentPromise } from "../../types";
import { ClientDetailModal } from "../ClientDetailModal/ClientDetailModal";
import Styles from "./ClientesCard.module.css";
import {
  CircleQuestionMark,
  Phone,
  MessageSquareText,
  CircleDollarSign,
  IdCard,
  Layers,
  CalendarClock,
  Send,
  HandshakeIcon,
  ClipboardList,
} from "lucide-react";
import {
  calcularDiasRelativosHoje,
  calcularDividaCliente,
  maiorAtrasoCliente,
  faturasVencidas,
} from "../../utils/filtrosClientesVencidos";

type Props = {
  cliente: Cliente;
  checked: boolean;
  onToggle: () => void;
  companyId: string;
  latestPromise?: PaymentPromise | null;
  dispatchCount?: number;
  onDispatch?: () => void;
};

const PROMISE_STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  kept: "Cumprida",
  broken: "Quebrada",
  cancelled: "Cancelada",
};

const PROMISE_STATUS_CLASS: Record<string, string> = {
  pending: Styles.promisePending,
  kept: Styles.promiseKept,
  broken: Styles.promiseBroken,
  cancelled: Styles.promiseCancelled,
};

export function ClientesCard({ cliente, checked, onToggle, companyId, latestPromise, dispatchCount = 0, onDispatch }: Props) {
  const [detailOpen, setDetailOpen] = useState(false);

  const invoices = cliente.invoices?.list ?? [];
  const overdueInvoices = invoices.filter(faturasVencidas);
  const diasVencidos = overdueInvoices.length ? maiorAtrasoCliente(overdueInvoices) : 0;
  const totalDivida = overdueInvoices.length
    ? calcularDividaCliente(overdueInvoices)
    : invoices.reduce((total, invoice) => {
        const valor = Number(invoice.invoice_amount);
        return total + (Number.isFinite(valor) ? valor : 0);
      }, 0);
  const qtdVencidas = overdueInvoices.length || invoices.length;

  const planos =
    cliente.services?.map((s) => s.name).filter(Boolean).join(", ") ||
    (invoices[0]?.contract_id ? `Contrato ${invoices[0].contract_id}` : "—");

  const invoicesParaExibir = overdueInvoices.length ? overdueInvoices : invoices;

  const faturaMaisAntiga = useMemo(() => {
    const toDate = (str: string) => {
      const [d, m, y] = str.split("/").map(Number);
      return new Date(y, m - 1, d).getTime();
    };
    return invoicesParaExibir
      .slice()
      .sort((a, b) => toDate(a.invoice_due_date) - toDate(b.invoice_due_date))[0];
  }, [invoicesParaExibir]);

  const diasRelativos = faturaMaisAntiga?.invoice_due_date
    ? calcularDiasRelativosHoje(faturaMaisAntiga.invoice_due_date)
    : 0;

  const badgeTexto =
    diasVencidos > 0
      ? `${diasVencidos} Dias Vencidos`
      : diasRelativos > 0
        ? `${diasRelativos} Dias para vencer`
        : "Vence hoje";

  const badgeClassName =
    diasVencidos > 0
      ? `${Styles.badge} ${Styles.badgeOverdue}`
      : diasRelativos > 0
        ? `${Styles.badge} ${Styles.badgeUpcoming}`
        : `${Styles.badge} ${Styles.badgeToday}`;

  return (
    <>
      <div className={Styles.Cards}>
        <button
          type="button"
          className={`${Styles.card} ${checked ? Styles.cardSelected : ""}`}
          onClick={onToggle}
          aria-pressed={checked}
        >
          <div className={Styles.cardContent}>

            {/* HEADER */}
            <div className={Styles.header}>
              <span className={Styles.title}>{cliente.name}</span>

              <span className={badgeClassName}>{badgeTexto}</span>

              <div className={Styles.actions}>
                {checked && (
                  <span className={Styles.selectionBadge}>Selecionado</span>
                )}

                <div
                  className={Styles.infoIcon}
                  onClick={(event) => event.stopPropagation()}
                >
                  <CircleQuestionMark size={16} className={Styles.iconInfo} />
                  <div className={Styles.infoBalloon}>
                    <strong>Campanhas ativas do cliente</strong>
                    <div>
                      <span>campanhas:</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* INFO GRID */}
            <div className={Styles.MensageCopy}>
              <div className={Styles.colLeft}>
                <p className={Styles.message}>
                  <Phone className={Styles.IconPhone} />
                  {cliente.whatsapp ?? "—"}
                </p>

                <p className={Styles.message}>
                  <MessageSquareText className={Styles.IconMessage} />
                  {qtdVencidas} fatura{qtdVencidas !== 1 ? "s" : ""} em aberto
                </p>

                <p className={Styles.message}>
                  <CircleDollarSign className={Styles.IconCircleDollar} />
                  R$ {totalDivida.toFixed(2).replace(".", ",")}
                </p>
              </div>

              <div className={Styles.colRight}>
                <p className={Styles.message}>
                  <IdCard className={Styles.IconPhone} />
                  {cliente.cnpj_cpf ?? "—"}
                </p>

                <p className={Styles.message}>
                  <Layers className={Styles.IconMessage} />
                  {planos}
                </p>

                <p className={Styles.message}>
                  <CalendarClock className={Styles.IconCircleDollar} />
                  {faturaMaisAntiga ? faturaMaisAntiga.invoice_due_date : "—"}
                </p>
              </div>
            </div>

            {/* EXTRA ROW: dispatches + latest promise */}
            <div className={Styles.extraRow}>
              <span className={Styles.extraItem}>
                <Send size={12} />
                {dispatchCount} cobranças enviadas
              </span>

              {latestPromise ? (
                <span className={`${Styles.extraItem} ${PROMISE_STATUS_CLASS[latestPromise.status] ?? ""}`}>
                  <HandshakeIcon size={12} />
                  Promessa: {new Date(latestPromise.promised_payment_date).toLocaleDateString("pt-BR")} — {PROMISE_STATUS_LABEL[latestPromise.status] ?? latestPromise.status}
                </span>
              ) : (
                <span className={`${Styles.extraItem} ${Styles.noPromise}`}>
                  <HandshakeIcon size={12} />
                  Sem promessa registrada
                </span>
              )}
            </div>

            {/* FOOTER ACTIONS */}
            <div className={Styles.cardFooter}>
              <button
                className={Styles.btnDetail}
                onClick={(event) => {
                  event.stopPropagation();
                  setDetailOpen(true);
                }}
              >
                <ClipboardList size={13} />
                Ver detalhes
              </button>

              {onDispatch && (
                <button
                  className={Styles.btnDispatch}
                  onClick={(event) => {
                    event.stopPropagation();
                    onDispatch();
                  }}
                >
                  <Send size={13} />
                  Disparar
                </button>
              )}
            </div>

          </div>
        </button>
      </div>

      <ClientDetailModal
        cliente={cliente}
        companyId={companyId}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
      />
    </>
  );
}
