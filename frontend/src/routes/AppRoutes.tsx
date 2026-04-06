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
import { BlockedRoute } from "./BlockedRoute";
import { AgentOnlyRoute } from "./AgentOnlyRoute";
import { PerfilPage } from "../pages/Perfil/Perfil";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* ROTA RAIZ (recebe account e distribui) */}
      <Route path="/" element={<AccountLayout />}>

        {/* rotas públicas — acessíveis mesmo com empresa inativa */}
        <Route index element={<EfetuarDisparo />} />
        <Route path="historico" element={<HistoricoDisparoPage />} />
        <Route path="campanhas" element={<Campanhas />} />
        <Route path="createCampanha" element={<CriarCampanha />} />
        <Route
          path="perfil"
          element={
            <AgentOnlyRoute>
              <PerfilPage />
            </AgentOnlyRoute>
          }
        />

        {/* rotas bloqueadas quando a empresa está inativa */}
        <Route path="templates" element={<BlockedRoute><Templates /></BlockedRoute>} />
        <Route path="clientesVencidos" element={<BlockedRoute><ClientesVencidos /></BlockedRoute>} />
        <Route path="createTemplate" element={<BlockedRoute><CreateTemplate /></BlockedRoute>} />
        <Route path="dashboard" element={<BlockedRoute><DashboardProvider><Dashboard /></DashboardProvider></BlockedRoute>} />
        <Route path="chat" element={<BlockedRoute><ChatwootPage /></BlockedRoute>} />

        <Route path="*" element={<NotFoundPage />} />

      </Route>

    </Routes>
  );
}
