import Button from '@mui/material/Button';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import '../styles/importar-contatos.css';
import type { MyInputProps } from '../types';

export default function InputFileUpload({ label, style }: MyInputProps) {
  return (
    <>
      {label && <label style={style}>{label}</label>}

      <Button
        className="importarContatosButton  "
        component="label"
        startIcon={<CloudUploadIcon />}
      >
       <input
          type="file"
          multiple
          className="importarContatosInput"
          onChange={(event) => console.log(event.target.files)}
        />
      </Button>
    </>
  );
}

