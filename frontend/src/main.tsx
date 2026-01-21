import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./lib/primereact-locale";
import { ClientProvider } from "./context/contextClients";
import { TemplateProvider } from "./context/contextTemplates";
import "./styles/index.css";
import { DispatchTemplateProvider } from "./context/contextDisparo";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ClientProvider>
        <DispatchTemplateProvider>
          <TemplateProvider>
            <App />
          </TemplateProvider>
        </DispatchTemplateProvider>
      </ClientProvider>
    </BrowserRouter>
  </React.StrictMode>
);
