"use client";

import React, { useState } from "react";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "../styles/filtrocliente.css";
import type { Cliente, PropsSelect } from "../types";
import { useClient } from "../hooks";

/* ======================================================
   TOAST
====================================================== */
const showClienteToast = (cliente: Cliente) => {
  toast.success(
    <div>
      <strong>{cliente.name}</strong>
      <div>CPF: {cliente.cnpj_cpf}</div>
      <div>Telefone: {cliente.whatsapp}</div>
    </div>,
    { autoClose: 4000, theme: "dark" }
  );
};

/* ======================================================
   COMPONENTE
====================================================== */
export default function ClienteSelect({
  children,
  className,
  disabled = false,
  clientes,
  selected,
  setSelected,
  setOpen,
  open,
}: PropsSelect) {
  const [search, setSearch] = useState("");
  const { setQuery } = useClient();

  /* ======================================================
     SELECIONAR / REMOVER
  ====================================================== */
  const toggleCliente = (cliente: Cliente) => {
    if (disabled) return;

    const exists = selected.some((c) => c.id === cliente.id);
    const updated = exists
      ? selected.filter((c) => c.id !== cliente.id)
      : [...selected, cliente];

    setSelected(updated);
    // onChangeClientes?.(updated);
    if (!exists) showClienteToast(cliente);
  };

  /* ======================================================
     LIMPAR
  ====================================================== */
  const clearAll = () => {
    setSelected([]);
    // onChangeClientes?.([]);
    setSearch("");
    setQuery("");
  };

  /* ======================================================
     FILTRO VISUAL (BACKEND FAZ O REAL)
  ====================================================== */
  const filtered = clientes.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div
      className={`cliente-select ${className || ""} ${
        disabled ? "cliente-disabled" : ""
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      <label className="cliente-label">{children}</label>

      {/* INPUT */}
      <div
        className={`cliente-input ${open ? "active" : ""}`}
        onClick={() => !disabled && setOpen?.((o) => !o)}
      >
        <div className="cliente-chips">
          {!open && !selected.length && (
            <span className="placeholder">Selecione os clientes</span>
          )}

          {open &&
            selected.map((cliente) => (
              <span key={`chip-${cliente.id}`} className="chip">
                {cliente.name}
                <button
                  type="button"
                  onClick={(e) => {e.stopPropagation(); toggleCliente(cliente);}}
                >
                  ×
                </button>
              </span>
            ))}
        </div>

        {selected.length > 0 && (
          <button
            type="button"
            className="clear-all"
            onClick={clearAll}
          >
            ×
          </button>
        )}
      </div>

      {/* DROPDOWN */}
      {open && (
        <div className="cliente-dropdown">
          <input
            className="cliente-search"
            placeholder="Buscar cliente..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setQuery(e.target.value);
            }}
          />

          <ul>
            {filtered.map((cliente) => {
              const checked = selected.some(
                (c) => c.id === cliente.id
              );

              return (
                <li
                  key={`key-${cliente.id}`}
                  onClick={() => toggleCliente(cliente)}
                >
                  <input type="checkbox" readOnly checked={checked} />
                  <span>{cliente.name}</span>
                </li>
              );
            })}

            {!filtered.length && (
              <li className="empty">Nenhum cliente encontrado</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
