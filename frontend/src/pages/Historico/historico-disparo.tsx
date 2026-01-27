// import { useNavigate } from "react-router-dom";

// componentes
// import Navbar from "../componente/global/navbar/Navbar";
// import DateTabela from "../Historico/historico-disparo";

// style
// import "../styles/HistoricoDisparos.module.css";
// import "../styles/MyButtonGlobal.css";

// PrimeReact styles
import "primereact/resources/themes/lara-dark-indigo/theme.css";
import "primereact/resources/primereact.min.css";
import "primeicons/primeicons.css";
import "primeflex/primeflex.css";
import { PageContainer, TitlePage } from "../../componente/Index";
import AdvancedFilterDemo from "../../componente/table/tableHistory";
import { useHistorico } from "../../hooks/useHistorico";

export function HistoricoDisparoPage() {
  const {historico} = useHistorico();
  return (
    <PageContainer className="teste">
      <TitlePage title="Históricos de disparos" className="tittlehistorico"/>
      <AdvancedFilterDemo data={historico} />
    </PageContainer>
  );
}

