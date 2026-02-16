import { Routes, Route, } from "react-router-dom";

import EfetuarDisparo from "../pages/EfetuarDisparo/EfetuarDisparo";
import Templates from "../pages/TemplatesMeta/TemplatesMeta";
import { HistoricoDisparoPage } from "../pages/Historico/historico-disparo";
import { ClientesVencidos } from "../pages/ClientesVencidos/ClientesVencidos";
import CreateTemplate from "../pages/TemplatesMeta/Subpages/CreateTemplate";
import Campanhas from "../pages/Campanhas/Subpages/Campanhas";
import { AccountLayout } from "./AccountLayout";
import {CriarCampanha} from "../pages/CriarCampanha/CriarCampanha";

export default function AppRoutes() {
  return (
    <Routes>

      {/* ROTA RAIZ (recebe account e distribui) */}
      <Route path="/" element={<AccountLayout />}>

        {/* página inicial */}
        <Route index element={<EfetuarDisparo />} />

        <Route path="templates" element={<Templates />} />
        <Route path="historico" element={<HistoricoDisparoPage />} />
        <Route path="clientesVencidos" element={<ClientesVencidos/>} />
        <Route path="CreateTemplate" element={<CreateTemplate />} />
        <Route path="Campanhas" element={<Campanhas />} />
        <Route path="CreateCampanha" element={<CriarCampanha />} />

      </Route>

    </Routes>
  );
}
