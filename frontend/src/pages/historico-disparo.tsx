
import Navbar from "../componente/global/Navbar";
// import DataTable from "../componente/DataTable";
import DateTabela from "../componente/DateTabela";

// style
// import "../styles/HistoricoDIsparos.module.css";

// PrimeReact styles
import 'primereact/resources/themes/lara-dark-indigo/theme.css';
import 'primereact/resources/primereact.min.css';
import 'primeicons/primeicons.css';
import 'primeflex/primeflex.css';

function HistoricoDisparoPage() {
  return <div>
    <Navbar />
    <h1 className="pageTitle">Histórico de Disparos</h1>
    {/* <DataTable /> */}
    <div style={{ padding: '2rem' }}>

    <DateTabela />
    </div>
  </div>;
}

export default HistoricoDisparoPage;