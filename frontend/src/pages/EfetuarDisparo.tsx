import { useMemo, useState, useEffect } from "react";
import * as XLSX from "xlsx";
import { useNavigate } from "react-router-dom";
//  import { clientesMock } from "../componente/filtrocliente";



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

import "react-toastify/dist/ReactToastify.css";
 import type { Template } from "../types";
import DropdownPersonalized from "../componente/Dropdown"
import { useClient, useTemplate } from "../hooks";

/* ======================================================
   Página
====================================================== */
export default function EfetuarDisparo() {
  const navigate = useNavigate();
  const { clients } = useClient()
  const { templates } = useTemplate()

  // Vamos sempre armazenar CPF LIMPO aqui
  const [modoCliente, setModoCliente] = useState<"cliente" | "lead">("cliente");
  const [clientesSelecionados, setClientesSelecionados] = useState<any[]>([]);
  const [templateSelecionado, setTemplateSelecionado] = useState<Template | undefined>(undefined);
  const [openTemplate, setOpenTemplate] = useState(false)
  // const [resetKey, setResetKey] = useState(0);
  const [openDropdownCliente, setOpenDropdownCliente] = useState(false);
  const previewMessage = "teste"

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
  // const previewMessage = useMemo(() => {
  //   if (!templateSelecionado?.conteudo)
  //     return "Selecione um template para visualizar a mensagem";

  //   if (modoCliente === "cliente" && clientesSelecionados.length === 0)
  //     return "Selecione ao menos um cliente para visualizar a mensagem";

  //   const cpfSelecionado = clientesSelecionados[0];

  //   const clienteObj = clientes.clients?.find((c: Cliente) => c.cnpj_cpf.replace(/\D/g, "") === cpfSelecionado);

  //   const nomeCliente = clienteObj?.name || "Cliente";

  //   return renderTemplate(templateSelecionado.conteudo, {
  //     nome: nomeCliente,
  //   });
  // }, [clientesSelecionados, templateSelecionado, modoCliente]);

  /* ================= AÇÕES ================= */
  function toggleModoCliente() {
    setModoCliente((prev) => (prev === "cliente" ? "lead" : "cliente"));
    setClientesSelecionados([]);
    setTemplateSelecionado(undefined);
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

    for (let i = 1; i <= TOTAL_LINHAS; i++) {
      const cellAddress = `A${i}`;
      if (!ws[cellAddress]) ws[cellAddress] = { t: "s", v: "" };
      ws[cellAddress].z = '000"."000"."000"-"00';
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Contatos");
    XLSX.writeFile(wb, modoCliente === "cliente" ? "modelo_clientes.xlsx" : "modelo_leads.xlsx");
  }

  return (
    <div>
      <Navbar />

      <div className="ContainerConteudo">
        <div className="navigation">
          <h1 className="pageTitle">
            {modoCliente === "cliente"
              ? "Disparo clientes ativos"
              : "Disparo nova lead"}
          </h1>

          <div className="buttons-navigation">
            <button className="outline" onClick={toggleModoCliente}>
              {modoCliente !== "cliente" ? "Cliente com cadastro" : "Nova lead" }
            </button>

            <button className="outline" onClick={() => navigate("/historicodisparo")}>
              Historico
            </button>
          </div>
        </div>

        <div className="box-wrapper">
          <div className="teste">
              <div className="boxInputs">

                {/* 🔹 Componente Template */}
                <DropdownPersonalized
                  templates={templates}
                  setOpenState={setOpenTemplate}
                  open={openTemplate}
                  FilterButtonProp={true}
                  setTemplateSelecionado={setTemplateSelecionado}
                  templateSelecionado={templateSelecionado}
                />

                {modoCliente === "cliente" && (
                  <ClienteSelect
                    disabled={!templateSelecionado}
                    clientes={clients}
                    selected={clientesSelecionados}
                    setSelected={setClientesSelecionados}
                    open={openDropdownCliente}
                    setOpen={setOpenDropdownCliente}
                  >
                    Buscar clientes no ERP
                  </ClienteSelect>
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
                  <InputFileUpload
                    clientes={clients ?? []}
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
                  {modoCliente === "cliente" ? "Baixar modelo clientes" : "Baixar modelo leads"}
                </button>
              </div>
            </div>

            <ClientsSelectedCard total={clientesSelecionados.length} />
          </div>

          <div className="PreviewMensagemTemplate">
            <MessagePreview message={previewMessage} />
          </div>
        </div>

        <div className="MyButton">
          <MyButtonAlert
            variant="success"
            text={"Enviar"}
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
