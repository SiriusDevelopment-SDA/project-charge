import { Routes, Route } from "react-router-dom";
import EfetuarDisparo from "../pages/EfetuarDisparo/EfetuarDisparo";
import Templates from "../pages/TemplatesMeta/TemplatesMeta";
// import HistoricoDisparo from "../pages/historico-disparo";
import {HistoricoDisparoPage} from "../pages/Historico/historico-disparo";
import { ClientesVencidos } from "../pages/ClientesVencidos/ClientesVencidos";
import CreateTemplate from "../pages/TemplatesMeta/Subpages/CreateTemplate";



export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<EfetuarDisparo />} />
      <Route path="/templates" element={<Templates />} />
      <Route path="/historico" element={<HistoricoDisparoPage />} />
      <Route path="/clientesVencidos" element={<ClientesVencidos/>} />
      <Route path="/CreateTemplate" element={<CreateTemplate />} />
    </Routes>
  );
}
