// LOGICA ANTIGA

// import { ToastContainer } from "react-toastify";
// import AppRoutes from "./routes/AppRoutes";
// import { Navbar } from "./componente/Index";

// function App() {
//   return (
//     <div className="app">
//       <Navbar />
//       <AppRoutes />
//       <ToastContainer position="top-right" autoClose={3000}/>
//     </div>
//   );
// }

// export default App;

import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import AppRoutes from "./routes/AppRoutes";
import { Navbar } from "./componente/Index";

function App() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(location.search);

    if (!params.has("account")) {
      params.set("account", "4");
      navigate(`${location.pathname}?${params.toString()}`, {
        replace: true,
      });
    }
  }, [location, navigate]);

  return (
    <div className="app">
      <Navbar />
      <AppRoutes />
      <ToastContainer position="top-right" autoClose={3000} />
    </div>
  );
}

export default App;

