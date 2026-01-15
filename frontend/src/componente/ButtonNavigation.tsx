"use client";
// Componente de botão de filtro de categoria usando PrimeReact
import { useRef } from "react";
import { OverlayPanel } from "primereact/overlaypanel";
import { Button } from "primereact/button";
import type { FilterButtonProps } from "../types";
import "../styles/ButtonFIlter.module.css";


export default function FilterButton({
  templates,
  selectedCategory,
  setSelectedCategory
}: FilterButtonProps) {
  const op = useRef<OverlayPanel>(null);

  const categorias = Array.from(new Set(templates.map((t) => t.category)));

  return (
    <div>
      <Button
        icon="pi pi-filter"
        text
        onClick={(e) => op.current?.toggle(e)}
        className="p-button-rounded p-button-secondary"
      />

      <OverlayPanel ref={op} style={{padding: 0}}>
        <label style={{ fontSize: "14px", fontWeight: "500" }}>Categoria:</label>

        <select
          value={selectedCategory || ""}
          className="category-select"
          onChange={(e) => {
            setSelectedCategory(e.target.value);
          }}
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
