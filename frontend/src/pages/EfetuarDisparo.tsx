
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
// import { extractTemplateVars } from "../utils/template";


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
import { extractTemplateVars } from "../utils/template";

/* ======================================================
   MOCK — cliente do ERP (pode ser via API futuramente)
====================================================== */
type ClienteERP = {
  nome: string;
  cpf: string;
  telefone: string;
};



const clientesERP: ClienteERP[] = [

  { nome: "Ana Pereira", cpf: "111.111.111-11", telefone: "(11) 90001-0001" },
  { nome: "Bruno Dias", cpf: "222.222.222-22", telefone: "(11) 90002-0002" },
  { nome: "Carlos Souza", cpf: "333.333.333-33", telefone: "(11) 90003-0003" },
  { nome: "Daniel Rocha", cpf: "444.444.444-44", telefone: "(11) 90004-0004" },
  { nome: "Eduardo Lima", cpf: "555.555.555-55", telefone: "(11) 90005-0005" },
  { nome: "Felipe Martins", cpf: "666.666.666-66", telefone: "(11) 90006-0006" },
  { nome: "Gabriel Alves", cpf: "777.777.777-77", telefone: "(11) 90007-0007" },
  { nome: "Henrique Costa", cpf: "888.888.888-88", telefone: "(11) 90008-0008" },
  { nome: "Igor Nunes", cpf: "999.999.999-99", telefone: "(11) 90009-0009" },
  { nome: "João Vitor", cpf: "123.456.789-00", telefone: "(11) 91234-5678" },
  { nome: "Kleber Teixeira", cpf: "234.567.890-01", telefone: "(11) 90010-0010" },
  { nome: "Lucas Santos", cpf: "987.654.321-00", telefone: "(21) 99876-5432" },
  { nome: "Maria Silva", cpf: "456.789.123-00", telefone: "(31) 93456-7890" },
  { nome: "Natália Ribeiro", cpf: "567.890.234-11", telefone: "(41) 90011-0011" },
  { nome: "Otávio Mendes", cpf: "678.901.345-22", telefone: "(51) 90012-0012" },
  { nome: "Paulo Henrique", cpf: "789.012.456-33", telefone: "(61) 90013-0013" },
  { nome: "Queila Fernandes", cpf: "890.123.567-44", telefone: "(71) 90014-0014" },
  { nome: "Rafael Almeida", cpf: "901.234.678-55", telefone: "(81) 90015-0015" },
  { nome: "Sofia Rocha", cpf: "012.345.789-66", telefone: "(91) 90016-0016" },
  { nome: "Thiago Carvalho", cpf: "147.258.369-77", telefone: "(11) 90017-0017" },
  { nome: "Ubirajara Lopes", cpf: "258.369.147-88", telefone: "(21) 90018-0018" },
  { nome: "Vinícius Cunha", cpf: "369.147.258-99", telefone: "(31) 90019-0019" },
  { nome: "Wesley Pacheco", cpf: "741.852.963-10", telefone: "(41) 90020-0020" },
  { nome: "Xavier Monteiro", cpf: "852.963.741-21", telefone: "(51) 90021-0021" },
  { nome: "Yasmin Azevedo", cpf: "963.741.852-32", telefone: "(61) 90022-0022" },
  { nome: "Zuleica Barros", cpf: "159.357.486-43", telefone: "(71) 90023-0023" },
  { nome: "Zuleica Barros2", cpf: "44.651.737/0001-40", telefone: "(71) 90023-0023" },
];

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

  // Vamos sempre armazenar CPF LIMPO aqui
  const [modoCliente, setModoCliente] = useState<"com" | "sem">("com");
  const [clientesSelecionados, setClientesSelecionados] = useState<any[]>([]);
  const [templateSelecionado, setTemplateSelecionado] =
    useState<Template | null>(null);
  const [openTemplate, setOpenTemplate] = useState(false)
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

    const cpfSelecionado = clientesSelecionados[0];

    const clienteObj = clientesERP.find(
      (c) => c.cpf.replace(/\D/g, "") === cpfSelecionado
    );

    const nomeCliente = clienteObj?.nome || "Cliente";

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
function handleDownloadModelo(templateSelecionado: Template | null) {
  if (!templateSelecionado) return;
  console.log("Template Selecionado:", templateSelecionado);
  
  // Extraindo as variáveis do template
  const vars = extractTemplateVars(templateSelecionado.conteudo);
  console.log("Vars:", vars);

  // MODO CLIENTE (com CPF/CNPJ)
  if (modoCliente) {
    const TOTAL_LINHAS = 500;

    // Criando as linhas para a planilha com cabeçalho de "CPF/CNPJ" e "Status"
    const rows = Array.from({ length: TOTAL_LINHAS }, () => ({
    
      "Status": "",
    }));

    const ws = XLSX.utils.json_to_sheet(rows, { header: modoCliente === "com" ? ["CPF/CNPJ"] : ["Telefone",...vars] });

    ws["!cols"] = [
      { wch: 26 }, // CPF/CNPJ
      { wch: 12 }, // Status
    ];

    // Formatação de CPF e CNPJ
    const docFormat =
      '[>=10000000000000]00"."000"."000"/"0000"-"00;000"."000"."000"-"00';

    // Função para limpar CPF/CNPJ e remover caracteres como "." "-" "/" e " "
    const clean = (cell: string) =>
      `SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(${cell},".",""),"-",""),"/","")," ","")`;

    // Aplicando a formatação e validação nas células
    for (let i = 2; i <= TOTAL_LINHAS + 1; i++) {
      const a = `A${i}`; // CPF/CNPJ

      if (!ws[a]) ws[a] = { t: "n" };
      ws[a].z = docFormat;

      const c = `B${i}`; // Status
      const cleaned = clean(a);
      ws[c] = {
        t: "s",
        f: `IF(${a}="","",IF(OR(LEN(${cleaned})=11,LEN(${cleaned})=14),"OK","INVÁLIDO"))`,
      };
    }

    // Criando o arquivo e salvando
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Contatos");
    XLSX.writeFile(wb, `modelo_clientes.xlsx`);
  }
  
  return;
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
                    clientes={clientesERP}
                    selected={clientesSelecionados}
                    setSelected={setClientesSelecionados}
                    onChangeClientes={(novos) => setClientesSelecionados(novos)}
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
                    clientesERP={clientesERP}
                    onClientesImportados={(validos) => {
                      setClientesSelecionados((prev) =>
                        Array.from(new Set([...prev, ...validos]))
                      );
                    }}
                  />
                </div>

                <button
                  className="btn-mini"
                  onClick={() => {
                    handleDownloadModelo(templateSelecionado);
                    console.log("Download modelo acionado");
                  }}
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
