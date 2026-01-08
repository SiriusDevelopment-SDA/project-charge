"use client";

import { useRef, useState } from "react";
import { OverlayPanel } from "primereact/overlaypanel";
import { Dropdown } from "primereact/dropdown";
import { Button } from "primereact/button";

type FilterButtonProps = {
  onSelect: (valor: "com" | "sem") => void;
};

export default function FilterButton({ onSelect }: FilterButtonProps) {
  const op = useRef<OverlayPanel>(null);
  const [operator, setOperator] = useState<"com" | "sem">("com");

  const operators = [
    { label: "Clientes com Cadastro", value: "com" },
    { label: "Clientes sem Cadastro", value: "sem" },
  ];

  const handleChange = (e: any) => {
    const value = e.value as "com" | "sem";
    setOperator(value);
    onSelect(value);     // 🔹 dispara mudança de página/estado
    op.current?.hide();  // 🔹 fecha popup
  };

  return (
    <div>
      <Button
        icon="pi pi-filter"
        text
        onClick={(e) => op.current?.toggle(e)}
        className="p-button-rounded p-button-secondary"
      />

      <OverlayPanel ref={op} className="p-3" style={{ width: "350px" }}>
        <div className="mb-3">
          <Dropdown
            value={operator}
            options={operators}
            onChange={handleChange}
            className="w-full"
          />
        </div>
      </OverlayPanel>
    </div>
  );
}
