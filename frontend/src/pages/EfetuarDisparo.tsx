import { useMemo, useState } from "react";
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
import "../styles/MyButtonGlobal.css"

// Toastify
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

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

export default function EfetuarDisparo({ page }: { page: string }) {
  const navigate = useNavigate();

  const [clientesSelecionados, setClientesSelecionados] = useState<any[]>([]);
  const [templateSelecionado, setTemplateSelecionado] = useState<any>(null);

  const previewMessage = useMemo(() => {
    if (!templateSelecionado?.conteudo)
      return "Selecione um template para visualizar a mensagem";

    if (clientesSelecionados.length === 0)
      return "Selecione ao menos um cliente para visualizar a mensagem";

    // 👇 agora é só o nome
    const nomeCliente = clientesSelecionados[0];

    return renderTemplate(templateSelecionado.conteudo, {
      nome: nomeCliente,
    });
  }, [clientesSelecionados, templateSelecionado]);

  return (
    <div>
      <Navbar />

      <div className="ContainerConteudo">
        <div className="navigation">
          <h1 className="pageTitle">{page === "disparo" ? "Efetuar Disparo" : "Cliente sem cadastro"}</h1>

          {/* 🔹 BOTÃO QUE REDIRECIONA */}
          <div><button className="outline" onClick={() => navigate("/efetuar-disparo-2")}>
            Cliente sem cadastro
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
            <div className="boxInputs" >
              {page === "disparo" && (
                <ClienteSelect onChangeClientes={setClientesSelecionados}>
                  Buscar clientes no ERP
                </ClienteSelect>
              )}


              {page === "disparo-2" && <InputNumber />}

              <DropdownTemplate
                onSelectTemplate={(template) => setTemplateSelecionado(template)}
              />



              <DropdownCategoria />
            </div>

            {/* CARD DE CONTADOR */}
            <ClientsSelectedCard total={clientesSelecionados.length} />
          </div>

          <ToastContainer />

          <div className="PreviewMensagemTemplate">
            <MessagePreview message={previewMessage} />
          </div>

          <p className="UploadDescricao">
            Carregar arquivos TXT/CSV com números
          </p>

          <div className="Box-Arquivo"> <InputFileUpload />


          </div>
        </div>

        <div className="MyButton">
          <MyButtonAlert variant="success" text="Enviar" />
          <MyButtonAlert variant="danger" text="Cancelar" />
        </div>
      </div>
    </div>
  );
}
