import { useState } from "react";
import S from "./StyleInput.module.css";

type Props = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
};

export function InputFields({
  label,
  value,
  className, // 👈 capturamos className
  ...props
}: Props) {
  const [focused, setFocused] = useState(false);

  const hasValue = value !== undefined && value !== "";

  return (
    <div className={S.floatingWrapper}>
      {label && (
        <label
          className={`${S.floatingLabel} ${
            focused || hasValue ? S.active : ""
          }`}
        >
          {label}
        </label>
      )}

      <input
        {...props}
        value={value}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className={`${S.floatingInput} ${className ?? ""}`} // 👈 junção aqui
      />
    </div>
  );
}
