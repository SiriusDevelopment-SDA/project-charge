import { Calendar, Clock } from "lucide-react";
import Style from "./CardCampanhas.module.css";
import { Controller, type UseFormReturn } from "react-hook-form";
import type { CampaignFormValues } from "../../../schemas/campaign.schema";
type Props = {
  open: boolean;
  onClose: () => void;
  form: UseFormReturn<CampaignFormValues>;
  onOpenCalendarDisparo: () => void;
  onOpenCalendarFinalizacao: () => void;
  onOpenTimePicker: () => void;
};

export function ModalEditarCampanha({
  open,
  onClose,
  form,
  onOpenCalendarDisparo,
  onOpenCalendarFinalizacao,
  onOpenTimePicker,
}: Props) {
  if (!open) return null;

  const { control, watch, handleSubmit, formState: { errors } } = form;
  const isRecurring = watch("isRecurring");

  return (
    <div className={Style.modalOverlay}>
      <div className={Style.modal}>
        <h3>Editar dados da campanha</h3>

        {/* Tipo */}
        <label>Tipo</label>
        <Controller
          control={control}
          name="isRecurring"
          render={({ field }) => (
            <select
              className={Style.dateInputButton}
              value={field.value ? "true" : "false"}
              onChange={(e) => field.onChange(e.target.value === "true")}
            >
              <option value="false">Disparo Único</option>
              <option value="true">Disparo Contínuo</option>
            </select>
          )}
        />

        {/* Data de disparo */}
        <label>Data de Disparo</label>
        <button
          type="button"
          className={Style.dateInputButton}
          onClick={onOpenCalendarDisparo}
        >
          <span>{watch("dispatchDate") || "Selecione a data"}</span>
          <Calendar size={18} />
        </button>
        {errors.dispatchDate && (
          <span className={Style.fieldError}>{errors.dispatchDate.message}</span>
        )}

        {/* Data de finalização — só exibida em modo recorrente */}
        {isRecurring && (
          <>
            <label>Data de Finalização</label>
            <button
              type="button"
              className={Style.dateInputButton}
              onClick={onOpenCalendarFinalizacao}
            >
              <span>{watch("endDate") || "Selecione a data"}</span>
              <Calendar size={18} />
            </button>
            {errors.endDate && (
              <span className={Style.fieldError}>{errors.endDate.message}</span>
            )}
          </>
        )}

        {/* Horário */}
        <label>Horário</label>
        <button
          type="button"
          className={Style.dateInputButton}
          onClick={onOpenTimePicker}
        >
          <span>{watch("dispatchTime") || "Selecione o horário"}</span>
          <Clock size={18} />
        </button>
        {errors.dispatchTime && (
          <span className={Style.fieldError}>{errors.dispatchTime.message}</span>
        )}

        <div className={Style.modalActions}>
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" onClick={handleSubmit(() => onClose())}>
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}