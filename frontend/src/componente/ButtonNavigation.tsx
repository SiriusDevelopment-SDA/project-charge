"use client";

import { useRef } from "react";
import { OverlayPanel } from "primereact/overlaypanel";
import { Button } from "primereact/button";
import type { Template } from "../types";

import styles from "../styles/ButtonFIlter.module.css";

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
    <div className={styles.wrapper}>
      <Button
        icon="pi pi-filter"
        text
        onClick={(e) => op.current?.toggle(e)}
        className={`p-button-rounded p-button-secondary ${styles.filterBtn}`}
        aria-label="Filtrar por categoria"
      />

      <OverlayPanel
        ref={op}
        className={styles.overlay}
        dismissable
      >
        <div className={styles.content}>
          <label className={styles.label}>Categoria</label>

          <select
            value={selectedCategory}
            onChange={(e) => {
              onCategoryChange(e.target.value);
              op.current?.hide();
            }}
            className={styles.select}
          >
            <option value="">Todas</option>
            {categorias.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
      </OverlayPanel>
    </div>
  );
}
