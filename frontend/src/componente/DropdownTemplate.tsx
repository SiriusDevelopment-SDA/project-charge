"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import Select from "@mui/material/Select";
import type { SelectChangeEvent } from "@mui/material/Select";
import "../styles/DropdownTemplate.css";

/* 🔹 TIPO DO TEMPLATE */
type Template = {
  id: number;
  nome: string;
  conteudo: string;
};

/* 🔹 MOCK DE TEMPLATES (depois troca por API) */
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
    <Box sx={{ minWidth: 120 }}>
      <FormControl sx={{ height: 80, width: 600, display: "flex" }}>
        <InputLabel id="template-select-label">Templates</InputLabel>
        <Select
          labelId="template-select-label"
          id="template-select"
          value={value}
          label="Templates"
          onChange={handleChange}
          size="small"
        >
          <MenuItem value="">
            <em>Selecionar template</em>
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
