// src/components/ClienteSelect.tsx
import React, { useState, type ReactNode } from 'react';
import { Autocomplete, Checkbox, Chip, TextField } from '@mui/material';
// src/componentes/ClienteSelect.tsx
import '../styles/filtrocliente.css';  // Importando o CSS do FiltroCliente

type propsSelect = {
  children: ReactNode | string;
  className?: string;
};

const ClienteSelect = ({ children, className }: propsSelect) => {
  const [selectedClientes, setSelectedClientes] = useState<string[]>([]);

  const clientes = [
    'João Vitor', 'Lucas Santos', 'Maria Silva', 'Carlos Souza', 'Ana Pereira',
    'Pedro Oliveira', 'Mariana Costa', 'Rafael Almeida', 'Beatriz Fernandes', 'Gustavo Ribeiro',
    'Juliana Gomes', 'Felipe Martins', 'Camila Araújo', 'Bruno Dias', 'Larissa Nunes',
    'Thiago Carvalho', 'Amanda Lopes', 'Diego Mendes', 'Sofia Rocha', 'Vinícius Cunha', 'Isabela Moreira'
  ];

  const handleChange = (event: any, newValue: string[]) => {
    setSelectedClientes(newValue);
  };

  return (
    <div>
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
          <TextField {...params} label={children} className={className} placeholder="Selecione os clientes" />
        )}
        renderTags={(value, getTagProps) =>
          value.map((option: string, index: number) => (
            <Chip label={option} {...getTagProps({ index })} key={index} style={{ margin: 2 }} />
          ))
        }
        
      />
    </div>
  );
};

export default ClienteSelect;
