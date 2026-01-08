import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { useNavigate } from "react-router-dom";

// Componentes
import Navbar from "../componente/global/Navbar";
import ClienteSelect from "../componente/filtrocliente";
import InputFileUpload from "../componente/importar-contatos";
import MessagePreview from "../componente/MessagePreview";
import MyButtonAlert from "../componente/MyButton";
import DropdownTemplate from "../componente/DropdownTemplate";
import DropdownCategoria from "../componente/DropdownCategoria";
import ClientsSelectedCard from "../componente/ClientsSelectedCard";
import InputNumber from "../componente/inputnumber";

// Styles
import "../styles/importar-contatos.css";
import "../styles/EfetuarDisparo.css";
import "../styles/DropdownCategoria.css";
import "../styles/MyButtonGlobal.css";

// Toastify
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

/* ======================================================
   Utilitário
====================================================== */
function renderTemplate(
  template: string,
  variaveis: Record<string, string | number | undefined>
) {
  let resultado = template;

  Object.entries(variaveis).forEach(([chave, valor]) => {
    const regex = new RegExp(`{{\\s*${chave}\\s*}}`, "g");
    resultado = resultado.replace(regex, String(valor ?? ""));
  });

  return resultado;
}

/* ======================================================
   Página
====================================================== */
export default function EfetuarDisparo() {
  const navigate = useNavigate();
  const [modoCliente, setModoCliente] = useState<"com" | "sem">("com");
  const [clientesSelecionados, setClientesSelecionados] = useState<any[]>([]);
  const [templateSelecionado, setTemplateSelecionado] = useState<any>(null);
  const [resetKey, setResetKey] = useState(0);

  /* ================= PREVIEW ================= */
  const previewMessage = useMemo(() => {
    if (!templateSelecionado?.conteudo)
      return "Selecione um template para visualizar a mensagem";

    if (modoCliente === "com" && clientesSelecionados.length === 0)
      return "Selecione ao menos um cliente para visualizar a mensagem";

    const nomeCliente =
      modoCliente === "com" ? clientesSelecionados[0] : "Cliente";

    return renderTemplate(templateSelecionado.conteudo, {
      nome: nomeCliente,
    });
  }, [clientesSelecionados, templateSelecionado, modoCliente]);

  /* ================= AÇÕES ================= */
  function toggleModoCliente() {
    setModoCliente((prev) => (prev === "com" ? "sem" : "com"));
    setClientesSelecionados([]);
    setTemplateSelecionado(null);
    setResetKey((k) => k + 1);
  }

  function handleCancelar() {
    setClientesSelecionados([]);
    setTemplateSelecionado(null);
    setResetKey((k) => k + 1);
  }

  /* ================= DOWNLOAD XLSX ================= */
  function handleDownloadModelo() {
    const TOTAL_LINHAS = 500;

    const rows = Array.from({ length: TOTAL_LINHAS }, () => ({
      nome: "",
      telefone: 0,
    }));

    const ws = XLSX.utils.json_to_sheet(rows, {
      header: ["nome", "telefone"],
    });

    ws["!cols"] = [{ wch: 35 }, { wch: 20 }];

    for (let r = 2; r <= TOTAL_LINHAS + 1; r++) {
      const addr = `B${r}`;
      if (!ws[addr]) continue;

      ws[addr].t = "n";
      ws[addr].v = 0;
      ws[addr].z = "(##) #####-####;;;";
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Contatos");

    XLSX.writeFile(wb, "modelo_contatos.xlsx");
  }

  /* ================= JSX ================= */
  return (
    <div>
      <Navbar />

      <div className="ContainerConteudo">
        <div className="navigation">
          <h1 className="pageTitle">
            {modoCliente === "com"
              ? "Disparo clientes ativos"
              : "Disparo novos clientes"}
          </h1>

          <div className="buttons-navigation">
            <button className="outline" onClick={toggleModoCliente}>
              {modoCliente === "com"
                ? "Cliente sem cadastro"
                : "Cliente com cadastro"}
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
          <div className="teste">
            
              <div className="boxInputs">
                {modoCliente === "com" && (
                  <ClienteSelect
                    key={`cliente-${resetKey}`}
                    onChangeClientes={setClientesSelecionados}
                  >
                    Buscar clientes no ERP
                  </ClienteSelect>
                )}

                {modoCliente === "sem" && (
                  <InputNumber key={`number-${resetKey}`} />
                )}

                <DropdownTemplate
                  key={`template-${resetKey}`}
                  onSelectTemplate={setTemplateSelecionado}
                />

                <DropdownCategoria key={`categoria-${resetKey}`} />
              </div>
            

            <ClientsSelectedCard total={clientesSelecionados.length} />
          </div>

          <ToastContainer />

          <div className="PreviewMensagemTemplate">
            <MessagePreview message={previewMessage} />
          </div>

          <p className="UploadDescricao">Carregar arquivos .XLSX</p>

          <div className="Box-Arquivo">
            <InputFileUpload key={`upload-${resetKey}`} />

            <div className="download-wrapper">
              <MyButtonAlert 
                variant="secondary"
                text="Baixar modelo XLSX"
                onClick={handleDownloadModelo}
              />
            </div>
          </div>
        </div>

        <div className="MyButton">
          <MyButtonAlert variant="success" text="Enviar" acao="Enviado com sucesso"/>
          <MyButtonAlert
           acao="Formulário limpo!"
            variant="danger"
            text="Limpar"
            onClick={handleCancelar}
          />
        </div>
      </div>
    </div>
  );
}
