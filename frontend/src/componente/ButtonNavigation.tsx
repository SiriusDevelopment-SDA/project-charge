"use client";
// Componente de botão de filtro de categoria usando PrimeReact
import { useRef } from "react";
import { OverlayPanel } from "primereact/overlaypanel";
import { Button } from "primereact/button";
import type { Template } from "../types";

// styles
import "../styles/ButtonFIlter.module.css";


type FilterButtonProps = {
  templates: Template[];
  selectedCategory: string;
  onCategoryChange: (categoria: string) => void;
};

export default function FilterButton({
  templates,
  selectedCategory,
  onCategoryChange,
}: FilterButtonProps) {
  const op = useRef<OverlayPanel>(null);

  const categorias = Array.from(new Set(templates.map((t) => t.categoria)));

  return (
    <div>
      <Button
        icon="pi pi-filter"
        text
        onClick={(e) => op.current?.toggle(e)}
        className="p-button-rounded p-button-secondary"
      />

      <OverlayPanel ref={op} className="p-3" style={{ width: "160px" }}>
        <label style={{ fontSize: "14px", fontWeight: "500" }}>Categoria:</label>

        <select
          value={selectedCategory}
          onChange={(e) => {
            onCategoryChange(e.target.value);
            op.current?.hide();
          }}
          className="category-select"
        >
          <option value="">Todas</option>
          {categorias.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </OverlayPanel>
    </div>
  );
}
