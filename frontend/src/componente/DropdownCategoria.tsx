import * as React from "react";
import Box from "@mui/material/Box";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import Select from "@mui/material/Select";
import type { SelectChangeEvent } from "@mui/material/Select";

import "../styles/DropdownCategoria.css";

const capitalize = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);

export default function DropdownCategoria() {
  const [value, setValue] = React.useState("");
  const [open, setOpen] = React.useState(false);

  const handleChange = (event: SelectChangeEvent) => {
    setValue(event.target.value);
    setOpen(false);
  };

  return (
    <Box className="dropdown-wrapper InputCategoria">
      <FormControl fullWidth variant="outlined" className="dropdown-control2">
        <InputLabel
          id="categoria-label"
          className="dropdown-label"
          shrink={open || value !== ""}
        >
          Categoria
        </InputLabel>

        <Select
          labelId="categoria-label"
          id="categoria-select"
          open={open}
          onOpen={() => setOpen(true)}
          onClose={() => setOpen(false)}
          value={value}
          label="Categoria"
          onChange={handleChange}
          displayEmpty
          className="dropdown-select"
          renderValue={(selected) => {
            const valueStr = String(selected);

            if (valueStr === "") {
              return (
                <span style={{ color: "#888" }}>
                  
                </span>
              );
            }

            return capitalize(valueStr);
          }}
          MenuProps={{
            PaperProps: { className: "dropdown-menu" },
          }}
        >
          <MenuItem value="">
            <em>Nenhuma categoria</em>
          </MenuItem>

          <MenuItem value="marketing">Marketing</MenuItem>
          <MenuItem value="aviso">Aviso</MenuItem>
          <MenuItem value="cobranca">Cobrança</MenuItem>
          <MenuItem value="outros">Outros</MenuItem>
        </Select>
      </FormControl>
    </Box>
  );
}
