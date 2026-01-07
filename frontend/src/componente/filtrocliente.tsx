"use client";

import React, { useEffect, useRef, useState, type ReactNode } from "react";
import "../styles/filtrocliente.css";

type PropsSelect = {
  children: ReactNode | string;
  className?: string;
  onChangeClientes: (nomes: string[]) => void;
};

export default function ClienteSelect({
  children,
  className,
  onChangeClientes,
}: PropsSelect) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const clientes = [
    "João Vitor",
    "Lucas Santos",
    "Maria Silva",
    "Carlos Souza",
    "Ana Pereira",
    "Pedro Oliveira",
    "Mariana Costa",
    "Rafael Almeida",
    "Beatriz Fernandes",
    "Gustavo Ribeiro",
    "Juliana Gomes",
    "Felipe Martins",
    "Camila Araújo",
    "Bruno Dias",
    "Larissa Nunes",
    "Thiago Carvalho",
    "Amanda Lopes",
    "Diego Mendes",
    "Sofia Rocha",
    "Vinícius Cunha",
    "Isabela Moreira",
  ];

  /* Fecha ao clicar fora */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggleCliente = (nome: string) => {
    const updated = selected.includes(nome)
      ? selected.filter((c) => c !== nome)
      : [...selected, nome];

    setSelected(updated);
    onChangeClientes(updated);
  };

  const clearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelected([]);
    onChangeClientes([]);
  };

  const filtered = clientes.filter((c) =>
    c.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div
      ref={containerRef}
      className={`cliente-select ${className || ""}`}
    >
      {/* LABEL */}
      <label className="cliente-label">{children}</label>

      {/* INPUT */}
      <div
        className={`cliente-input ${open ? "active" : ""}`}
        onClick={() => setOpen(!open)}
      >
        <div className="cliente-chips">
          {selected.length === 0 && (
            <span className="placeholder">Selecione os clientes</span>
          )}

          {selected.map((nome) => (
            <span key={nome} className="chip">
              {nome}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleCliente(nome);
                }}
              >
                ×
              </button>
            </span>
          ))}
        </div>

        <div className="actions">
          {selected.length > 0 && (
            <button
              className="clear-all"
              onClick={clearAll}
              aria-label="Limpar seleção"
            >
              ×
            </button>
          )}

          {/* SETA CUSTOM */}
          <span className={`arrow ${open ? "open" : ""}`} />
        </div>
      </div>

      {/* DROPDOWN */}
      {open && (
        <div className="cliente-dropdown">
          <input
            className="cliente-search"
            placeholder="Buscar cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <ul>
            {filtered.map((nome) => (
              <li key={nome} onClick={() => toggleCliente(nome)}>
                <input
                  type="checkbox"
                  checked={selected.includes(nome)}
                  readOnly
                />
                <span>{nome}</span>
              </li>
            ))}

            {filtered.length === 0 && (
              <li className="empty">Nenhum cliente encontrado</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
