import { useState } from "react";

export function useTemplateBalloonCardController() {
  const [isOpen, setIsOpen] = useState(false);

  const toggle = () => {
    setIsOpen((prev) => !prev);
  };

  return {
    isOpen,
    toggle,
  };
}
