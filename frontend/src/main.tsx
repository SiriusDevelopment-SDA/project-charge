import * as React from "react";
import * as ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./lib/primereact-locale";
import { ClientProvider } from "./context/contextClients";
import { TemplateProvider } from "./context/contextTemplates";
import "./styles/index.css";
import { HistoricoProvider } from "./context/contextHistorico";
import { DispatchTemplateProvider } from "./context/contextDisparo";
import { CampaignProvider } from "./context/contextCampaigns";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ClientProvider>
        <DispatchTemplateProvider>
          <TemplateProvider>
              <HistoricoProvider>
                  <CampaignProvider>
                    <App />
                  </CampaignProvider>
              </HistoricoProvider>
          </TemplateProvider>
        </DispatchTemplateProvider>
      </ClientProvider>
    </BrowserRouter>
  </React.StrictMode>
);
