import * as React from "react";
import Box from "@mui/material/Box";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import Select from "@mui/material/Select";
import type { SelectChangeEvent } from "@mui/material/Select";

import "../styles/DropdownCategoria.css";

export default function DropdownCategoria() {
  const [value, setValue] = React.useState("");

  const handleChange = (event: SelectChangeEvent) => {
    setValue(event.target.value as string);
  };

  return (
    <Box className="dropdown-wrapper InputCategoria">
      <FormControl fullWidth variant="outlined" className="dropdown-control2">
        <InputLabel className="dropdown-label">Categoria</InputLabel>

        <Select
          value={value}
          label="Categoria"
          onChange={handleChange}
          className="dropdown-select"
          MenuProps={{
            PaperProps: { className: "dropdown-menu" },
          }}
        >
          
          <MenuItem value="Selecionar categoria"><em>Selecionar categoria</em></MenuItem>
          <MenuItem value="marketing">Marketing</MenuItem>
          <MenuItem value="aviso">Aviso</MenuItem>
          <MenuItem value="cobranca">Cobrança</MenuItem>
          <MenuItem value="outros">Outros</MenuItem>
          
        </Select>
      </FormControl>
    </Box>
  );
}
