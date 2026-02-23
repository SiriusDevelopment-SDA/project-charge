import {  useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  MyTimePicker,
  SwitchLabels,
  DownloadModeloButton,
  DynamicModal,
  UploadButton,
} from "../../componente/Index";

import Style from "./CriarCampanha.module.css";
import { Api } from "../../services/api";
import { useCampaign, useClient, useDispatchTemplate, useTemplate, useCategories } from "../../hooks";

export function CriarCampanha() {
  const navigate = useNavigate();
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
  const [openTimePicker, setOpenTimePicker] = useState(false);

  // ===============================
  // Validação pura (sem toast)
  // ===============================
  const formIsValid = useMemo(() => {
    const temData = cobrancaRecorrente
      ? !!dateRange?.from && !!dateRange?.to
      : !!dateRange?.from;

    return (
      nomeCampanha.trim() !== "" &&
      temData &&
      !!selectedTemplate &&
      !!categoriaSelecionada &&
      !!horarioDisparoInicio &&
      selectedClientes.length > 0 &&
      true
    );
  }, [
    nomeCampanha,
    dateRange,
    cobrancaRecorrente,
    selectedTemplate,
    categoriaSelecionada,
    horarioDisparoInicio,
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
      if (!dateRange?.from || (cobrancaRecorrente && !dateRange?.to)) {
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
      if (!horarioDisparoInicio) {
        toast.error("Por favor, defina o horário de disparho");
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
      
      const endDate = cobrancaRecorrente
        ? dateRange.to.toISOString()
        : dateRange.from.toISOString();

      const computeEndTime = (time: string) => {
        const [hh, mm] = time.split(":").map((v) => parseInt(v, 10));
        const date = new Date();
        date.setHours(hh);
        date.setMinutes(mm + 1);
        const pad = (n: number) => n.toString().padStart(2, "0");
        return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
      };

      const payload = {
        name: nomeCampanha,
        company: selectedClientes[0].company?.id || "",
        templateId: selectedTemplate!.id,
        categoryId: categoriaSelecionada!.id,
        startDate: dateRange.from.toISOString(),
        endDate,
        dispatchStartTime: horarioDisparoInicio,
        dispatchEndTime: computeEndTime(horarioDisparoInicio),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        recurring: cobrancaRecorrente,
        client: selectedClientes.map((c) => c.id),
      };
      
      await Api.post("/campaigns", payload);

      toast.success("Campanha criada com sucesso!");

      // Limpar formulário
      setNomeCampanha("");
      setHorarioDisparoInicio("");
      setDateRange(undefined);
      setCobrancaRecorrente(false);
      setSelectedTemplate(null);
      setCategoriaSelecionada(null);
      setSelectedClientes([]);

      // Redirecionar para campanhas
      navigate("/campanhas");
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
            {cobrancaRecorrente ? (
              <MyCalendar
                mode="range"
                selected={dateRange}
                onSelect={setDateRange}
              />
            ) : (
              <MyCalendar
                mode="single"
                selectedSingle={dateRange?.from}
                onSelectSingle={(date) =>
                  setDateRange(date ? { from: date, to: date } : undefined)
                }
              />
            )}
          </div>

          <div className={Style.createCampaign__schedule}>
              <div className={Style.createCampaign__scheduleTime}>
                <div>
                  <span>Horário de disparo</span>
                  <div className={Style.timeInputBox} onClick={() => setOpenTimePicker(true)} role="button">
                    <div className={Style.timeInputValue}>{horarioDisparoInicio || "--:--"}</div>
                    <div className={Style.timeInputIcon}>⏱</div>
                  </div>
                </div>
              </div>

            <SwitchLabels
              checked={cobrancaRecorrente}
              onChange={(val) => {
                setCobrancaRecorrente(val);
                setDateRange(undefined);
              }}
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
            summaryOnMultiple
          />

          <DownloadModeloButton
            templateSelecionado={selectedTemplate}
            modo={modoPage}
          />

          <UploadButton onUpload={(file, rows) => {
            console.log('Arquivo enviado:', file, rows);
          }} />
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

      {openTimePicker && (
        <DynamicModal
          open
          type="custom"
          title="Selecione o Horário"
          onClose={() => setOpenTimePicker(false)}
          customContent={
            <>
              <MyTimePicker selected={horarioDisparoInicio} onSelect={(t) => setHorarioDisparoInicio(t)} />
              <div style={{display:'flex',justifyContent:'center',marginTop:12}}>
                <button className={Style.timepickerCloseBtn} onClick={() => setOpenTimePicker(false)}>Fechar</button>
              </div>
            </>
          }
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
