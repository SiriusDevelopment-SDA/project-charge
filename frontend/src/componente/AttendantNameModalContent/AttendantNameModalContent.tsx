import { InputFields } from "../InputFild/InputFild";
import { MyButton } from "../global/MyButton/MyButton";
import Style from "./AttendantNameModalContent.module.css";

type AttendantNameModalContentProps = {
  value: string;
  disabled?: boolean;
  description?: React.ReactNode;
  label?: string;
  confirmLabel?: string;
  onChange: (value: string) => void;
  onConfirm: () => void;
};

export function AttendantNameModalContent({
  value,
  disabled = false,
  description,
  label = "Nome do atendente",
  confirmLabel = "Confirmar dados do atendente",
  onChange,
  onConfirm,
}: AttendantNameModalContentProps) {
  return (
    <div className={Style.content}>
      <p className={Style.description}>
        {description ?? (
          <>
            Este template exige a variavel <strong>nome_atendente</strong>.
          </>
        )}
      </p>
      <InputFields
        label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <MyButton
        text={confirmLabel}
        variant="btn-enviar"
        disabled={disabled}
        onClick={onConfirm}
      />
    </div>
  );
}
