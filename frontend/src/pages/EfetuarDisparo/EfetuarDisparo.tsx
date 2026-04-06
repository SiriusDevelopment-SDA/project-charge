import { useEffect, useState } from "react";
import Style from "../EfetuarDisparo/Styles/EfetuarDisparo.module.css";
import type { Cliente, Template } from "../../types";
import {
  AttendantNameModalContent,
  PageContainer,
  BaseCard,
  Metricas,
  TitlePage,
  Dropdown,
  PreviewBox,
  UploadButton,
  DownloadModeloButton,
  DispatchPreviewContent,
  InputFields,
  MyButton,
  DynamicModal,
} from "../../componente/Index";
import { useDispatchPageController } from "../../hooks/controller/dispatch/useDispatchPageController";
import { isTemplateApproved } from "../../utils/templateStatus";

export default function EfetuarDisparo() {
  const [isBatchCardDismissed, setIsBatchCardDismissed] = useState(false);
  const {
    dispatch,
    manualLead,
    openDropdown,
    setOpenDropdown,
    isDispatchPreviewOpen,
    setIsDispatchPreviewOpen,
    openDispatchAttendantModal,
    setOpenDispatchAttendantModal,
    isFinishedBatch,
    previewAudienceCount,
    previewMessage,
    batchLabel,
    searchTemplateName,
    setSearchTemplateName,
    categoryTemplateFilter,
    setCategoryTemplateFilter,
    templateTypeFilter,
    setTemplateTypeFilter,
    filteredTemplates,
    categories,
    isClientDisabled,
    clients,
    handleClientSearch,
    handleCloseFloatingMenus,
    handleClientsChange,
    handleLeadUpload,
    handleOpenDispatchPreview,
    handleConfirmDispatchPreview,
    handleOpenBatchHistory,
    handleConfirmAttendant,
  } = useDispatchPageController();

  useEffect(() => {
    setIsBatchCardDismissed(false);
  }, [dispatch.activeDispatchBatch?.id]);

  return (
    <PageContainer className={Style.EfeturarDisparoContainer}>
      <TitlePage
        title={
          dispatch.modoPage === "clientes"
            ? "Disparo Manual"
            : "Disparo para leads"
        }
        subtitle={
          dispatch.modoPage === "clientes"
            ? "Envie mensagens para clientes com controle total"
            : "Envie mensagens diretas para leads com template validado"
        }
        className={Style.navTitlePage}
        setModoPage={dispatch.setModoPage}
        text={
          dispatch.modoPage === "clientes"
            ? "Disparo para leads"
            : "Disparo Manual"
        }
      />

      <div className={Style.containerCenter} onClick={handleCloseFloatingMenus}>
        <div className={Style.containerCenterTop}>
          <div className={Style.containerInput} onClick={(e) => e.stopPropagation()}>
            <Dropdown<Template>
              label="Buscar template"
              options={filteredTemplates}
              value={dispatch.selectedTemplate}
              onChange={(value) => dispatch.setSelectedTemplate(value as Template)}
              open={openDropdown === "template"}
              onOpen={() => setOpenDropdown("template")}
              onClose={() => setOpenDropdown(null)}
              className={Style.dropdownTemplate}
              searchValue={searchTemplateName}
              searchPlaceholder="Buscar template pelo nome"
              onSearchTermChange={setSearchTemplateName}
              filterOptions={['Cobrança', 'Outros']}
              filterValue={
                templateTypeFilter === 'cobranca'
                  ? 'Cobrança'
                  : templateTypeFilter === 'outros'
                  ? 'Outros'
                  : null
              }
              onFilterChange={(v) =>
                setTemplateTypeFilter(
                  v === 'Cobrança' ? 'cobranca' : v === 'Outros' ? 'outros' : null,
                )
              }
              isOptionDisabled={(template) => !isTemplateApproved(template.meta_status)}
            />

            {dispatch.modoPage === "clientes" ? (
              <Dropdown<Cliente>
                label="Buscar clientes no ERP"
                options={clients}
                searchable
                multiple
                selected={dispatch.selectedClientes}
                onChange={(value) => handleClientsChange(value as Cliente[])}
                open={openDropdown === "clientes"}
                onOpen={() => setOpenDropdown("clientes")}
                onClose={() => setOpenDropdown(null)}
                onSearchTermChange={handleClientSearch}
                isOptionDisabled={isClientDisabled}
              />
            ) : (
              <InputFields
                label="Numero de Whatsapp"
                onlyNumbers={true}
                disabled={manualLead.shouldDisableLeadWhatsappInput}
                placeholder={
                  manualLead.shouldDisableLeadWhatsappInput
                    ? "Limpe os leads importados para usar numero manual"
                    : undefined
                }
                value={manualLead.whatsappValue}
                onChange={(e) =>
                  manualLead.handleWhatsappInputChange(e.target.value)
                }
              />
            )}
          </div>

          <BaseCard classname={Style.cardMetricas}>
            <Metricas
              chave={
                dispatch.modoPage === "clientes"
                  ? "Clientes selecionados"
                  : "Leads selecionados"
              }
              valor={
                dispatch.modoPage === "clientes"
                  ? String(dispatch.selectedClientes.length)
                  : String(dispatch.selectedLeads.length)
              }
              classname={Style.contentMetricas}
              showIconBadge={false}
            />
          </BaseCard>
        </div>

        <div className={Style.containerButtonsPlanilha}>
          <UploadButton
            onUpload={handleLeadUpload}
            disabled={
              !dispatch.selectedTemplate ||
              (dispatch.modoPage === "leads" && manualLead.shouldDisableLeadUpload)
            }
          />
          <DownloadModeloButton
            templateSelecionado={dispatch.selectedTemplate}
            modo={dispatch.modoPage}
          />
          {dispatch.modoPage === "leads" &&
            (dispatch.selectedLeads.length > 0 || manualLead.hasTypedWhatsapp) && (
              <MyButton
                text="Limpar leads"
                variant="secondary"
                onClick={manualLead.clearLeadSelection}
              />
            )}
        </div>

        <section className={Style.containerPreview}>
          {!dispatch.selectedTemplate
            ? "Selecione um template"
            : dispatch.templateMapVars?.[0]?.mensagem ??
              dispatch.selectedTemplate.message
          }
        </section>

        {dispatch.activeDispatchBatch && !isBatchCardDismissed && (
          <section className={Style.batchProgressCard}>
            <div className={Style.batchProgressHeader}>
              <div>
                <span className={Style.batchProgressEyebrow}>Lote de disparo</span>
                <strong>{batchLabel}</strong>
                <p>
                  {dispatch.activeDispatchBatch.processedRecipients} de{" "}
                  {dispatch.activeDispatchBatch.totalRecipients} processados
                </p>
              </div>
              <button
                type="button"
                className={Style.batchProgressDismiss}
                onClick={() => setIsBatchCardDismissed(true)}
                aria-label="Fechar painel de lote"
                title="Fechar painel"
              >
                ×
              </button>
            </div>
            {isFinishedBatch && (
              <div className={Style.batchProgressActions}>
                <MyButton
                  text="Ver lote no historico"
                  variant="secondary"
                  onClick={handleOpenBatchHistory}
                />
                <MyButton
                  text="Encerrar acompanhamento"
                  variant="secondary"
                  onClick={dispatch.clearActiveDispatchBatch}
                />
              </div>
            )}

            <div className={Style.batchProgressBar}>
              <div
                className={Style.batchProgressFill}
                style={{
                  width: `${dispatch.activeDispatchBatch.progressPercentage}%`,
                }}
              />
            </div>

            <div className={Style.batchProgressStats}>
              <span>{dispatch.activeDispatchBatch.progressPercentage}% concluido</span>
              <span>{dispatch.activeDispatchBatch.successCount} sucesso</span>
              <span>{dispatch.activeDispatchBatch.failedCount} falhas</span>
              <span>{dispatch.activeDispatchBatch.rateLimitPerSecond} msg/s</span>
            </div>

            <p className={Style.batchProgressHint}>
              {isFinishedBatch
                ? dispatch.activeDispatchBatch.errorMessage ||
                  "Lote finalizado. Consulte o historico para detalhes."
                : `Processamento em segundo plano.${dispatch.activeDispatchBatch.estimatedDurationSeconds != null ? ` Estimativa inicial: ${dispatch.activeDispatchBatch.estimatedDurationSeconds}s.` : ""}`}
            </p>
          </section>
        )}

        <section className={Style.containerButtonSend}>
          <MyButton
            text={dispatch.isSending ? "Enviando..." : "Enviar disparo"}
            variant="btn-enviar"
            className={Style.submitButton}
            disabled={dispatch.isSending || !dispatch.selectedTemplate}
            onClick={handleOpenDispatchPreview}
          />
        </section>
      </div>

      <DynamicModal
        open={isDispatchPreviewOpen}
        type="custom"
        size="wide"
        title="Preview do disparo"
        onClose={() => setIsDispatchPreviewOpen(false)}
        customContent={
          <DispatchPreviewContent
            eyebrow="Disparo imediato"
            headline={
              dispatch.modoPage === "clientes"
                ? "Envio para clientes ativos"
                : "Envio direto para leads"
            }
            summary="Confira o publico selecionado, o template e a mensagem antes de iniciar o lote."
            audienceLabel={
              dispatch.modoPage === "clientes"
                ? "Clientes selecionados"
                : "Leads selecionados"
            }
            audienceCount={previewAudienceCount}
            templateName={
              dispatch.selectedTemplate?.name ?? "Template nao selecionado"
            }
            message={previewMessage}
            // details={previewDetails}
            note="Ao confirmar, o disparo sera iniciado imediatamente e o lote passara a ser acompanhado em tempo real."
            confirmLabel={
              dispatch.isSending ? "Enviando..." : "Confirmar e disparar"
            }
            confirmDisabled={dispatch.isSending}
            onCancel={() => setIsDispatchPreviewOpen(false)}
            onConfirm={handleConfirmDispatchPreview}
          />
        }
      />

      <DynamicModal
        open={openDispatchAttendantModal}
        type="custom"
        title="Informe o nome do atendente"
        onClose={() => setOpenDispatchAttendantModal(false)}
        customContent={
          <AttendantNameModalContent
            value={manualLead.attendantName}
            onChange={manualLead.setAttendantName}
            onConfirm={handleConfirmAttendant}
          />
        }
      />

      <DynamicModal
        open={manualLead.openManualLeadModal}
        type="custom"
        title={
          manualLead.manualLeadFlowAction === "preview"
            ? "Preencha as variaveis para o preview"
            : "Preencha as variaveis do lead"
        }
        onClose={manualLead.closeManualLeadModal}
        customContent={
          <div style={{ display: "flex", flexDirection: "column", gap: 30 }}>
            <p style={{ margin: 0 }}>
              {manualLead.manualLeadFlowAction === "preview"
                ? "Informe os campos pendentes para seguir para o preview do disparo."
                : "Informe os campos pendentes para concluir o disparo manual."}
            </p>
            {manualLead.pendingManualLeadFields.includes("nome_atendente") && (
              <InputFields
                label="Nome do atendente"
                value={manualLead.attendantName}
                onChange={(event) =>
                  manualLead.setAttendantName(event.target.value)
                }
              />
            )}
            {manualLead.pendingManualLeadFields.includes("nome_empresa") && (
              <InputFields
                label="Nome da empresa"
                value={manualLead.companyName}
                onChange={(event) => manualLead.setCompanyName(event.target.value)}
              />
            )}
            {manualLead.pendingManualLeadFields
              .filter(
                (fieldKey) =>
                  fieldKey !== "nome_atendente" && fieldKey !== "nome_empresa",
              )
              .map((fieldKey) => (
                <InputFields
                  key={fieldKey}
                  label={manualLead.getManualFieldLabel(fieldKey)}
                  value={manualLead.manualLeadFieldValues[fieldKey] ?? ""}
                  inputMode={
                    fieldKey === "data_vencimento_fatura"
                      ? "numeric"
                      : fieldKey === "valor_fatura"
                        ? "decimal"
                        : undefined
                  }
                  maxLength={fieldKey === "data_vencimento_fatura" ? 10 : undefined}
                  placeholder={
                    fieldKey === "data_vencimento_fatura"
                      ? "DD/MM/AAAA"
                      : fieldKey === "valor_fatura"
                        ? "0,00"
                        : undefined
                  }
                  onChange={(event) =>
                    manualLead.updateManualLeadFieldValue(
                      fieldKey,
                      event.target.value,
                    )
                  }
                />
              ))}
            <MyButton
              text={
                manualLead.manualLeadFlowAction === "preview"
                  ? "Confirmar e ver preview"
                  : "Confirmar e enviar"
              }
              variant="btn-enviar"
              onClick={manualLead.confirmManualLeadDispatch}
            />
          </div>
        }
      />
    </PageContainer>
  );
}
