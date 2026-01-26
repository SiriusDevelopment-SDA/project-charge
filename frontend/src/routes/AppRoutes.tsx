import { Routes, Route } from "react-router-dom";
import EfetuarDisparo from "../pages/EfetuarDisparo/EfetuarDisparo";
import {HistoricoDisparoPage} from "../pages/Historico/historico-disparo";



export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<EfetuarDisparo />} />
      <Route path="/historico" element={<HistoricoDisparoPage />} />
    </Routes>
  );
}
