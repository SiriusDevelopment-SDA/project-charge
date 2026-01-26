import * as React from "react";
import * as ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./lib/primereact-locale";
import { ClientProvider } from "./context/contextClients";
import { TemplateProvider } from "./context/contextTemplates";
import "./styles/index.css";
import { HistoricoProvider } from "./context/contextHistorico";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ClientProvider>
        <TemplateProvider>
         <HistoricoProvider>
          <App />
         </HistoricoProvider>
        </TemplateProvider>
      </ClientProvider>
    </BrowserRouter>
  </React.StrictMode>
);
