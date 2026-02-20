import Box from '@mui/material/Box';
import Slider from '@mui/material/Slider';

import Styles from "./RangerSlider.module.css"

type RangeSliderProps = {
  value: number;
  onChange: (value: number) => void;
};

function valuetext(value: number) {
  return `${value} dias`;
}

export default function RangeSlider({ value, onChange }: RangeSliderProps) {

  const handleChange = (_: Event, newValue: number | number[]) => {
    onChange(newValue as number);
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
        step={1}
      />

      <div className={Styles.valueLabelDisplay}>
        {value} dias
      </div>
    </Box>
  );
}
