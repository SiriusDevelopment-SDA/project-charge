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
import { AccountProvider } from "./context/AccountContext";
import { CampaignProvider } from "./context/contextCampaigns";
import { CategoriesProvider } from "./context/contextCategories";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ClientProvider>
        <DispatchTemplateProvider>
          <TemplateProvider>
            <CategoriesProvider>
              <HistoricoProvider>
                <CampaignProvider>
                  <AccountProvider>
                    <App />
                  </AccountProvider>
                </CampaignProvider>
              </HistoricoProvider>
            </CategoriesProvider>
          </TemplateProvider>
        </DispatchTemplateProvider>
      </ClientProvider>
    </BrowserRouter>
  </React.StrictMode>
);
