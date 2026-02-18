import { useEffect, useMemo, useState } from "react";
import type { Cliente } from "../../types";
import { Checkbox } from "../Checkbox/Checkbox";
import Styles from "./ClientesCard.module.css";
import {
  CircleQuestionMark,
  Phone,
  MessageSquareText,
  CircleDollarSign,
} from "lucide-react";
import { maiorAtrasoCliente } from "../../utils/filtrosClientesVencidos";

type Props = {
  cliente: Cliente;
  checked: boolean;
  onToggle: () => void;
};

export function ClientesCard({
  cliente,
  checked,
  onToggle,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);

  const invoices = cliente.invoices ?? [];

  const [diasVencidos, setDiasVencidos] = useState<number | null>(null);

  useEffect(() => {
    const invoices = cliente.invoices;

    if (invoices === undefined) {
      setDiasVencidos(null);
      return;
    }

    if (!invoices.length) {
      setDiasVencidos(0);
      return;
    }

    const atraso = maiorAtrasoCliente(invoices);
    setDiasVencidos(atraso);

  }, [cliente.invoices]);

  // Fecha o balão ao clicar fora
  useEffect(() => {
    function handleClickOutside() {
      setIsOpen(false);
    }

    if (isOpen) {
      document.addEventListener("click", handleClickOutside);
    }

    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className={Styles.Cards}>
      <div className={Styles.card}
        onClick={(e) => e.stopPropagation()}
      >

        {/* 🔥 Wrapper que libera overflow */}
        <div className={Styles.cardContent}>
          {/* HEADER */}
          <div className={Styles.header}>
            <span className={Styles.title}>{cliente.name}</span>

            <span className={Styles.badge}>
              {diasVencidos === null
                ? "Carregando..."
                : `Vencidos: ${diasVencidos} dias`}
            </span>

            <div className={Styles.actions}>
              <Checkbox
                checked={checked}
                onChange={onToggle}
                name={`cliente-${cliente.id}`}
                className="Checkbox"
              />

              <div className={Styles.infoIcon}>
                <CircleQuestionMark
                  size={16}
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsOpen((prev) => !prev);
                  }}
                />

                {isOpen && (
                  <div
                    className={Styles.infoBalloon}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <strong>Campanhas ativas do cliente</strong>
                    <div>
                      <span>campanhas:</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* CONTEÚDO */}
          <div className={Styles.MensageCopy}>
            <p className={Styles.message}>
              <Phone className={Styles.IconPhone} />
              {cliente.whatsapp}
            </p>

            <p className={Styles.message}>
              <MessageSquareText className={Styles.IconMessage} />
              {cliente.plano}
            </p>

            <p className={Styles.message}>
              <CircleDollarSign className={Styles.IconCircleDollar} />
              R$ {cliente.valor_divida}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
