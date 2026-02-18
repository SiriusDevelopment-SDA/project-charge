import {  useMemo } from "react";
import { toast } from "react-toastify";

import type { Cliente, Template } from "../../types";

import {
  BaseCard,
  Dropdown,
  InputFields,
  Metricas,
  MyButton,
  PageContainer,
  TitlePage,
  MyCalendar,
  SwitchLabels,
  DownloadModeloButton,
  DynamicModal,
} from "../../componente/Index";

import Style from "./CriarCampanha.module.css";
import { Api } from "../../services/api";
import { useCampaign, useClient, useDispatchTemplate, useTemplate, useCategories } from "../../hooks";

export function CriarCampanha() {
  // const { templates } = useContext(TemplateContext);
  const { clients } = useClient();
  const { templates } = useTemplate()
  const {selectedTemplate, setSelectedTemplate} = useDispatchTemplate()
  const { categories } = useCategories()
  const {
    selectedClientes,
    setSelectedClientes,
    nomeCampanha,
    setNomeCampanha,
    horarioDisparoInicio,
    setHorarioDisparoInicio,
    horarioDisparoFim,
    setHorarioDisparoFim,
    dateRange,
    setDateRange,
    cobrancaRecorrente,
    setCobrancaRecorrente,
    openProsseguirModal,
    setOpenProsseguirModal,
    categoriaSelecionada,
    setCategoriaSelecionada,
    openClientes,
    setOpenClientes,
    openTemplate,
    setOpenTemplate,
    openCategoria,
    setOpenCategoria,
    modoPage,
    isSubmitting,
    setIsSubmitting,
  } = useCampaign()

  // ===============================
  // Validação pura (sem toast)
  // ===============================
  const formIsValid = useMemo(() => {
    return (
      nomeCampanha.trim() !== "" &&
      !!dateRange?.from &&
      !!dateRange?.to &&
      !!selectedTemplate &&
      !!categoriaSelecionada &&
      !!horarioDisparoInicio &&
      !!horarioDisparoFim &&
      selectedClientes.length > 0 &&
      horarioDisparoInicio < horarioDisparoFim
    );
  }, [
    nomeCampanha,
    dateRange,
    selectedTemplate,
    categoriaSelecionada,
    horarioDisparoInicio,
    horarioDisparoFim,
    selectedClientes,
  ]);

  // ===============================
  // Abrir modal apenas se válido
  // ===============================
  const handleSubmit = () => {
    if (!formIsValid) {
      // Mostrar erros específicos
      if (!nomeCampanha.trim()) {
        toast.error("Por favor, insira o nome da campanha");
        return;
      }
      if (!dateRange?.from || !dateRange?.to) {
        toast.error("Por favor, selecione o período da campanha no calendário");
        return;
      }
      if (!selectedTemplate) {
        toast.error("Por favor, selecione um template");
        return;
      }
      if (!categoriaSelecionada) {
        toast.error("Por favor, selecione uma categoria");
        return;
      }
      if (!horarioDisparoInicio || !horarioDisparoFim) {
        toast.error("Por favor, defina os horários de disparo");
        return;
      }
      if (horarioDisparoInicio >= horarioDisparoFim) {
        toast.error("O horário de início deve ser menor que o horário de fim");
        return;
      }
      if (selectedClientes.length === 0) {
        toast.error("Por favor, selecione pelo menos um cliente");
        return;
      }
      
      toast.error("Preencha todos os campos corretamente");
      return;
    }

    setOpenProsseguirModal(true);
  };

  // ===============================
  // Criar campanha
  // ===============================
  const handleCreateCampaign = async () => {
    if (isSubmitting) return;
    
    try {
      setIsSubmitting(true);
      
      if (!dateRange?.from || !dateRange?.to) return;
      
      const payload = {
        name: nomeCampanha,
        company: selectedClientes[0].company?.id || "",
        templateId: selectedTemplate!.id,
        categoryId: categoriaSelecionada!.id,
        startDate: dateRange.from.toISOString(),
        endDate: dateRange.to.toISOString(),
        dispatchStartTime: horarioDisparoInicio,
        dispatchEndTime: horarioDisparoFim,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        recurring: cobrancaRecorrente,
        client: selectedClientes.map((c) => c.id),
      };
      
      await Api.post("/campaigns", payload);

      toast.success("Campanha criada com sucesso!");
      
      // Limpar formulário
      setNomeCampanha("");
      setHorarioDisparoInicio("");
      setHorarioDisparoFim("");
      setDateRange(undefined);
      setCobrancaRecorrente(false);
      setSelectedTemplate(null);
      setCategoriaSelecionada(null);
      setSelectedClientes([]);
    } catch (error: any) {
      console.error('Erro:', error);
      
      const errorMessage = error?.response?.data?.message;
      const displayMessage = Array.isArray(errorMessage) 
        ? errorMessage.join(', ')
        : errorMessage || "Erro ao criar campanha.";
      
      toast.error(displayMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ===============================
  // Reset formulário
  // ===============================
  const handleCancel = () => {
    setNomeCampanha("");
    setHorarioDisparoInicio("");
    setHorarioDisparoFim("");
    setDateRange(undefined);
    setCobrancaRecorrente(false);
    setSelectedTemplate(null);
    setCategoriaSelecionada(null);
    setSelectedClientes([]);
  };

  return (
    <PageContainer className={Style.createCampaign}>
      <div className={Style.createCampaign__header}>
        <TitlePage title="Criar Campanha" />

        <BaseCard classname={Style.createCampaign__metricsCard}>
          <Metricas
            chave={
              modoPage === "clientes"
                ? "Clientes selecionados"
                : "Leads selecionados"
            }
            valor={String(selectedClientes.length)}
            classname={Style.createCampaign__metricsContent}
          />
        </BaseCard>
      </div>

      <div className={Style.createCampaign__form}>
        <h3>Dados da Campanha</h3>

        <InputFields
          label="Nome da Campanha"
          value={nomeCampanha}
          onChange={(e) => setNomeCampanha(e.target.value)}
        />

        <div className={Style.createCampaign__grid}>
          <div className={Style.createCampaign__calendar}>
            <MyCalendar selected={dateRange} onSelect={setDateRange} />
          </div>

          <div className={Style.createCampaign__schedule}>
            <div className={Style.createCampaign__scheduleTime}>
              <div>
                <span>Horário de disparo</span>
                <InputFields
                  type="time"
                  value={horarioDisparoInicio}
                  onChange={(e) => setHorarioDisparoInicio(e.target.value)}
                  required
                />
              </div>

              <div>
                <span>Horário de disparo </span>
                <InputFields
                  type="time"
                  value={horarioDisparoFim}
                  onChange={(e) => setHorarioDisparoFim(e.target.value)}
                  required
                />
              </div>
            </div>

            <SwitchLabels
              checked={cobrancaRecorrente}
              onChange={setCobrancaRecorrente}
            />

            <Dropdown
              label="Template da Mensagem"
              options={templates}
              value={selectedTemplate}
              onChange={(value) => setSelectedTemplate(value as Template)}
              open={openTemplate}
              onOpen={() => setOpenTemplate(true)}
              onClose={() => setOpenTemplate(false)}
              searchable
            />

            <Dropdown
              label="Categoria"
              options={categories}
              value={categoriaSelecionada}
              onChange={(value) =>
                setCategoriaSelecionada(value as any)
              }
              open={openCategoria}
              onOpen={() => setOpenCategoria(true)}
              onClose={() => setOpenCategoria(false)}
            />
          </div>
        </div>

        <div className={Style.createCampaign__selectedClients}>
          <Dropdown<Cliente>
            label="Selecionar Clientes"
            className={Style.createCampaign__selectedClientsDropdown}
            options={clients}
            selected={selectedClientes}
            onChange={(value) =>
              setSelectedClientes(value as Cliente[])
            }
            open={openClientes}
            onOpen={() => setOpenClientes(true)}
            onClose={() => setOpenClientes(false)}
            multiple
            searchable
          />

          <DownloadModeloButton
            templateSelecionado={selectedTemplate}
            modo={modoPage}
          />
        </div>
      </div>

      {openProsseguirModal && (
        <DynamicModal
          open={openProsseguirModal}
          type="warning"
          title="Confirmação"
          description={
            <>Deseja realmente criar esta campanha?</>
          }
          onClose={() => setOpenProsseguirModal(false)}
          buttons={[
            {
              label: "Cancelar",
              variant: "danger",
              onClick: () => setOpenProsseguirModal(false),
            },
            {
              label: "Confirmar",
              variant: "success",
              onClick: async () => {
                setOpenProsseguirModal(false);
                await handleCreateCampaign();
              },
            },
          ]}
        />
      )}

      <div className={Style.createCampaign__actions}>
        <MyButton
          text="Cancelar"
          variant="btn-cancelar"
          onClick={handleCancel}
        />

        <MyButton
          text="Enviar"
          variant="btn-enviar"
          onClick={handleSubmit}
        />
      </div>
    </PageContainer>
  );
}
