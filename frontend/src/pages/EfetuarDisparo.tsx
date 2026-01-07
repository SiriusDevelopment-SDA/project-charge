import { useMemo, useState } from "react";

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
   Função para renderizar template
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
  // 🔥 controla o modo da tela
  const [modoCliente, setModoCliente] = useState<"com" | "sem">("com");

  const [clientesSelecionados, setClientesSelecionados] = useState<any[]>([]);
  const [templateSelecionado, setTemplateSelecionado] = useState<any>(null);

  /* ======================================================
     Preview da mensagem
  ====================================================== */
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

  /* ======================================================
     Toggle Cliente com / sem cadastro
  ====================================================== */
  function toggleModoCliente() {
    setModoCliente((prev) => (prev === "com" ? "sem" : "com"));
    setClientesSelecionados([]); // 🔥 reseta seleção ao trocar
  }

  return (
    <div>
      <Navbar />

      <div className="ContainerConteudo">
        {/* ======================================================
            TOPO / NAVEGAÇÃO
        ====================================================== */}
        <div className="navigation">
          <h1 className="pageTitle">
            {modoCliente === "com"
              ? "Efetuar Disparo"
              : "Cliente sem cadastro"}
          </h1>

          <div className="buttons-navigation">
            <button className="outline" onClick={toggleModoCliente}>
              {modoCliente === "com"
                ? "Cliente sem cadastro"
                : "Cliente com cadastro"}
            </button>

            <button className="outline">Histórico</button>
          </div>
        </div>

        {/* ======================================================
            CONTEÚDO
        ====================================================== */}
        <div className="box-wrapper">
          <div className="teste">
            <div className="boxInputs">
              {/* CLIENTE COM CADASTRO */}
              {modoCliente === "com" && (
                <ClienteSelect onChangeClientes={setClientesSelecionados}>
                  Buscar clientes no ERP
                </ClienteSelect>
              )}

              {/* CLIENTE SEM CADASTRO */}
              {modoCliente === "sem" && (
                <div className="InputNumber">
                  <InputNumber />
                </div>
              )}

              <DropdownTemplate
                onSelectTemplate={(template) =>
                  setTemplateSelecionado(template)
                }
              />

              <DropdownCategoria />
            </div>

            {/* CONTADOR */}
            <ClientsSelectedCard total={clientesSelecionados.length} />
          </div>

          <ToastContainer />

          {/* PREVIEW */}
          <div className="PreviewMensagemTemplate">
            <MessagePreview message={previewMessage} />
          </div>

          <p className="UploadDescricao">
            Carregar arquivos TXT/CSV com números
          </p>

          <div className="Box-Arquivo">
            <InputFileUpload />
          </div>
        </div>

        {/* ======================================================
            BOTÕES
        ====================================================== */}
        <div className="MyButton">
          <MyButtonAlert variant="success" text="Enviar" />
          <MyButtonAlert variant="danger" text="Cancelar" />
        </div>
      </div>
    </div>
  );
}
