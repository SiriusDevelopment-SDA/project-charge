import { useMemo, useState, useEffect } from "react";
import * as XLSX from "xlsx";
import { useNavigate } from "react-router-dom";

// Componentes
import Navbar from "../componente/global/Navbar";
import ClienteSelect from "../componente/filtrocliente";
import InputFileUpload from "../componente/importar-contatos";
import MessagePreview from "../componente/MessagePreview";
import MyButtonAlert from "../componente/MyButton";
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
import type { Template } from "../types";
import DropdownPersonalized from "../componente/Dropdown";

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
  const [templateSelecionado, setTemplateSelecionado] =
    useState<Template | null>(null);
  const [openTemplate, setOpenTemplate] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [openDropdownCliente, setOpenDropdownCliente] = useState(false);

  /* ================= LÓGICA PARA FECHAR DROPDOWNS AO CLICAR FORA ================= */
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      
      const isInsideTemplate = target.closest(".custom-dropdown-wrapper");
      const isInsideFilter = target.closest(".filter-container") || 
                             target.closest(".dropdown-categoria") || 
                             target.closest(".filter-button") ||
                             target.tagName === "SELECT" || 
                             target.tagName === "OPTION";

      if (!isInsideTemplate && !isInsideFilter) {
        setOpenTemplate(false);
      }
      
      const isInsideCliente = target.closest(".cliente-select");
      if (!isInsideCliente) {
        setOpenDropdownCliente(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside, true);
    return () => document.removeEventListener("mousedown", handleClickOutside, true);
  }, []);

  /* ================= PREVIEW ================= */
  const previewMessage = useMemo(() => {
    if (!templateSelecionado?.conteudo)
      return "Selecione um template para visualizar a mensagem";

    if (modoCliente === "com" && clientesSelecionados.length === 0)
      return "Selecione ao menos um cliente para visualizar a mensagem";

    const nomeCliente =
      modoCliente === "com" ? (clientesSelecionados[0] || "Cliente") : "Cliente";

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
      CPF: "",
      Telefone: "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows, { header: ["CPF", "Telefone"] });
    ws["!cols"] = [{ wch: 20 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Contatos");
    XLSX.writeFile(wb, modoCliente === "com" ? "modelo_clientes.xlsx" : "modelo_leads.xlsx");
  }

  return (
    <div>
      <Navbar />

      <div className="ContainerConteudo">
        <div className="navigation">
          <h1 className="pageTitle">
            {modoCliente === "com"
              ? "Disparo clientes ativos"
              : "Disparo nova lead"}
          </h1>

          <div className="buttons-navigation">
            <button className="outline" onClick={toggleModoCliente}>
              {modoCliente === "com" ? "Nova lead" : "Cliente com cadastro"}
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

                {/* 🔹 Componente Template */}
              <DropdownPersonalized
                key={`template-${resetKey}`}
                setOpenState={setOpenTemplate}
                open={openTemplate}
                FilterButtonProp={true}
                onSelectTemplate={(t) => {
                  setTemplateSelecionado(t);
                  setOpenTemplate(false);
                }}
              />

                {modoCliente === "com" && (
                  <ClienteSelect
                    disabled={!templateSelecionado}
                    value={clientesSelecionados}
                    setSelected={setClientesSelecionados}
                    selected={clientesSelecionados}
                    onChangeClientes={(novos) => {
                      setClientesSelecionados(novos);
                    }}
                    open={openDropdownCliente}
                    setOpen={setOpenDropdownCliente}
                  >
                    Buscar clientes no ERP
                  </ClienteSelect>
                )}

                {modoCliente === "sem" && (
                  <InputNumber key={`number-${resetKey}`} />
                )}
              

              {/* 🔹 BOTÕES DE AÇÃO COM INTUITOS DIFERENTES */}
              <div
                className={`mini-actions ${
                  !templateSelecionado ? "disabled-block" : ""
                }`}
              >
                <div
                  className="btn-mini file-wrapper"
                  style={{
                    pointerEvents: !templateSelecionado ? "none" : "auto",
                  }}
                >
                  {/* O componente de upload pode receber props diferentes se necessário */}
                  <InputFileUpload
                    onClientesImportados={(validos) => {
                      setClientesSelecionados((prev) =>
                        Array.from(new Set([...prev, ...validos]))
                      );
                    }}
                  />
                </div>

                <button
                  className="btn-mini"
                  onClick={handleDownloadModelo}
                  disabled={!templateSelecionado}
                >
                  {modoCliente === "com" ? "Baixar modelo clientes" : "Baixar modelo leads"}
                </button>
              </div>
            </div>

            <ClientsSelectedCard total={clientesSelecionados.length} />
          </div>

          <ToastContainer />

          <div className="PreviewMensagemTemplate">
            <MessagePreview message={previewMessage} />
          </div>
        </div>

        <div className="MyButton">
          <MyButtonAlert
            variant="success"
            text={modoCliente === "com" ? "Enviar" : "Enviar"}
            acao="Enviado com sucesso"
          />
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
