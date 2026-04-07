import { useState } from "react";
import { Calendar, Clock } from "lucide-react";
import { Controller, useWatch, type UseFormReturn } from "react-hook-form";
import { Dropdown } from "../../Index";
import type { CampaignFormValues } from "../../../schemas/campaign.schema";
import Style from "./CardCampanhas.module.css";

type Props = {
  open: boolean;
  onClose: () => void;
  onSave: () => Promise<{ success: boolean }>;
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
  { id: "false", name: "Disparo único" },
  { id: "true", name: "Disparo contínuo" },
];

export function ModalEditarCampanha({
  open,
  onClose,
  onSave,
  form,
  onOpenCalendarDisparo,
  onOpenCalendarFinalizacao,
  onOpenTimePicker,
}: Props) {
  const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);

  const isRecurring = useWatch({ control: form.control, name: "isRecurring" });
  const dispatchDate = useWatch({ control: form.control, name: "dispatchDate" });
  const endDate = useWatch({ control: form.control, name: "endDate" });
  const dispatchTime = useWatch({ control: form.control, name: "dispatchTime" });

  if (!open) return null;

  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = form;

  return (
    <div className={Style.modalOverlay}>
      <div className={Style.modal}>
        <h3>Editar dados da campanha</h3>

        <input type="hidden" {...register("dispatchDate")} />
        <input type="hidden" {...register("endDate")} />
        <input type="hidden" {...register("dispatchTime")} />

        <label>Tipo de disparo</label>
        <Controller
          control={control}
          name="isRecurring"
          render={({ field }) => (
            <Dropdown<RecurrenceOption>
              className={Style.modalDropdown}
              label="Tipo de disparo"
              options={RECURRENCE_OPTIONS}
              showFloatingLabel={false}
              searchable={false}
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

        <label>Data de disparo</label>
        <button
          type="button"
          className={Style.dateInputButton}
          onClick={onOpenCalendarDisparo}
        >
          <span>{dispatchDate || "Selecione a data"}</span>
          <Calendar size={18} />
        </button>
        {errors.dispatchDate && (
          <span className={Style.fieldError}>{errors.dispatchDate.message}</span>
        )}

        {isRecurring && (
          <>
            <label>Data de finalização</label>
            <button
              type="button"
              className={Style.dateInputButton}
              onClick={onOpenCalendarFinalizacao}
            >
              <span>{endDate || "Selecione a data"}</span>
              <Calendar size={18} />
            </button>
            {errors.endDate && (
              <span className={Style.fieldError}>{errors.endDate.message}</span>
            )}
          </>
        )}

        <label>Horário</label>
        <button
          type="button"
          className={Style.dateInputButton}
          onClick={onOpenTimePicker}
        >
          <span>{dispatchTime || "Selecione o horário"}</span>
          <Clock size={18} />
        </button>
        {errors.dispatchTime && (
          <span className={Style.fieldError}>{errors.dispatchTime.message}</span>
        )}

        <div className={Style.modalActions}>
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit(async () => {
              await onSave();
            })}
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
