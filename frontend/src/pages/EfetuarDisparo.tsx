"use client";

// React
import { useMemo, useState } from "react";

// Componentes globais
import Navbar from "../componente/global/Navbar";
import ClienteSelect from "../componente/filtrocliente";
import InputFileUpload from "../componente/importar-contatos";
// import InputNumber from "../componente/inputnumber";
import MessagePreview from "../componente/MessagePreview";
import MyButtonAlert from "../componente/MyButton";
import DropdownTemplate from "../componente/DropdownTemplate";
import DropdownCategoria from "../componente/DropdownCategoria";
// import VariablesPreview from "../componente/VariablesPreview";
import ClientsSelectedCard from "../componente/ClientsSelectedCard";

// Styles
import "../styles/importar-contatos.css";
import "../styles/EfetuarDisparo.css";
import "../styles/DropdownCategoria.css";

// Toastify
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

/* ===============================
   FUNÇÃO DE TEMPLATE
================================ */
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

export default function EfetuarDisparo() {
  const [clientesSelecionados, setClientesSelecionados] = useState<any[]>([]);
  const [templateSelecionado, setTemplateSelecionado] = useState<any>(null);

  const previewMessage = useMemo(() => {
    if (!templateSelecionado?.conteudo)
      return "Selecione um template para visualizar a mensagem";

    if (clientesSelecionados.length === 0)
      return "Selecione ao menos um cliente para visualizar a mensagem";

    const cliente = clientesSelecionados[0];

    return renderTemplate(templateSelecionado.conteudo, {
      nome: cliente.nome,
      valor: cliente.valor?.toFixed(2),
      fatura: cliente.fatura,
      data: cliente.data,
    });
  }, [clientesSelecionados, templateSelecionado]);

  return (
    <div>
      <Navbar />

      <div className="ContainerConteudo">
        <div className="navigation">
          <h1 className="pageTitle">Efetuar Disparo</h1>
          <button className="outline">Cliente sem cadastro</button>
        </div>

        <div className="box-wrapper">
          {/* 🔹 INPUTS + PREVIEW */}
          <div className="teste">
            <div className="boxInputs">
              <ClienteSelect
                className="ClienteSelectInput"
                onChangeClientes={(nomes) => {
                  const clientes = nomes.map((nome: string) => ({
                    nome,
                    valor: 99.9,
                    fatura: "FT-0000",
                    data: "31/12/2025",
                  }));
                  setClientesSelecionados(clientes);
                }}
              >
                Buscar clientes no ERP
              </ClienteSelect>

              {/* <InputNumber /> */}

              <DropdownTemplate
                onSelectTemplate={(template: any) =>
                  setTemplateSelecionado(template)
                }
              />

              <DropdownCategoria />
            </div>

            {/* <div className="VariablesPreviewBox">
              <VariablesPreview />
            </div> */}

            <ClientsSelectedCard total={0} />
            
            


          </div>

          <ToastContainer />

          {/* 🔹 PREVIEW MENSAGEM */}
          <div className="PreviewMensagemTemplate">
            <MessagePreview message={previewMessage} />
          </div>
          {/* 🔹 PREVIEW */}

          {/* 🔹 UPLOAD */}

          <p className="UploadDescricao">Carregar arquivos TXT/CSV com números</p>
          <div className="Box-Arquivo">
            <InputFileUpload />
          </div>
        </div>

        {/* 🔹 BOTÕES */}
        <div className="MyButton">
          <MyButtonAlert variant="success">Enviar</MyButtonAlert>
          <MyButtonAlert variant="danger">Cancelar</MyButtonAlert>
        </div>
      </div>
    </div>
  );
}
