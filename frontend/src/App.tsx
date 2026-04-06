import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import {AppRoutes} from "./routes/AppRoutes";

function App() {
  return (
    <div className="app">
      <AppRoutes />
      <ToastContainer position="top-right" autoClose={3000} />
    </div>
  );
}

export default App;
