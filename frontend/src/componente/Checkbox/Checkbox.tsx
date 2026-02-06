interface CheckboxProps {
  checked: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  name: string;
  disabled?: boolean;
  className?: string; 
}

export function Checkbox({ checked, onChange, name, className }: CheckboxProps) {
  return (
    <section className={className} style={{ display: 'flex', alignItems: 'center' }}>
      <input 
        type="checkbox" 
        checked={checked} 
        onChange={onChange} 
        name={name} 
        style={{
          accentColor: 'green', // Usando a nova propriedade 'accentColor' para mudar a cor do checkbox
        }}
      />
    </section>
  );
}
