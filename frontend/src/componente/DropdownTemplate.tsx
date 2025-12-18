"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import Select from "@mui/material/Select";
import type { SelectChangeEvent } from "@mui/material/Select";

import "../styles/DropdownTemplate.css";

/* 🔹 TIPO */
type Template = {
  id: number;
  nome: string;
  conteudo: string;
};

/* 🔹 MOCK (pode trocar por API depois) */
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

/* 🔹 PROPS */
type Props = {
  onSelectTemplate: (template: Template | null) => void;
};

export default function DropdownTemplate({ onSelectTemplate }: Props) {
  const [value, setValue] = React.useState<number | "">("");

  const handleChange = (event: SelectChangeEvent<number | "">) => {
    const id = Number(event.target.value);
    setValue(id);

    const templateSelecionado =
      templatesMock.find((t) => t.id === id) || null;

    onSelectTemplate(templateSelecionado); // 🔥 AVISA O PAI
  };

  return (
    <Box className="dropdown-wrapper2">
      <FormControl
        fullWidth
        variant="outlined"
        className="dropdown-control2"
      >
        <InputLabel className="dropdown-label2" shrink>
          Template
        </InputLabel>

        <Select
          value={value}
          label="Template"
          onChange={handleChange}
          className="dropdown-select2"
          MenuProps={{
            PaperProps: {
              className: "dropdown-menu2",
            },
          }}
        >
          <MenuItem value="">
            <em>Selecionar Template</em>
          </MenuItem>

          {templatesMock.map((template) => (
            <MenuItem key={template.id} value={template.id}>
              {template.nome}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    </Box>
  );
}
