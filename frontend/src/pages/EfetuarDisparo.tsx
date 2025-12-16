
// Componentes globais
import Navbar from '../componente/global/Navbar';
import ClienteSelect from '../componente/filtrocliente';
import InputFileUpload from '../componente/importar-contatos';
import FormattedInputs from '../componente/inputnumber';
import Inputs2 from '../componente/iputs2';
import MessagePreview from "../componente/MessagePreview"
import MyButtonAlert from '../componente/MyButton';

// Style
import "../styles/DisparoAtivo.css";

// MUI 
import Button from '@mui/material/Button';

// Toastify
import { ToastContainer, toast, Bounce } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import PaginationLink from '../componente/pagination';

export default function EfetuarDisparo() {
  const showToast = () => {
    toast.warn('20 clientes sem contato cadastrado!', {
      position: 'top-right',
      autoClose: 5000,
      theme: 'dark',
      transition: Bounce,
    });
  };

  return (
    <div style={{ padding: 5 }}>
      <Navbar />
      
      <h1 className='pageTitle'>Efetuar Disparo</h1>

       <ClienteSelect className="botaoHome">
        Buscar clientes no ERP
      </ClienteSelect>

      <div style={{ marginTop: 16 }}>
        <FormattedInputs />
      </div>

      <div style={{ marginTop: 16 }}>
        <Inputs2 />
      </div>

      <div style={{ marginTop: 16 }}>
        <InputFileUpload />
      </div>

      

      <div style={{ marginTop: 24 }}>
        <Button variant="contained" onClick={showToast}>
          Alert
        </Button>
      </div>

     
       <div style={{ marginTop: 16 }}>
        <PaginationLink/>
      </div>

      <ToastContainer />

      <div className='PreviewMensagemTemplate'>
        <MessagePreview />
      </div>

      <div className='MyButton'>
        <MyButtonAlert variant="success">Enviar</MyButtonAlert>
        <MyButtonAlert variant="danger">Cancelar</MyButtonAlert>
      </div>
    </div>
  );
}