import type { Cliente } from "../../types";
import { Checkbox } from "../Checkbox/Checkbox";
import Styles from "./ClientesCard.module.css";
import { CircleQuestionMark, Phone, MessageSquareText, CircleDollarSign } from "lucide-react";

type Props = {
  cliente: Cliente;
  checked: boolean;
  onToggle: () => void;
};

export function ClientesCard({ cliente, checked, onToggle }: Props) {
  return (
    <div className={Styles.Cards}>
      <div className={Styles.card} onClick={(event) => event.stopPropagation()}>
        <div className={Styles.cardContent}>
          <div className={Styles.header}>
            <span className={Styles.title}>{cliente.name}</span>

            <span className={Styles.badge}>
              {maiorAtrasoCliente(cliente.invoices?.list ?? [])} Dias Vencidos
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
            <p className={Styles.message}>
              <Phone className={Styles.IconPhone} />
              {cliente.whatsapp}
            </p>

            <p className={Styles.message}>
              <MessageSquareText className={Styles.IconMessage} />
              {"implementar"}
            </p>

            <p className={Styles.message}>
              <CircleDollarSign className={Styles.IconCircleDollar} />
              R$ {"implementar"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
