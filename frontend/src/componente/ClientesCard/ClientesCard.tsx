import { useEffect, useState } from "react";
import type { Cliente } from "../../types";
import { Checkbox } from "../Checkbox/Checkbox";
import Styles from "./ClientesCard.module.css";
import {
  CircleQuestionMark,
  Phone,
  MessageSquareText,
  CircleDollarSign,
} from "lucide-react";

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
      <div className={Styles.card}>
        {/* 🔥 Wrapper que libera overflow */}
        <div className={Styles.cardContent}>
          {/* HEADER */}
          <div className={Styles.header}>
            <span className={Styles.title}>{cliente.name}</span>

            <span className={Styles.badge}>
              {cliente.dias_vencidos} Dias Vencidos
            </span>

            <div className={Styles.actions}>
              <Checkbox
                checked={checked}
                onChange={onToggle}
                name={`cliente-${cliente.id}`}
                className="Checkbox"
                onClick={(e) => e.stopPropagation()}
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
