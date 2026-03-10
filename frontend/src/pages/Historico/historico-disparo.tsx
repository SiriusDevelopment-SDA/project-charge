import "primereact/resources/themes/lara-dark-indigo/theme.css";
import "primereact/resources/primereact.min.css";
import "primeicons/primeicons.css";
import "primeflex/primeflex.css";
import { PageContainer, TitlePage } from "../../componente/Index";
import Table from "../../componente/table/tableHistory";
import { useHistorico } from "../../hooks/useHistorico";
import S from "./Styles/historico.module.css"

export function HistoricoDisparoPage() {
  const { histories } = useHistorico();
  return (
    <PageContainer>
      <TitlePage title="Historicos de disparos" subtitle="Acompanhe status e respostas dos envios realizados" />
      <Table data={histories} className={S.table}/>
    </PageContainer>
  );
}


