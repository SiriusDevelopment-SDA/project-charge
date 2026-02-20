import { Calendar, Clock } from "lucide-react";
import Style from "./CardCampanhas.module.css";

type ModalEditarCampanhaProps = {
  open: boolean;
  onClose: () => void;
  onSave: () => void;
  tipo: string;
  setTipo: (value: string) => void;
  dataDisparo: string;
  onOpenCalendarDisparo: () => void;
  dataFinalizacao: string;
  onOpenCalendarFinalizacao: () => void;
  horario: string;
  onOpenTimePicker: () => void;
};

export function ModalEditarCampanha({
  open,
  onClose,
  onSave,
  tipo,
  setTipo,
  dataDisparo,
  onOpenCalendarDisparo,
  dataFinalizacao,
  onOpenCalendarFinalizacao,
  horario,
  onOpenTimePicker,
}: ModalEditarCampanhaProps) {
  if (!open) return null;

  return (
    <div className={Style.modalOverlay}>
      <div className={Style.modal}>
        <h3>Editar dados da campanha</h3>
        
        <label>Tipo</label>
        <select
          className={Style.dateInputButton}
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
        >
          <option value="Disparo Único">Disparo Único</option>
          <option value="Disparo Recorrente">Disparo Recorrente</option>
        </select>

        <label>Data de Disparo</label>
        <button
          type="button"
          className={Style.dateInputButton}
          onClick={onOpenCalendarDisparo}
        >
          <span>{dataDisparo || "Selecione a data"}</span>
          <Calendar size={18} />
        </button>

        <label>Data de Finalização</label>
        <button
          type="button"
          className={Style.dateInputButton}
          onClick={onOpenCalendarFinalizacao}
        >
          <span>{dataFinalizacao || "Selecione a data"}</span>
          <Calendar size={18} />
        </button>

        <label>Horário</label>
        <button
          type="button"
          className={Style.dateInputButton}
          onClick={onOpenTimePicker}
        >
          <span>{horario || "Selecione o horário"}</span>
          <Clock size={18} />
        </button>

        <div className={Style.modalActions}>
          <button onClick={onClose}>Cancelar</button>
          <button onClick={onSave}>Salvar</button>
        </div>
      </div>
    </div>
  );
}
