import { useState } from "react";

type Params = {
  value: string | number | readonly string[] | undefined;
  onlyNumbers: boolean;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
};

export function useInputFieldController({ value, onlyNumbers, onChange }: Params) {
  const [focused, setFocused] = useState(false);

  const hasValue = value !== undefined && value !== "";

  const handleFocus = () => setFocused(true);
  const handleBlur = () => setFocused(false);

  const handleChange: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    if (!onlyNumbers) {
      onChange?.(event);
      return;
    }

    const sanitizedValue = event.target.value.replace(/\D/g, "");
    const syntheticEvent = {
      ...event,
      target: {
        ...event.target,
        value: sanitizedValue,
      },
    } as React.ChangeEvent<HTMLInputElement>;

    onChange?.(syntheticEvent);
  };

  return {
    focused,
    hasValue,
    handleFocus,
    handleBlur,
    handleChange,
  };
}
