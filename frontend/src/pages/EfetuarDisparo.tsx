"use client";

// React
import { useMemo, useState } from "react";

// Componentes globais
import Navbar from "../componente/global/Navbar";
import ClienteSelect from "../componente/filtrocliente";
import InputFileUpload from "../componente/importar-contatos";
import InputNumber from "../componente/inputnumber";
import MessagePreview from "../componente/MessagePreview";
import MyButtonAlert from "../componente/MyButton";
import PaginationLink from "../componente/pagination";
import DropdownTemplate from "../componente/DropdownTemplate";
import DropdownCategoria from "../componente/DropdownCategoria";

// Styles
import "../styles/importar-contatos.css";
import "../styles/EfetuarDisparo.css";
import "../styles/DropdownCategoria.css"

// MUI
import Button from "@mui/material/Button";

// Toastify
import { ToastContainer, toast, Bounce } from "react-toastify";
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
  /* ===============================
     ESTADOS PRINCIPAIS
  ================================ */
  const [clientesSelecionados, setClientesSelecionados] = useState<any[]>([]);
  const [templateSelecionado, setTemplateSelecionado] = useState<any>(null);

  /* ===============================
     PREVIEW DINÂMICO
  ================================ */
  const previewMessage = useMemo(() => {
    if (!templateSelecionado)
      return "Selecione um template para visualizar a mensagem";

    if (!templateSelecionado?.conteudo)
      return "Selecione um template válido para visualizar a mensagem";

    if (clientesSelecionados.length === 0)
      return "Selecione ao menos um cliente para visualizar a mensagem";

    const cliente = clientesSelecionados[0]; // preview sempre usa 1 cliente

    return renderTemplate(templateSelecionado.conteudo, {
      nome: cliente.nome,
      valor: cliente.valor?.toFixed(2),
      fatura: cliente.fatura,
      data: cliente.data,
    });
  }, [clientesSelecionados, templateSelecionado]);

  /* ===============================
     TOAST
  ================================ */
  const showToast = () => {
    toast.warn("20 clientes sem contato cadastrado!", {
      position: "top-right",
      autoClose: 5000,
      theme: "dark",
      transition: Bounce,
    });
  };

  return (
    <div>
      <Navbar />

      <div className="ContainerConteudo">
        <h1 className="pageTitle">Efetuar Disparo</h1>

        <div className="box-wrapper">
          {/* 🔹 CLIENTES */}
          <ClienteSelect
            className="botaoHome"
            onChangeClientes={(nomes) => {
              // 🔥 MOCK DINÂMICO (não quebra preview)
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

          {/* 🔹 INPUT NUMÉRICO */}
          <div style={{ marginTop: 16 }}>
            <InputNumber />
          </div>

          {/* 🔹 CATEGORIA + TEMPLATE */}
         <DropdownTemplate onSelectTemplate={(template: any) => {setTemplateSelecionado(template);}}/>
          <div className="DropdownCategoria"><DropdownCategoria/></div>
          

          {/* 🔹 PAGINAÇÃO */}
          <div style={{ marginTop: 16 }}>
            <PaginationLink />
          </div>

          <ToastContainer />

          {/* 🔹 PREVIEW */}
          <div className="PreviewMensagemTemplate">
            <MessagePreview message={previewMessage} />
          </div>

          {/* 🔹 UPLOAD + ALERT */}
          <div className="box-wrapper">
            <Button variant="contained" onClick={showToast}>
              Alert
            </Button>

            <InputFileUpload
              label="Carregar arquivos TXT/CSV com números"
              style={{ display: "flex" }}
            />
          </div>
        </div>

        {/* 🔹 BOTÕES FINAIS */}
        <div className="MyButton">
          <MyButtonAlert variant="success">Enviar</MyButtonAlert>
          <MyButtonAlert variant="danger">Cancelar</MyButtonAlert>
        </div>
      </div>
    </div>
  );
}
