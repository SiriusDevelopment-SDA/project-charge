import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import "./lib/primereact-locale";
import { ClientProvider } from './context/contextClients';
import { TemplateProvider } from './context/contextTemplates';


ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ClientProvider>
            <TemplateProvider>
              <App />
            </TemplateProvider>
      </ClientProvider>
    </BrowserRouter>
  </React.StrictMode>
);
