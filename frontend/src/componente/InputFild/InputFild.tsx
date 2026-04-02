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
  const resolvedPlaceholder =
    label && !(focused || hasValue) ? "" : props.placeholder;

  return (
    <div className={`${S.floatingWrapper} ${label ? S.withLabel : ""}`}>
      {label && (
        <label className={`${S.floatingLabel} ${focused || hasValue ? S.active : ""}`}>
          {label}
        </label>
      )}

      <input
        {...props}
        value={value}
        placeholder={resolvedPlaceholder}
        onFocus={handleFocus}
        onBlur={handleBlur}
        className={`${S.floatingInput} ${className ?? ""}`}
        onChange={handleChange}
      />
    </div>
  );
}
