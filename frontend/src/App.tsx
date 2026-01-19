import { ToastContainer } from "react-toastify";
import AppRoutes from "./routes/AppRoutes";
import { Navbar } from "./componente/Index";

function App() {
  return (
    <div className="app">
      <Navbar />
      <AppRoutes />
      <ToastContainer />
    </div>
  );
}

export default App;
