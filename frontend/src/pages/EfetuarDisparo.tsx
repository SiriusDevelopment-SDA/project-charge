"use client";

// React
import { useMemo, useState } from "react";

// Componentes globais
import Navbar from "../componente/global/Navbar";
import ClienteSelect from "../componente/filtrocliente";
import InputFileUpload from "../componente/importar-contatos";
import MessagePreview from "../componente/MessagePreview";
import MyButtonAlert from "../componente/MyButton";
import DropdownTemplate from "../componente/DropdownTemplate";
import DropdownCategoria from "../componente/DropdownCategoria";
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
  // ✅ AGORA É STRING[]
  const [clientesSelecionados, setClientesSelecionados] = useState<string[]>([]);
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
          <h1 className="pageTitle">Efetuar Disparo</h1>
          <button className="outline">Cliente sem cadastro</button>
        </div>

        <div className="box-wrapper">
          {/* 🔹 INPUTS + PREVIEW */}
          <div className="teste">
            <div className="boxInputs">
              <ClienteSelect
                onChangeClientes={setClientesSelecionados}
              >
                Buscar clientes no ERP
              </ClienteSelect>

              <DropdownTemplate
                onSelectTemplate={(template) => setTemplateSelecionado(template)}
              />



              <DropdownCategoria />
            </div>

            {/* CARD DE CONTADOR */}
            <ClientsSelectedCard total={clientesSelecionados.length} />
          </div>

          <ToastContainer />

          {/* 🔹 PREVIEW MENSAGEM */}
          <div className="PreviewMensagemTemplate">
            <MessagePreview message={previewMessage} />
          </div>

          {/* 🔹 UPLOAD */}
          <p className="UploadDescricao">
            Carregar arquivos TXT/CSV com números
          </p>

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
