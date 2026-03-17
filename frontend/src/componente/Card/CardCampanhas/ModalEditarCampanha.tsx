import { useState } from "react";
import { Calendar, Clock } from "lucide-react";
import { Controller, type UseFormReturn } from "react-hook-form";
import { Dropdown } from "../../Index";
import type { CampaignFormValues } from "../../../schemas/campaign.schema";
import Style from "./CardCampanhas.module.css";

type Props = {
  open: boolean;
  onClose: () => void;
  form: UseFormReturn<CampaignFormValues>;
  onOpenCalendarDisparo: () => void;
  onOpenCalendarFinalizacao: () => void;
  onOpenTimePicker: () => void;
};

type RecurrenceOption = {
  id: string;
  name: string;
};

const RECURRENCE_OPTIONS: RecurrenceOption[] = [
  { id: "false", name: "Disparo Unico" },
  { id: "true", name: "Disparo Continuo" },
];

export function ModalEditarCampanha({
  open,
  onClose,
  form,
  onOpenCalendarDisparo,
  onOpenCalendarFinalizacao,
  onOpenTimePicker,
}: Props) {
  const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);

  if (!open) return null;

  const {
    control,
    watch,
    handleSubmit,
    formState: { errors },
  } = form;
  const isRecurring = watch("isRecurring");

  return (
    <div className={Style.modalOverlay}>
      <div className={Style.modal}>
        <h3>Editar dados da campanha</h3>

        <label>Tipo</label>
        <Controller
          control={control}
          name="isRecurring"
          render={({ field }) => (
            <Dropdown<RecurrenceOption>
              className={Style.modalDropdown}
              label="Tipo"
              options={RECURRENCE_OPTIONS}
              value={
                RECURRENCE_OPTIONS.find(
                  (option) => option.id === String(Boolean(field.value)),
                ) ?? RECURRENCE_OPTIONS[0]
              }
              placeholder="Selecione"
              open={isTypeDropdownOpen}
              onOpen={() => setIsTypeDropdownOpen(true)}
              onClose={() => setIsTypeDropdownOpen(false)}
              onChange={(value) =>
                field.onChange((value as RecurrenceOption).id === "true")
              }
            />
          )}
        />

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

        {isRecurring && (
          <>
            <label>Data de Finalizacao</label>
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

        <label>Horario</label>
        <button
          type="button"
          className={Style.dateInputButton}
          onClick={onOpenTimePicker}
        >
          <span>{watch("dispatchTime") || "Selecione o horario"}</span>
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
