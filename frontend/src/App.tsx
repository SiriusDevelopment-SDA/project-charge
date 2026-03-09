import { useLocation } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import {AppRoutes} from "./routes/AppRoutes";
import { Navbar } from "./componente/Index";

function App() {
  const location = useLocation();
  const showNavbar = location.pathname !== "/login";

  return (
    <div className="app">
      {showNavbar && <Navbar />}
      <AppRoutes />
      <ToastContainer position="top-right" autoClose={3000} />
    </div>
  );
}

export default App;

