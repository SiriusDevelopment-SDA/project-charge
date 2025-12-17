import * as React from 'react';
import Box from '@mui/material/Box';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Select from '@mui/material/Select';
import type { SelectChangeEvent } from '@mui/material/Select';
import '../styles/DropdownCategoria.css';


export default function DropdownCategoria() {
  const [age, setAge] = React.useState('');

  const handleChange = (event: SelectChangeEvent) => {
    setAge(event.target.value as string);
  };

  return (
    <Box sx={{ minWidth: 120, }}>
      <FormControl sx={{height: 80, width: 600, display: 'flex'}}>
        <InputLabel id="demo-simple-select-label">Categoria</InputLabel>
        <Select
          labelId="demo-simple-select-label"
          id="demo-simple-select"
          value={age}
          label="Age"
          onChange={handleChange}
        size='small'>
          <MenuItem value={10}>Marketing</MenuItem>
          <MenuItem value={20}>Aviso</MenuItem>
          <MenuItem value={30}>Cobrança</MenuItem>
          <MenuItem value={30}>Outros</MenuItem>
        </Select>
      </FormControl>
    </Box>
  );
}