import * as React from 'react';
import { IMaskInput } from 'react-imask';
import Stack from '@mui/material/Stack';
import Input from '@mui/material/Input';
import FormControl from '@mui/material/FormControl';
import InputAdornment from '@mui/material/InputAdornment';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';

interface CustomProps {
  onChange: (event: { target: { name: string; value: string } }) => void;
  name: string;
}

const TextMaskCustom = React.forwardRef<
  HTMLInputElement,
  CustomProps
>(function TextMaskCustom(props, ref) {
  const { onChange, name, ...other } = props;

  return (
    <IMaskInput
      {...other}
      mask="(#0) 00000-0000"
      definitions={{ '#': /[1-9]/ }}
      inputRef={ref as React.Ref<HTMLInputElement>}
      onAccept={(value) =>
        onChange({ target: { name, value } })
      }
      overwrite
    />
  );
});

export default function FormattedInputs() {
  const [value, setValue] = React.useState('');

  return (
    <Stack spacing={2}>
      <FormControl variant="standard">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          name="whatsapp"
          placeholder="Digite o número do WhatsApp do cliente"
          inputComponent={TextMaskCustom as any}
          startAdornment={
            <InputAdornment position="start">
              <WhatsAppIcon
                fontSize="inherit"
                sx={{ color: '#25D366' }} // verde WhatsApp
              />
            </InputAdornment>
          }
        />
      </FormControl>
    </Stack>
  );
}
