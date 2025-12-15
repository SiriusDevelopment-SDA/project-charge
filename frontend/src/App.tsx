import ClienteSelect from './componente/filtrocliente';
import './styles/App.css';
import PaginationLink from './componente/pagination';
import InputFileUpload from './componente/importar-contatos';
import { Button } from '@mui/material';
import { ToastContainer, toast, Bounce } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import FormattedInputs from './componente/inputnumber';
import Inputs2 from './componente/iputs2';

function App() {
  const showToast = () => {
    toast.warn('20 clientes sem contato cadastrado!', {
      position: 'top-right',
      autoClose: 5000,
      theme: 'dark',
      transition: Bounce,
    });
  };

  return (
    <>
    Efetuar Disparo
      <ClienteSelect className="botaoHome">Buscar clientes no ERP</ClienteSelect>
      <FormattedInputs/>
      <Inputs2/>
      <InputFileUpload/>
      <PaginationLink/>
      <Button variant="contained" onClick={showToast}>Alert</Button> <ToastContainer/>
    </>
  );
}

export default App;