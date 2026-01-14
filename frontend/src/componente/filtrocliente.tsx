"use client";

import React, { useState, type Dispatch, type ReactNode } from "react";
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
  disabled?: boolean;
  value?: string[];
  onChangeClientes: (cpfs: string[]) => void; // agora trabalha com CPF
  setSelected?: (cpfs: string[]) => void;
  selected?: string[];
  setOpen?: Dispatch<React.SetStateAction<boolean>>;
  open?: boolean;
  clientes?: Cliente[];

};

/* ======================================================
   MOCK DE CLIENTES
   (depois você troca pelos dados do ERP)
====================================================== */
export const clientesMock: Cliente[] = [


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
   TOAST
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
  disabled = false,
  onChangeClientes,
  setSelected,
  selected = [],
  setOpen,
  open,
}: PropsSelect) {
  const [search, setSearch] = useState("");

  /* Selecionar / desmarcar cliente (usa CPF como chave) */
  const toggleCliente = (cliente: Cliente) => {
    const cpfLimpo = cliente.cpf.replace(/\D/g, "");

    const jaSelecionado = selected.includes(cpfLimpo);

    const updated = jaSelecionado
      ? selected.filter((c) => c !== cpfLimpo)
      : [...selected, cpfLimpo];

    setSelected?.(updated);
    onChangeClientes(updated); // 1º lugar: quando clica no item da lista

    if (!jaSelecionado) {
      showClienteToast(cliente);
    }
  };

  const clearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelected?.([]);
    onChangeClientes([]); // limpa tudo
    setSearch("");
  };

  

  const filtered = clientesMock.filter((c) =>
    c.nome.toLowerCase().includes(search.toLowerCase())
  );

  // helper para achar nome pelo CPF
  const getNomeByCpf = (cpf: string) => {
    const cliente = clientesMock.find(
      (c) => c.cpf.replace(/\D/g, "") === cpf.replace(/\D/g, "")
    );
    return cliente?.nome ?? cpf;
  };

  return (
    <div
      className={`cliente-select ${className || ""} ${
        disabled ? "cliente-disabled" : ""
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      <label className="cliente-label">{children}</label>

      <div
        className={`cliente-input ${open ? "active" : ""} ${
          disabled ? "cliente-disabled" : ""
        }`}
        onClick={() => !disabled && setOpen?.((prev) => !prev)}
      >
        <div className="cliente-chips">
          {/* Resumo quando fechado */}
          {!open && selected.length > 0 && (
            <span className="summary">
              {selected.length === 1
                ? getNomeByCpf(selected[0])
                : `${getNomeByCpf(selected[0])} + ${
                    selected.length - 1
                  } clientes`}
            </span>
          )}

          {/* Placeholder quando nada selecionado */}
          {!open && selected.length === 0 && (
            <span className="placeholder">Selecione os clientes</span>
          )}

          {/* Chips quando aberto */}
          {open &&
            selected.map((cpf) => {
              const nomeExibicao = getNomeByCpf(cpf);

              return (
                <span key={cpf} className="chip">
                  {nomeExibicao}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const updated = selected.filter((c) => c !== cpf);
                      setSelected?.(updated);
                      onChangeClientes(updated); // 2º lugar: quando clica no "x" do chip
                    }}
                  >
                    ×
                  </button>
                </span>
              );
            })}
        </div>

        <div className="actions">
          {selected.length > 0 && (
            <button className="clear-all" onClick={(e) => clearAll(e)}>
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
            {filtered.map((cliente) => {
              const cpfLimpo = cliente.cpf.replace(/\D/g, "");
              return (
                <li
                  key={cpfLimpo}
                  onClick={() => !disabled && toggleCliente(cliente)}
                  className={disabled ? "disabled-item" : ""}
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(cpfLimpo)}
                    readOnly
                  />
                  <span>{cliente.nome}</span>
                </li>
              );
            })}

            {filtered.length === 0 && (
              <li className="empty">Nenhum cliente encontrado</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
