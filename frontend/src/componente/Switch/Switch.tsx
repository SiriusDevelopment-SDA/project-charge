import FormGroup from '@mui/material/FormGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';


type SwitchLabelsProps = {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  label?: string;
};

export default function SwitchLabels({ 
  checked = false, 
  onChange,
  label = "Cobrança recorrente?"
}: SwitchLabelsProps) {
  return (
    <FormGroup>
      <div style={{display: 'flex', gap: "10px", alignItems: 'center'}}>
      <span style={{ fontWeight: 400, fontSize: "12px" }}>
        {label}
      </span>
      <div style={{ width: 0 }}>
        <FormControlLabel 
          control={
            <Switch 
              checked={checked} 
              onChange={(e) => onChange?.(e.target.checked)} 
            />
          } 
          label="" 
        />
      </div>
      </div>
    </FormGroup>
  );
}
