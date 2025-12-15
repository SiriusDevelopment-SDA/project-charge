import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import MyButtonAlert from "./componente/MyButton";
import MessagePreview from "./componente/MessagePreview"
import Navbar from "./componente/global/Navbar"
import  "./styles/App.css"  

function App() {
  return (
    
    <>
      <Navbar />
      {/* CONTAINER GLOBAL */}
      <div className="ContentButton">
      <ToastContainer />
      <MyButtonAlert variant="success">Enviar</MyButtonAlert>
      <MyButtonAlert variant="danger">Cancelar</MyButtonAlert>
      </div>
      <MessagePreview />
    </>
  );
}

export default App;
