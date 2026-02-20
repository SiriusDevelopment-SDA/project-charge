import { useState } from "react";
import S from "./StyleInput.module.css";

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
        className={`${S.floatingInput} ${className ?? ""}`}
        onChange={e => {
          if (onlyNumbers) {
            const newValue = e.target.value.replace(/\D/g, "");
            if (onChange) {
              const event = {
                ...e,
                target: {
                  ...e.target,
                  value: newValue
                }
              };
              onChange(event as React.ChangeEvent<HTMLInputElement>);
            }
          } else {
            onChange && onChange(e);
          }
        }}
      />
    </div>
  );
}
