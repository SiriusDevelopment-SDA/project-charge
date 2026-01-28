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

