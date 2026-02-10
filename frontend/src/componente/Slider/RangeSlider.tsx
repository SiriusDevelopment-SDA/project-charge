import * as React from 'react';
import Box from '@mui/material/Box';
import Slider from '@mui/material/Slider';

import Styles from "./RangerSlider.module.css"

function valuetext(value: number) {
  return `${value}°C`;
}

export default function RangeSlider() {
  const [value, setValue] = React.useState<number[]>([0, 0]);

  const handleChange = (event: Event, newValue: number[]) => {
    setValue(newValue);
  };

  return (
    <Box>
      <h4>Regua de cobrança</h4>
      <Slider
        className={Styles.Slider}
        getAriaLabel={() => 'Temperature range'}
        value={value}
        onChange={handleChange}
        valueLabelDisplay="auto"
        getAriaValueText={valuetext}
        max={400}
      />
    </Box>
  );
}
