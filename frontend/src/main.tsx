import * as React from "react";
import * as ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./lib/primereact-locale";
import "./styles/index.css";
import { RootProviders } from "./context/RootProviders";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <RootProviders>
        <App />
      </RootProviders>
    </BrowserRouter>
  </React.StrictMode>
);
