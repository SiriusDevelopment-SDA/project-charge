import { Routes, Route, } from "react-router-dom";
import EfetuarDisparo from "../pages/EfetuarDisparo/EfetuarDisparo";
import Templates from "../pages/TemplatesMeta/TemplatesMeta";
import { HistoricoDisparoPage } from "../pages/Historico/historico-disparo";
import { ClientesVencidos } from "../pages/ClientesVencidos/ClientesVencidos";
import CreateTemplate from "../pages/TemplatesMeta/Subpages/CreateTemplate";
import { AccountLayout } from "./AccountLayout";
import Dashboard from "../pages/Dashboard/Dashboard";
import { Campanhas } from "../pages/Campanhas/Campanhas";
import { CriarCampanha } from "../pages/Campanhas/Subpages/CriarCampanha";
import { Login } from "../pages/Login/Login";
import { ChatwootPage } from "../pages/Chatwoot/Chatwoot";
import { DashboardProvider } from "../context/contextDashboard";
import { NotFoundPage } from "../pages/NotFound/NotFound";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* ROTA RAIZ (recebe account e distribui) */}
      <Route path="/" element={<AccountLayout />}>

        {/* página inicial */}
        <Route index element={<EfetuarDisparo />} />

        <Route path="templates" element={<Templates />} />
        <Route path="historico" element={<HistoricoDisparoPage />} />
        <Route path="clientesVencidos" element={<ClientesVencidos/>} />
        <Route path="createTemplate" element={<CreateTemplate />} />
        <Route path="campanhas" element={<Campanhas />} />
        <Route path="createCampanha" element={<CriarCampanha />} />
        <Route path="dashboard" element={<DashboardProvider><Dashboard /></DashboardProvider>} />
        <Route path="chat" element={<ChatwootPage />} />
        <Route path="*" element={<NotFoundPage />} />

      </Route>

    </Routes>
  );
}
