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
import { PermissionRoute } from "./PermissionRoute";
import { PerfilPage } from "../pages/Perfil/Perfil";
import { HistoricoGeralPage } from "../pages/HistoricoGeral/historico-geral";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* ROTA RAIZ (recebe account e distribui) */}
      <Route path="/" element={<AccountLayout />}>

        {/*
          Empresa inativa bloqueia TODAS as rotas do app.

          Ate 09/09/2026 seis delas eram "publicas" — disparo, historico,
          campanhas, criar campanha, perfil e auditoria seguiam usaveis com a
          empresa inativa. Isso deixava o produto dizendo duas coisas ao mesmo
          tempo: a faixa de empresa inativa avisava que as telas estavam
          bloqueadas enquanto o Disparo Manual funcionava normalmente por baixo
          dela. Pior que a incoerencia visual, a empresa inativa e a que NAO
          sincroniza (os dois crons de faturas filtram `active: true`), entao
          disparar dali usa snapshot congelado.

          Se alguma rota precisar voltar a ser acessivel com a empresa inativa,
          tire o `BlockedRoute` dela E reveja o texto da `EmpresaInativaBanner`,
          que hoje afirma que as telas ficam bloqueadas.

          O super_admin ve o mesmo blur, mas sem o card "Em desenvolvimento" e
          com a faixa clicavel para reativar. Ver `BlockedRoute`.
        */}
        <Route index element={<BlockedRoute><EfetuarDisparo /></BlockedRoute>} />
        <Route path="historico" element={<BlockedRoute><HistoricoDisparoPage /></BlockedRoute>} />
        <Route path="campanhas" element={<BlockedRoute><Campanhas /></BlockedRoute>} />
        <Route path="createCampanha" element={<BlockedRoute><CriarCampanha /></BlockedRoute>} />
        <Route
          path="perfil"
          element={
            <AgentOnlyRoute>
              <BlockedRoute><PerfilPage /></BlockedRoute>
            </AgentOnlyRoute>
          }
        />
        <Route
          path="auditoria"
          element={
            <AgentOnlyRoute>
              <BlockedRoute><HistoricoGeralPage /></BlockedRoute>
            </AgentOnlyRoute>
          }
        />

        <Route path="templates" element={<BlockedRoute><Templates /></BlockedRoute>} />
        <Route path="clientesVencidos" element={<BlockedRoute><PermissionRoute page="clientesVencidos"><ClientesVencidos /></PermissionRoute></BlockedRoute>} />
        <Route path="createTemplate" element={<BlockedRoute><CreateTemplate /></BlockedRoute>} />
        <Route path="dashboard" element={<BlockedRoute><PermissionRoute page="dashboard"><DashboardProvider><Dashboard /></DashboardProvider></PermissionRoute></BlockedRoute>} />
        <Route
          path="chat"
          element={
            <AgentOnlyRoute>
              <BlockedRoute><PermissionRoute page="chat"><ChatwootPage /></PermissionRoute></BlockedRoute>
            </AgentOnlyRoute>
          }
        />
        <Route path="*" element={<NotFoundPage />} />

      </Route>

    </Routes>
  );
}
