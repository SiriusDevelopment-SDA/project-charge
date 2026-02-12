import { useContext, useState } from "react";
import { toast } from "react-toastify";
import type { DateRange } from "react-day-picker";
// Types
import type { Cliente, Template } from "../../types";
// Componentes
import { BaseCard, Dropdown, InputFields, Metricas, MyButton, PageContainer, TitlePage, MyCalendar, SwitchLabels, DownloadModeloButton, } from "../../componente/Index";
// Styles
import Style from "./CriarCampanha.module.css"
// hooks
import { TemplateContext } from "../../context/contextTemplates";

export function CriarCampanha() {
    const { templates } = useContext(TemplateContext);

    // Estados para seleção de clientes/leads
    const [selectedClientes] = useState<Cliente[]>([]);
    const [modoPage] = useState<"clientes" | "leads">("clientes");

    // Estados do formulário da campanha
    const [nomeCampanha, setNomeCampanha] = useState("");
    const [horarioDisparo, setHorarioDisparo] = useState("");
    const [dateRange, setDateRange] = useState<DateRange | undefined>();
    const [cobrancaRecorrente, setCobrancaRecorrente] = useState(false);

    // Estados para controle dos dropdowns
    const [openTemplate, setOpenTemplate] = useState(false);
    const [openCategoria, setOpenCategoria] = useState(false);

    // Estados de seleção dos dropdowns
    const [templateSelecionado, setTemplateSelecionado] = useState<Template | null>(null);

    const [categoriaSelecionada, setCategoriaSelecionada] = useState<{
        id: string;
        name: string;
        category?: string;
    } | null>(null);

    // Mock de categorias disponíveis
    const categoriasMock = [
        { id: "1", name: "Cobrança", category: "Cobrança" },
        { id: "2", name: "Marketing", category: "Marketing" },
        { id: "3", name: "Informativo", category: "Informativo" },
        { id: "4", name: "Relacionamento", category: "Relacionamento" },
    ];

    // Função para criar a campanha com validações
    const handleCreateCampaign = () => {
        if (!nomeCampanha.trim()) {
            toast.error("Por favor, insira o nome da campanha!");
            return;
        }

        if (!dateRange?.from) {
            toast.error("Por favor, selecione a data de início da campanha!");
            return;
        }

        if (!dateRange?.to) {
            toast.error("Por favor, selecione a data de término da campanha!");
            return;
        }

        if (!templateSelecionado) {
            toast.error("Por favor, selecione um template!");
            return;
        }

        if (!categoriaSelecionada) {
            toast.error("Por favor, selecione uma categoria!");
            return;
        }

        if (!horarioDisparo) {
            toast.error("Por favor, defina o horário de disparo!");
            return;
        }

        if (selectedClientes.length === 0) {
            toast.warning("Nenhum cliente selecionado!");
            return;
        }

        toast.success("Campanha criada com sucesso!");
    };

    // Função para cancelar e limpar o formulário
    const handleCancel = () => {
        setNomeCampanha("");
        setHorarioDisparo("");
        setDateRange(undefined);
        setCobrancaRecorrente(false);
        setTemplateSelecionado(null);
        setCategoriaSelecionada(null);
        toast.info("Formulário cancelado e limpo!");
    };



    return (
        // Container principal da página
        <PageContainer className={Style.createCampaign}>
            {/* Cabeçalho da página com título e card de métricas */}
            <div className={Style.createCampaign__header}>
                <TitlePage title="Criar Campanha" />

                {/* Card mostrando quantidade de clientes/leads selecionados */}
                <BaseCard classname={Style.createCampaign__metricsCard}>
                    <Metricas
                        chave={modoPage === "clientes"
                            ? "Clientes selecionados"
                            : "Leads selecionados"}
                        valor={String(selectedClientes.length)}
                        classname={Style.createCampaign__metricsContent}
                    />
                </BaseCard>
            </div>

            {/* Formulário principal da campanha */}
            <div className={Style.createCampaign__form}>
                <h3>Dados da Campanha</h3>

                {/* Input para nome da campanha */}
                <InputFields
                    label="Nome da Campanha"
                    value={nomeCampanha}
                    onChange={(e) => setNomeCampanha(e.target.value)}
                />

                {/* Grid dividido em duas colunas: calendário e campos de configuração */}
                <div className={Style.createCampaign__grid}>
                    {/* Coluna do calendário para seleção de datas */}
                    <div className={Style.createCampaign__calendar}>
                        <MyCalendar
                            selected={dateRange}
                            onSelect={setDateRange}
                        />
                    </div>

                    {/* Coluna com campos de configuração da campanha */}
                    <div className={Style.createCampaign__schedule}>
                        {/* Campo de horário de disparo */}
                        <div>
                            <span>Horário de disparo diário</span>
                            <InputFields
                                type="time"
                                value={horarioDisparo}
                                onChange={(e) => setHorarioDisparo(e.target.value)}
                            />
                        </div>

                        {/* Switch para cobrança recorrente */}
                        <SwitchLabels
                            checked={cobrancaRecorrente}
                            onChange={setCobrancaRecorrente}
                        />

                        {/* Dropdown para selecionar template da mensagem */}
                        <Dropdown
                            label="Template da Mensagem"
                            options={templates}
                            value={templateSelecionado}
                            onChange={(value) => setTemplateSelecionado(value as Template)}
                            open={openTemplate}
                            onOpen={() => setOpenTemplate(true)}
                            onClose={() => setOpenTemplate(false)}
                            searchable={true}
                        />

                        {/* Dropdown para selecionar categoria */}
                        <Dropdown
                            label="Categoria"
                            options={categoriasMock}
                            value={categoriaSelecionada}
                            onChange={(value) => setCategoriaSelecionada(value as any)}
                            open={openCategoria}
                            onOpen={() => setOpenCategoria(true)}
                            onClose={() => setOpenCategoria(false)}
                        />
                    </div>
                </div>

                {/* Área para clientes selecionados e botão de download do modelo */}
                <div className={Style.createCampaign__selectedClients}>
                    {/* Dropdown mostrando clientes/leads selecionados */}
                    <Dropdown<Cliente>
                        label={modoPage === "clientes" ? "Clientes Selecionados" : "Leads Selecionados"}
                        className={Style.createCampaign__selectedClientsDropdown}
                        options={selectedClientes}
                        value={null}
                        onChange={() => { }}
                        open={false}
                        onOpen={() => { }}
                        onClose={() => { }}
                        multiple={true}
                    />

                    {/* Botão para baixar modelo de planilha */}
                    <DownloadModeloButton
                        templateSelecionado={templateSelecionado}
                        modo={modoPage}
                    />
                </div>
            </div>

            {/* Botões de ação (Cancelar e Enviar) */}
            <div className={Style.createCampaign__actions}>
                <MyButton text="Cancelar" variant="btn-cancelar" onClick={handleCancel} />
                <MyButton text="Enviar" variant="btn-enviar" onClick={handleCreateCampaign} />
            </div>
        </PageContainer>

    );
}
