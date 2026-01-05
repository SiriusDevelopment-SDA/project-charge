// src/components/ClienteSelect.tsx
"use client";

import React, { useState, type ReactNode } from "react";
import { Autocomplete, Checkbox, Chip, TextField } from "@mui/material";
import "../styles/filtrocliente.css";

/* ✅ PROPS CORRETAS */
type PropsSelect = {
  children: ReactNode | string;
  className?: string;
  onChangeClientes: (nomes: string[]) => void; 
};

const ClienteSelect = ({
  children,
  className,
  onChangeClientes,
  
  
}: PropsSelect) => {
  const [selectedClientes, setSelectedClientes] = useState<string[]>([]);

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

  /* 🔥 AQUI ESTAVA O PROBLEMA */
  const handleChange = (_event: any, newValue: string[]) => {
    setSelectedClientes(newValue);
    onChangeClientes(newValue); // 👈 AVISA O PAI
  };

  return (
    <div className="dropdown-controlT dropdown-control2">
      <Autocomplete
        multiple
        id="cliente-select"
        options={clientes}
        value={selectedClientes}
        onChange={handleChange}
        disableCloseOnSelect
        getOptionLabel={(option) => option}
        renderOption={(props, option, { selected }) => (
          <li {...props}>
            <Checkbox checked={selected} />
            {option}
          </li>
        )}
        renderInput={(params) => (
          <TextField
            {...params}
            label={children}
            className={className}
            placeholder="Selecione os clientes"
          />
        )}
        renderTags={(value, getTagProps) =>
          value.map((option: string, index: number) => (
            <Chip
              label={option}
              {...getTagProps({ index })}
              key={option}
            />
          ))
        }
      />
    </div>
  );
};

export default ClienteSelect;
