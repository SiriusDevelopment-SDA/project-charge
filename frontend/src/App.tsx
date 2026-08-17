import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import {AppRoutes} from "./routes/AppRoutes";

function App() {
  return (
    <div className="app">
      <AppRoutes />
      {/* zIndex acima do overlay dos modais (9999) para o toast nunca ficar atrás. */}
      <ToastContainer position="top-right" autoClose={3000} style={{ zIndex: 20000 }} />
    </div>
  );
}

export default App;
