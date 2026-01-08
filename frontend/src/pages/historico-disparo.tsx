import { useNavigate } from "react-router-dom";

// componentes
import Navbar from "../componente/global/Navbar";
import DateTabela from "../componente/DateTabela";

// style
import "../styles/HistoricoDisparos.module.css";
import "../styles/MyButtonGlobal.css";

// PrimeReact styles
import "primereact/resources/themes/lara-dark-indigo/theme.css";
import "primereact/resources/primereact.min.css";
import "primeicons/primeicons.css";
import "primeflex/primeflex.css";

function HistoricoDisparoPage() {
  const navigate = useNavigate();
  return (
    <div>
      <Navbar />
      <div className="ContainerConteudo">

        {/* 🔹 BOTÃO QUE REDIRECIONA */}
        <div className="navigation">  
          <h1 className="pageTitle">Histórico de Disparos</h1>
          <div>
            <button
              className="outline"
              onClick={() => navigate("/EfetuarDisparo")}
            >
              Cliente com cadastro
            </button>
            <button
              className="outline"
              onClick={() => navigate("/historicodisparo")}
            >
              Historico
            </button>
          </div>
        </div>

        <div className="box-wrapper">
        {/* <DataTable /> */}
        <div style={{ padding: "2rem" }}>
          <DateTabela  />
        </div>
        </div>
      </div>
    </div>
  );
}

export default HistoricoDisparoPage;
