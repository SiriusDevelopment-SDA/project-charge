import S from "./StyleInput.module.css";
import { useInputFieldController } from "../../hooks/components/useInputFieldController";

type Props = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  onlyNumbers?: boolean;
};

export function InputFields({
  label,
  value,
  className,
  onlyNumbers = false,
  onChange,
  ...props
}: Props) {
  const { focused, hasValue, handleFocus, handleBlur, handleChange } =
    useInputFieldController({ value, onlyNumbers, onChange });

  return (
    <div className={S.floatingWrapper}>
      {label && (
        <label className={`${S.floatingLabel} ${focused || hasValue ? S.active : ""}`}>
          {label}
        </label>
      )}

      <input
        {...props}
        value={value}
        onFocus={handleFocus}
        onBlur={handleBlur}
        className={`${S.floatingInput} ${className ?? ""}`}
        onChange={handleChange}
      />
    </div>
  );
}
