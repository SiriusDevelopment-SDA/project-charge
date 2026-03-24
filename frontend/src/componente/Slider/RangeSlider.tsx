import Box from '@mui/material/Box';
import Slider from '@mui/material/Slider';

import Styles from "./RangerSlider.module.css"

type RangeSliderProps = {
  value: [number, number];
  onChange: (value: [number, number]) => void;
};

export default function RangeSlider({ value, onChange }: RangeSliderProps) {

  const handleChange = (_: Event, newValue: number | number[]) => {
    onChange(newValue as [number, number]);
  };

  const handleReset = () => {
    onChange([0, 0]);
  };

  const [left, right] = value;

  const isActive = left !== 0 || right !== 0;
  const leftLabel = left !== 0 ? `${Math.abs(left)}d vencidos` : null;
  const rightLabel = right !== 0 ? `${Math.abs(right)}d a vencer` : null;

  return (
    <Box className={Styles.Container}>
      <h4 className={Styles.Title}>Régua de cobrança</h4>

      <Slider
        className={Styles.Slider}
        getAriaLabel={() => 'Régua de cobrança'}
        value={value}
        onChange={handleChange}
        valueLabelDisplay="auto"
        min={-400}
        max={400}
        step={1}
      />

      <div className={Styles.LabelsRow}>
        {leftLabel && <span className={Styles.LabelLeft}>{leftLabel}</span>}
        {leftLabel && rightLabel && <span className={Styles.Arrow}>→</span>}
        {rightLabel && <span className={Styles.LabelRight}>{rightLabel}</span>}
        {!leftLabel && !rightLabel && <span className={Styles.LabelInactive}>Inativo</span>}

        {isActive && (
          <button className={Styles.ResetBtn} onClick={handleReset} type="button" title="Resetar régua">
            ↺
          </button>
        )}
      </div>
    </Box>
  );
}
