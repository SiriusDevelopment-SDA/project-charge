"use client";

import React, { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "../styles/filtrocliente.css";

/* ======================================================
   TIPOS
====================================================== */
type Cliente = {
  nome: string;
  cpf: string;
  telefone: string;
};

type PropsSelect = {
  children: ReactNode | string;
  className?: string;
  onChangeClientes: (nomes: string[]) => void;
};

/* ======================================================
   MOCK DE CLIENTES
====================================================== */
const clientesMock: Cliente[] = [
  { nome: "Ana Pereira", cpf: "111.111.111-11", telefone: "(11) 90001-0001" },
  { nome: "Bruno Dias", cpf: "222.222.222-22", telefone: "(11) 90002-0002" },
  { nome: "Carlos Souza", cpf: "333.333.333-33", telefone: "(11) 90003-0003" },
  { nome: "Daniel Rocha", cpf: "444.444.444-44", telefone: "(11) 90004-0004" },
  { nome: "Eduardo Lima", cpf: "555.555.555-55", telefone: "(11) 90005-0005" },
  { nome: "Felipe Martins", cpf: "666.666.666-66", telefone: "(11) 90006-0006" },
  { nome: "Gabriel Alves", cpf: "777.777.777-77", telefone: "(11) 90007-0007" },
  { nome: "Henrique Costa", cpf: "888.888.888-88", telefone: "(11) 90008-0008" },
  { nome: "Igor Nunes", cpf: "999.999.999-99", telefone: "(11) 90009-0009" },
  { nome: "João Vitor", cpf: "123.456.789-00", telefone: "(11) 91234-5678" },
  { nome: "Kleber Teixeira", cpf: "234.567.890-01", telefone: "(11) 90010-0010" },
  { nome: "Lucas Santos", cpf: "987.654.321-00", telefone: "(21) 99876-5432" },
  { nome: "Maria Silva", cpf: "456.789.123-00", telefone: "(31) 93456-7890" },
  { nome: "Natália Ribeiro", cpf: "567.890.234-11", telefone: "(41) 90011-0011" },
  { nome: "Otávio Mendes", cpf: "678.901.345-22", telefone: "(51) 90012-0012" },
  { nome: "Paulo Henrique", cpf: "789.012.456-33", telefone: "(61) 90013-0013" },
  { nome: "Queila Fernandes", cpf: "890.123.567-44", telefone: "(71) 90014-0014" },
  { nome: "Rafael Almeida", cpf: "901.234.678-55", telefone: "(81) 90015-0015" },
  { nome: "Sofia Rocha", cpf: "012.345.789-66", telefone: "(91) 90016-0016" },
  { nome: "Thiago Carvalho", cpf: "147.258.369-77", telefone: "(11) 90017-0017" },
  { nome: "Ubirajara Lopes", cpf: "258.369.147-88", telefone: "(21) 90018-0018" },
  { nome: "Vinícius Cunha", cpf: "369.147.258-99", telefone: "(31) 90019-0019" },
  { nome: "Wesley Pacheco", cpf: "741.852.963-10", telefone: "(41) 90020-0020" },
  { nome: "Xavier Monteiro", cpf: "852.963.741-21", telefone: "(51) 90021-0021" },
  { nome: "Yasmin Azevedo", cpf: "963.741.852-32", telefone: "(61) 90022-0022" },
  { nome: "Zuleica Barros", cpf: "159.357.486-43", telefone: "(71) 90023-0023" },
];

/* ======================================================
   TOAST CUSTOMIZADO
====================================================== */
function showClienteToast(cliente: Cliente) {
  toast.success(
    <div style={{ lineHeight: 1.5 }}>
      <strong>{cliente.nome}</strong>
      <div>CPF: {cliente.cpf}</div>
      <div>Telefone: {cliente.telefone}</div>
    </div>,
    {
      position: "top-right",
      autoClose: 4000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: false,
      theme: "dark",
    }
  );
}

/* ======================================================
   COMPONENTE
====================================================== */
export default function ClienteSelect({
  children,
  className,
  onChangeClientes,
}: PropsSelect) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  /* Fecha dropdown ao clicar fora */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setSearch("");
      }
    };

    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  /* Selecionar / desmarcar cliente */
  const toggleCliente = (cliente: Cliente) => {
    const jaSelecionado = selected.includes(cliente.nome);

    const updated = jaSelecionado
      ? selected.filter((c) => c !== cliente.nome)
      : [...selected, cliente.nome];

    setSelected(updated);
    onChangeClientes(updated);

    if (!jaSelecionado) {
      showClienteToast(cliente);
    }
  };

  const clearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelected([]);
    onChangeClientes([]);
    setSearch("");
  };

  const filtered = clientesMock.filter((c) =>
    c.nome.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div ref={containerRef} className={`cliente-select ${className || ""}`}>
      <label className="cliente-label">{children}</label>

      <div
        className={`cliente-input ${open ? "active" : ""}`}
        onClick={() => setOpen(true)}
      >
        <div className="cliente-chips">

          {/* 🔹 MODO RECOLHIDO (RESUMO) */}
          {!open && selected.length > 0 && (
            <span className="summary">
              {selected.length === 1
                ? selected[0]
                : `${selected[0]} + ${selected.length - 1} clientes`}
            </span>
          )}

          {/* 🔹 PLACEHOLDER */}
          {!open && selected.length === 0 && (
            <span className="placeholder">Selecione os clientes</span>
          )}

          {selected.map((nome) => (
            <span key={nome} className="chip">
              {nome}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const updated = selected.filter((c) => c !== nome);
                  setSelected(updated);
                  onChangeClientes(updated);
                }}
              >
                ×
              </button>
            </span>
          ))}
        </div>

        <div className="actions">
          {selected.length > 0 && (
            <button className="clear-all" onClick={clearAll}>
              ×
            </button>
          )}
          <span className={`arrow ${open ? "open" : ""}`} />
        </div>
      </div>

      {open && (
        <div className="cliente-dropdown">
          <input
            className="cliente-search"
            placeholder="Buscar cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <ul>
            {filtered.map((cliente) => (
              <li
                key={cliente.nome}
                onClick={() => toggleCliente(cliente)}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(cliente.nome)}
                  readOnly
                />
                <span>{cliente.nome}</span>
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
