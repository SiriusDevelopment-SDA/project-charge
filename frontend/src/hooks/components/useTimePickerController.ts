import { useMemo, useState } from "react";

type Params = {
  selected?: string;
  onSelect?: (time: string) => void;
};

export function useTimePickerController({ selected, onSelect }: Params) {
  const initialHour = selected ? selected.split(":")[0] : "09";
  const initialMinute = selected ? selected.split(":")[1] : "00";

  const [hour, setHour] = useState(initialHour);
  const [minute, setMinute] = useState(initialMinute);

  const hours = useMemo(
    () => Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, "0")),
    []
  );
  const minutes = useMemo(
    () => Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, "0")),
    []
  );

  const handleHourChange = (newHour: string) => {
    setHour(newHour);
    onSelect?.(`${newHour}:${minute}`);
  };

  const handleMinuteChange = (newMinute: string) => {
    setMinute(newMinute);
    onSelect?.(`${hour}:${newMinute}`);
  };

  return {
    hour,
    minute,
    hours,
    minutes,
    handleHourChange,
    handleMinuteChange,
  };
}
