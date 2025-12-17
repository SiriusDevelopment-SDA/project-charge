
// Componentes globais
import Navbar from '../componente/global/Navbar';
import ClienteSelect from '../componente/filtrocliente';
import InputFileUpload from '../componente/importar-contatos';
import FormattedInputs from '../componente/inputnumber';
import Inputs2 from '../componente/iputs2';
import MessagePreview from "../componente/MessagePreview"
import MyButtonAlert from '../componente/MyButton';
import "../styles/importar-contatos.css";




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
    <div>
      <Navbar />
      <div className='ContainerConteudo'>

        <h1 className='pageTitle'>Efetuar Disparo</h1>

        <div className="box-wrapper ">


          <ClienteSelect className="botaoHome">
            Buscar clientes no ERP
          </ClienteSelect>

          <div style={{ marginTop: 16 }}>
            <FormattedInputs />
          </div>

          <div style={{ marginTop: 16 }}>
            <Inputs2 />
            <Inputs2 />
          </div>








          <div style={{ marginTop: 16 }}>
            <PaginationLink />
          </div>

          <ToastContainer />

          <div className='PreviewMensagemTemplate'>
            <MessagePreview />
          </div>

          <div className='box-wrapper'>
            
              <Button variant="contained" onClick={showToast}>
                Alert
              </Button>
            
            <InputFileUpload label="Carregar arquivos TXT/CSV com números" style={{ display: 'flex' }} />
          </div>
        </div>


        <div className='MyButton'>
          <MyButtonAlert variant="success">Enviar</MyButtonAlert>
          <MyButtonAlert variant="danger">Cancelar</MyButtonAlert>
        </div>
      </div>
    </div>
  );
}
