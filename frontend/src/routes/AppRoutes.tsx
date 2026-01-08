import { Routes, Route } from "react-router-dom";
import EfetuarDisparo from "../pages/EfetuarDisparo";
import HistoricoDisparo from "../pages/historico-disparo";



export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<EfetuarDisparo />} />
      {/* ✅ HISTÓRICO */}
      <Route path="/historicodisparo" element={<HistoricoDisparo />} />
    </Routes>
  );
}
