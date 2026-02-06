import type { Cliente } from "../../types";
import { Checkbox } from "../Checkbox/Checkbox";
import Styles from "./ClientesCard.module.css";
import {
  CircleQuestionMark,
  Phone,
  MessageSquareText,
  CircleDollarSign,
} from "lucide-react";

export type ClienteCard = {
  id: string;
  name: string;
  telefone: string;
  plano: string;
  valor_divida: number;
  dias_vencidos: number;
};

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
  console.log("teste",cliente)
  return (
    <div className={Styles.Cards}>
      {/* CARD BASE */}
      <div className={Styles.card}>
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
              
            />
            <CircleQuestionMark size={16} />
          </div>
        </div>

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
  );
}
