"use client";

import { useState } from "react";
import "../styles/DropdownTemplate.css";
import type { propTemplate } from "../src/types";
import FilterButton from "./ButtonNavigation";
import { useTemplate } from "../src/hooks";

export default function DropdownPersonalized({
  setOpenState,
  open,
  FilterButtonProp,
  templates,
  setTemplateSelecionado,
  templateSelecionado,
}: propTemplate) {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const { setQuery } = useTemplate();

  const filteredTemplates = templates?.filter((template) => {
    const nome = template.name.toLowerCase();
    const categoria = template.category?.toLowerCase() || "";

    const matchNome = nome.includes(search.toLowerCase());
    const matchCategoria = selectedCategory
      ? categoria.includes(selectedCategory.toLowerCase())
      : true;

    return matchNome && matchCategoria;
  });

  const hasSelected = !!templateSelecionado;

  return (
    <div className="custom-dropdown-wrapper">
      {/* LABEL */}
      <label
        className={`custom-dropdown-label ${open || hasSelected ? "custom-dropdown-label--shrink" : ""
          }`}
      >
        Template
      </label>

      {/* CONTROL */}
      <div
        className="custom-dropdown-control"
        onClick={(e) => {
          e.stopPropagation();
          setOpenState((prev) => !prev);
        }}
      >
        {!open && hasSelected && (
          <span className="custom-dropdown-value custom-dropdown-value--placeholder">
            {templateSelecionado.name}
          </span>
        )}

        {!open && !hasSelected && (
          <span className="custom-dropdown-value">
            Selecione um template
          </span>
        )}

        <span className={`arrow ${open ? "open" : ""}`} />
      </div>

      {/* MENU */}
      {open && (
        <div
          className="custom-template-menu"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="dropdown-header">
            <input
              type="text"
              placeholder="Buscar template..."
              className="search-input"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setQuery(e.target.value);
              }}
            />

            {FilterButtonProp && (
              <FilterButton
                templates={templates}
                selectedCategory={selectedCategory}
                setSelectedCategory={setSelectedCategory}
              />
            )}
          </div>

          <div className="custom-dropdown-menu">
            {filteredTemplates?.length ? (
              filteredTemplates.map((template) => {
                const isSelected =
                  templateSelecionado?.id === template.id;

                return (
                  <div
                    key={template.id}
                    className={`custom-template-item ${isSelected
                      ? "custom-template-item--selected"
                      : ""
                      }`}
                    onClick={() => {
                      setTemplateSelecionado(template);
                      setOpenState(false);
                    }}
                  >
                    {template.name}
                  </div>
                );
              })
            ) : (
              <div className="no-results">
                Nenhum template encontrado
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
