"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import Select from "@mui/material/Select";
import type { SelectChangeEvent } from "@mui/material/Select";

import "../styles/DropdownTemplate.css";

type Template = {
  id: number;
  nome: string;
  conteudo: string;
};

const templatesMock: Template[] = [
  { id: 1, nome: "Marketing", conteudo: "Olá {{nome}}, temos novidades exclusivas para você!" },
  { id: 2, nome: "Aviso", conteudo: "Olá {{nome}}, identificamos pendências em seu cadastro." },
  {
    id: 3,
    nome: "Cobrança",
    conteudo: "Olá {{nome}}, sua fatura {{fatura}} vence em {{data}} no valor de R$ {{valor}}.",
  },
  { id: 4, nome: "Outros", conteudo: "Olá {{nome}}, estamos entrando em contato." },
];

type Props = {
  onSelectTemplate: (template: Template | null) => void;
};

export default function DropdownTemplate({ onSelectTemplate }: Props) {
  const [value, setValue] = React.useState<number | "">("");
  const [open, setOpen] = React.useState(false);

  const handleChange = (event: SelectChangeEvent<number | "">) => {
    const newValue = event.target.value;

    setValue(newValue);
    setOpen(false);

    if (newValue === "") {
      onSelectTemplate(null);
      return;
    }

    const templateSelecionado =
      templatesMock.find((t) => t.id === Number(newValue)) || null;

    onSelectTemplate(templateSelecionado);
  };

  return (
    <Box className="dropdown-wrapper2 InputTemplate">
      <FormControl fullWidth variant="outlined" className="dropdown-control2">
        <InputLabel
          id="template-label"
          className="dropdown-label2"
          shrink={open || value !== ""}
        >
          Template
        </InputLabel>

        <Select
          labelId="template-label"
          id="template-select"
          open={open}
          onOpen={() => setOpen(true)}
          onClose={() => setOpen(false)}
          value={value}
          label="Template"
          onChange={handleChange}
          displayEmpty
          className="dropdown-select2"
          renderValue={(selected) => {
            const valueStr = String(selected);

            if (valueStr === "") {
              return (
                <span style={{ color: "#888" }}>
                  
                </span>
              );
            }

            const template = templatesMock.find(
              (t) => t.id === Number(valueStr)
            );

            return template?.nome ?? "";
          }}
          MenuProps={{
            PaperProps: { className: "dropdown-menu2" },
          }}
        >
          <MenuItem value="">
            <em>Nenhum template</em>
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
