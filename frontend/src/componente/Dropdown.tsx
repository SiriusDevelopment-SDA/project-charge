"use client";

import { useState } from "react";
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

  const filteredTemplates = templatesMock.filter((template) => {
    const matchNome = template.nome.toLowerCase().includes(searchTerm.toLowerCase());
    const matchCategoria = categoryFilter === "" || template.categoria === categoryFilter;
    return matchNome && matchCategoria;
  });

  return (
    <div className="custom-dropdown-wrapper" onClick={(e) => e.stopPropagation()}>
      
      <label
        className={`custom-dropdown-label ${
          open || value !== "" ? "custom-dropdown-label--shrink" : ""
        }`}
      >
        Template
      </label>

      <div
        className="custom-dropdown-control"
        onClick={() => setOpenState((prev) => !prev)}
      >
        <span
          className={`custom-dropdown-value ${
            value === "" ? "custom-dropdown-value--placeholder" : ""
          }`}
        >
          {value === "" ? "" : capitalize(value)}
        </span>

        <span className={`arrow ${open ? "open" : ""}`} />
      </div>

      {open && (
        <div className="custom-template-menu" onClick={(e) => e.stopPropagation()}>

          <div className="dropdown-header">
            <input
              type="text"
              placeholder="Buscar template..."
              className="search-input"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />

            {FilterButtonProp && (
              <FilterButton
                templates={templatesMock}
                selectedCategory={categoryFilter}
                onCategoryChange={(cat) => setCategoryFilter(cat)}
              />
            )}
          </div>

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
                    onSelectTemplate(template); // CORREÇÃO: Chama a função de seleção
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