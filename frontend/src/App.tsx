import { ToastContainer } from "react-toastify";
import AppRoutes from "./routes/AppRoutes";
import { Navbar } from "./componente/Index";

function App() {
  return (
    <div className="app">
      <Navbar />
      <AppRoutes />
      <ToastContainer position="top-right" autoClose={3000}/>
    </div>
  );
}

export default App;
