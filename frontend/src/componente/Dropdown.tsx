"use client";

import { useState, useEffect, useRef } from "react";
import "../styles/DropdownTemplate.css";
import type { propTemplate, Template } from "../types";
import FilterButton from "./ButtonNavigation";

type Props = {
  onSelectTemplate: (template: Template | null) => void;
};

const capitalize = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);

const templatesMock: Template[] = [
  { id: 1, nome: "Aviso de Novidade", conteudo: "Olá {{nome}}, temos novidades exclusivas para você!", categoria: "Marketing" },
  { id: 2, nome: "Pendência de Cadastro", conteudo: "Olá {{nome}}, identificamos pendências em seu cadastro.", categoria: "Cadastro" },
  { id: 3, nome: "Aviso de Fatura", conteudo: "Olá {{nome}}, sua fatura {{fatura}} vence em {{data}} no valor de R$ {{valor}}.", categoria: "Financeiro" },
  { id: 4, nome: "Contato Geral", conteudo: "Olá {{nome}}, estamos entrando em contato.", categoria: "Geral" },
];

export default function DropdownPersonalized({
  setOpenState,
  open,
  FilterButtonProp,
  onSelectTemplate,
}: propTemplate & Props) {
  
  const [value, setValue] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;

      // 1. Verifica se o clique foi dentro do container principal
      const isInsideDropdown = dropdownRef.current?.contains(target);

      // 2. PROTEÇÃO ESPECIAL PARA O SELECT:
      // Verificamos se o clique foi em um <select> ou <option>
      // Isso é necessário porque o dropdown nativo do navegador muitas vezes 
      // dispara eventos que o React interpreta como sendo "fora" do DOM.
      const isSelectClick = target.tagName === "SELECT" || target.tagName === "OPTION";

      // 3. Verifica se o clique foi em qualquer parte do filtro (mesmo que flutuante)
      const isInsideFilter = target.closest(".filter-container") || 
                             target.closest(".dropdown-categoria") || 
                             target.closest(".filter-button");

      // SÓ fecha se NÃO for dentro do dropdown, NÃO for um select e NÃO for no filtro
      if (!isInsideDropdown && !isSelectClick && !isInsideFilter) {
        setOpenState(false);
      }
    };

    if (open) {
      // Usamos capture: true para garantir a detecção correta
      document.addEventListener("mousedown", handleClickOutside, true);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside, true);
    };
  }, [open, setOpenState]);

  const filteredTemplates = templatesMock.filter((template) => {
    const matchNome = template.nome.toLowerCase().includes(searchTerm.toLowerCase());
    const matchCategoria = categoryFilter === "" || template.categoria === categoryFilter;
    return matchNome && matchCategoria;
  });

  return (
  <div className="custom-dropdown-wrapper" ref={dropdownRef}>
    <label
      className={`custom-dropdown-label ${
        open || value !== "" ? "custom-dropdown-label--shrink" : ""
      }`}
    >
      Template
    </label>

    {/* === BLOCO PRINCIPAL DO DROPDOWN === */}
    {!open ? (
      <div 
        className="custom-dropdown-control"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpenState(true);
        }}
      >
        <span
          className={`custom-dropdown-value ${
            value === "" ? "custom-dropdown-value--placeholder" : ""
          }`}
        >
          {value === "" ? "" : capitalize(value)}
        </span>
        <span className={`arrow`} />
      </div>
    ) : (
      <div className="dropdown-input-bar" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          type="text"
          placeholder="Buscar template..."
          className="search-input"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />

        {FilterButtonProp && (
          <div className="filter-wrapper-internal">
            <FilterButton
              templates={templatesMock}
              selectedCategory={categoryFilter}
              onCategoryChange={(cat) => setCategoryFilter(cat)}
            />
          </div>
        )}
      </div>
    )}

    {/* === LISTA QUANDO ABERTO === */}
    {open && (
      <div className="custom-template-menu" onClick={(e) => e.stopPropagation()}>
        <div className="custom-dropdown-menu">
          {filteredTemplates.length > 0 ? (
            filteredTemplates.map((template) => (
              <div
                key={template.id}
                className={`custom-template-item ${
                  value === template.nome ? "custom-template-item--selected" : ""
                }`}
                onClick={() => {
                  setValue(template.nome);
                  onSelectTemplate(template);
                  setSearchTerm("");
                  setOpenState(false);
                }}
              >
                {template.nome}
              </div>
            ))
          ) : (
            <div className="no-results">Nenhum template encontrado</div>
          )}
        </div>
      </div>
    )}
  </div>
);

}
