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
  const isRecorrente = tipo === "true"; // se você estiver usando string "true"/"false"

  return (
    <div className={Style.modalOverlay}>
      <div className={Style.modal}>
        <h3>Editar dados da campanha</h3>

        <label>Tipo</label>
        <select
          className={Style.dateInputButton}
          value={tipo}
          onChange={(e) => {
            const novoTipo = e.target.value;
            setTipo(novoTipo);

            // 🔥 Se virar disparo único, limpa data final
            if (novoTipo === "Disparo Único" && dataFinalizacao) {
              // opcional: você pode limpar aqui
              // setDataFinalizacao("");
            }
          }}
        >
          <option value="false">Disparo Único</option>
          <option value="true">Disparo Contínuo</option>
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

        {isRecorrente && (
          <>
            <label>Data de Finalização</label>
            <button
              type="button"
              className={Style.dateInputButton}
              onClick={onOpenCalendarFinalizacao}
            >
              <span>{dataFinalizacao || "Selecione a data"}</span>
              <Calendar size={18} />
            </button>
          </>
        )}  


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
