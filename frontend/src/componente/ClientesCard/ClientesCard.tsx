import type { Cliente } from "../../types";
import { Checkbox } from "../Checkbox/Checkbox";
import Styles from "./ClientesCard.module.css";
import {
  CircleQuestionMark,
  Phone,
  MessageSquareText,
  CircleDollarSign,
  IdCard,
  Layers,
  CalendarClock,
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
};

export function ClientesCard({ cliente, checked, onToggle }: Props) {
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

  const faturaMaisAntiga = invoicesParaExibir
    .sort((a, b) => {
      const toDate = (str: string) => {
        const [d, m, y] = str.split("/").map(Number);
        return new Date(y, m - 1, d).getTime();
      };
      return toDate(a.invoice_due_date) - toDate(b.invoice_due_date);
    })[0];

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
    <div className={Styles.Cards}>
      <div className={Styles.card} onClick={(event) => event.stopPropagation()}>
        <div className={Styles.cardContent}>
          <div className={Styles.header}>
            <span className={Styles.title}>{cliente.name}</span>

            <span className={badgeClassName}>
              {badgeTexto}
            </span>

            <div className={Styles.actions}>
              <Checkbox
                checked={checked}
                onChange={onToggle}
                name={`cliente-${cliente.id}`}
                className="Checkbox"
              />

              <div className={Styles.infoIcon}>
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
        </div>
      </div>
    </div>
  );
}
