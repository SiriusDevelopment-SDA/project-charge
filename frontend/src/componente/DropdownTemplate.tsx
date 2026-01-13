"use client";

import { useEffect, useRef, useState } from "react";
import "../styles/DropdownTemplate.css";
import { OverlayPanel } from "primereact/overlaypanel";
import { Button } from "primereact/button";

/* ===============================
   TYPES
================================ */
type Template = {
  id: number;
  nome: string;
  conteudo: string;
  categoria: string;
};

type Props = {
  onSelectTemplate: (template: Template | null) => void;
  open: boolean
  setOpen: (value: boolean | ((prev: boolean) => boolean)) => void
};

/* ===============================
   MOCK
================================ */
const templatesMock: Template[] = [
  {
    id: 1,
    nome: "Marketing",
    conteudo: "Olá {{nome}}, temos novidades exclusivas para você!",
    categoria: "Promoção",
  },
  {
    id: 2,
    nome: "Aviso",
    conteudo: "Olá {{nome}}, identificamos pendências em seu cadastro.",
    categoria: "Notificação",
  },
  {
    id: 3,
    nome: "Cobrança",
    conteudo:
      "Olá {{nome}}, sua fatura {{fatura}} vence em {{data}} no valor de R$ {{valor}}.",
    categoria: "Financeiro",
  },
  {
    id: 4,
    nome: "Outros",
    conteudo: "Olá {{nome}}, estamos entrando em contato.",
    categoria: "Geral",
  },
];

/* ===============================
   COMPONENT
================================ */
export default function DropdownTemplate({onSelectTemplate, open, setOpen}: Props) {
  const [value, setValue] = useState<number | "">("");
  

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const op = useRef<OverlayPanel>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);

  // Filtrando templates com base no termo de busca e na categoria selecionada
  const filteredTemplates = templatesMock.filter((template) => {
    const matchesSearch = template.nome
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory
      ? template.categoria === selectedCategory
      : true;
    return matchesSearch && matchesCategory;
  });

  const handleSelect = (id: number | "") => {
    console.log("Selecionado ID:", id);
    setValue(id);
    setOpen(false);

    if (id === "") {
      onSelectTemplate(null);
      return;
    }

    const template = templatesMock.find((t) => t.id === id) || null;
    onSelectTemplate(template);
  };

  const selectedTemplate =
    value === "" ? null : templatesMock.find((t) => t.id === value);

  // Fechar o menu principal de templates se o clique for fora do componente
  // Fechar o OverlayPanel somente quando o clique for fora dele


  // Garantir que o OverlayPanel feche quando o select perder o foco
  const handleBlur = () => {
    if (op.current) {
      op.current.hide(); // Fechar o OverlayPanel
    }
  };

  return (
    <div ref={wrapperRef} className="custom-template-wrapper" >
      {/* LABEL */}
      <label
        className={`custom-template-label ${open || value !== "" ? "custom-template-label--shrink" : ""}`}
      >
        Template
      </label>

      {/* CONTROL */}
      <div
        className="custom-template-control"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span
          className={`custom-template-value ${value === "" ? "custom-template-value--placeholder" : ""}`}
        >
          {selectedTemplate?.nome ?? ""}
        </span>

        <span className={`arrow ${open ? "open" : ""}`} />
      </div>

      {/* MENU */}
      {open && (
        <div className="custom-template-menu">
          {/* Campo de busca */}
          <input
            type="text"
            placeholder="Buscar template..."
            className="search-input"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />

          {/* Botão de filtro */}
          <Button
            icon="pi pi-filter"
            text
            onClick={(e) => op.current?.toggle(e)} // Alterna a visibilidade do filtro de categorias
            className="p-button-rounded p-button-secondary"
          />

          {/* OverlayPanel de Categorias */}
          <OverlayPanel ref={op} className="p-3" style={{ width: "300px" }}>
            <div className="category-filter">
              <label>Filtrar por categoria:</label>
              <select
                ref={selectRef} // Atribuindo a ref ao select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                onBlur={handleBlur} // Fechar o OverlayPanel quando o select perder o foco
                className="category-select"
              >
                <option value="">Todas</option>
                {Array.from(
                  new Set(templatesMock.map((template) => template.nome))
                ).map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>
          </OverlayPanel>

          {/* Lista de templates filtrados */}
          <div
            className="custom-template-item custom-template-item--italic"
            onClick={() => handleSelect("")}
          >
            Nenhum template
          </div>

          {filteredTemplates.map((template) => (
            <div
              key={template.id}
              className={`custom-template-item ${value === template.id ? "custom-template-item--selected" : ""}`}
              onClick={() => handleSelect(template.id)}
            >
              {template.nome}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
