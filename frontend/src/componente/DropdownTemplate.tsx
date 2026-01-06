"use client";

import { useEffect, useRef, useState } from "react";
import "../styles/DropdownTemplate.css";

/* ===============================
   TYPES
================================ */
type Template = {
  id: number;
  nome: string;
  conteudo: string;
};

type Props = {
  onSelectTemplate: (template: Template | null) => void;
};

/* ===============================
   MOCK
================================ */
const templatesMock: Template[] = [
  {
    id: 1,
    nome: "Marketing",
    conteudo: "Olá {{nome}}, temos novidades exclusivas para você!",
  },
  {
    id: 2,
    nome: "Aviso",
    conteudo: "Olá {{nome}}, identificamos pendências em seu cadastro.",
  },
  {
    id: 3,
    nome: "Cobrança",
    conteudo:
      "Olá {{nome}}, sua fatura {{fatura}} vence em {{data}} no valor de R$ {{valor}}.",
  },
  {
    id: 4,
    nome: "Outros",
    conteudo: "Olá {{nome}}, estamos entrando em contato.",
  },
];

/* ===============================
   COMPONENT
================================ */
export default function DropdownTemplate({ onSelectTemplate }: Props) {
  const [value, setValue] = useState<number | "">("");
  const [open, setOpen] = useState(false);

  const wrapperRef = useRef<HTMLDivElement>(null);

  /* ===============================
     FECHA AO CLICAR FORA
  =============================== */
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () =>
      document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSelect(id: number | "") {
    setValue(id);
    setOpen(false);

    if (id === "") {
      onSelectTemplate(null);
      return;
    }

    const template =
      templatesMock.find((t) => t.id === id) || null;

    onSelectTemplate(template);
  }

  const selectedTemplate =
    value === ""
      ? null
      : templatesMock.find((t) => t.id === value);

  return (
    <div ref={wrapperRef} className="custom-template-wrapper">
      {/* LABEL */}
      <label
        className={`custom-template-label ${
          open || value !== ""
            ? "custom-template-label--shrink"
            : ""
        }`}
      >
        Template
      </label>

      {/* CONTROL */}
      <div
        className="custom-template-control"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span
          className={`custom-template-value ${
            value === ""
              ? "custom-template-value--placeholder"
              : ""
          }`}
        >
          {selectedTemplate?.nome ?? ""}
        </span>

        <span className={`arrow ${open ? "open" : ""}`} />
      </div>

      {/* MENU */}
      {open && (
        <div className="custom-template-menu">
          <div
            className="custom-template-item custom-template-item--italic"
            onClick={() => handleSelect("")}
          >
            Nenhum template
          </div>

          {templatesMock.map((template) => (
            <div
              key={template.id}
              className={`custom-template-item ${
                value === template.id
                  ? "custom-template-item--selected"
                  : ""
              }`}
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
