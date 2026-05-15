"use client";

import { ExternalLink, Info, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { useWatch } from "react-hook-form";
import { MyCalendar, MyTimePicker } from "../../Index";
import DynamicModal from "../../modal/modalAlertTemplate";
import { ModalEditarCampanha } from "./ModalEditarCampanha";
import type { CampaignData } from "../../../types/index";
import Style from "./CardCampanhas.module.css";
import { formatDateBR } from "../../../utils/date";
import { isCampaignActive, isCampaignFinished } from "../../../utils/campaign";
import { format } from "date-fns";
import { useCampaignEditController } from "../../../hooks/index";

type Props = {
  campaign: CampaignData;
  onDelete: (campaign: CampaignData) => void;
  onStatusChanged: (id: string, isEnabled: boolean) => void;
};

const OPERATOR_LABELS: Record<string, { type: string; direction: string; color: string }> = {
  less_than:      { type: "Cobrança preventiva",    direction: "antes do vencimento", color: "#4ade80" },
  less_or_equal:  { type: "Cobrança preventiva",    direction: "até o vencimento",    color: "#4ade80" },
  greater_than:   { type: "Cobrança em atraso",     direction: "após o vencimento",   color: "#f87171" },
  greater_or_equal: { type: "Cobrança em atraso",   direction: "a partir do vencimento", color: "#f87171" },
};

function CampaignDetailsContent({
  campaign,
  onClose,
}: {
  campaign: CampaignData;
  onClose: () => void;
}) {
  const rule = campaign.invoiceRule;
  const meta = rule ? (OPERATOR_LABELS[rule.operator] ?? null) : null;

  const isPreventive = rule?.operator === "less_than" || rule?.operator === "less_or_equal";
  const daysFrom = rule?.daysFrom ?? 0;
  const daysTo = rule?.daysTo ?? 0;

  const windowDescription = rule
    ? daysFrom === daysTo
      ? `Exatamente ${daysFrom} dia${daysFrom !== 1 ? "s" : ""} ${meta?.direction}`
      : `De ${daysFrom} a ${daysTo} dias ${meta?.direction}`
    : null;

  return (
    <div className={Style.detailsModalContent}>
      <div className={Style.detailsModalHeader}>
        <h4 className={Style.detailsModalTitle}>Régua de Cobrança</h4>
        <p className={Style.detailsModalSubtitle}>
          Critério usado para selecionar os destinatários desta campanha
        </p>
      </div>

      {rule ? (
        <>
          <div className={Style.ruleTypeBadge} style={{ borderColor: meta?.color, color: meta?.color }}>
            {meta?.type ?? rule.operator}
          </div>

          <div className={Style.ruleTimeline}>
            {isPreventive ? (
              <>
                <div className={Style.ruleTimelineBar}>
                  <div
                    className={Style.ruleTimelineWindow}
                    style={{ background: "rgba(74,222,128,0.15)", borderColor: "rgba(74,222,128,0.35)" }}
                  />
                </div>
                <div className={Style.ruleTimelineLabels}>
                  <span>‑{daysTo}d</span>
                  <span>‑{daysFrom}d</span>
                  <span className={Style.ruleTimelineDue}>Vencimento</span>
                </div>
              </>
            ) : (
              <>
                <div className={Style.ruleTimelineBar}>
                  <div
                    className={Style.ruleTimelineWindow}
                    style={{ background: "rgba(248,113,113,0.15)", borderColor: "rgba(248,113,113,0.35)" }}
                  />
                </div>
                <div className={Style.ruleTimelineLabels}>
                  <span className={Style.ruleTimelineDue}>Vencimento</span>
                  <span>+{daysFrom}d</span>
                  <span>+{daysTo}d</span>
                </div>
              </>
            )}
          </div>

          <div className={Style.ruleDetails}>
            <div className={Style.ruleDetailsItem}>
              <span>JANELA</span>
              <strong>{windowDescription}</strong>
            </div>
            <div className={Style.ruleDetailsItem}>
              <span>DIAS INÍCIO</span>
              <strong>{daysFrom} dia{daysFrom !== 1 ? "s" : ""}</strong>
            </div>
            <div className={Style.ruleDetailsItem}>
              <span>DIAS FIM</span>
              <strong>{daysTo} dia{daysTo !== 1 ? "s" : ""}</strong>
            </div>
          </div>
        </>
      ) : (
        <p className={Style.ruleNotSaved}>
          Régua de cobrança não disponível — campanha criada antes desta funcionalidade.
        </p>
      )}

      <button type="button" className={Style.detailsModalClose} onClick={onClose}>
        Fechar
      </button>
    </div>
  );
}

function parseDateBr(value?: string) {
  if (!value) return undefined;

  const [day, month, year] = value.split("/").map(Number);
  const parsedDate = new Date(year, (month ?? 1) - 1, day ?? 1);

  return Number.isNaN(parsedDate.getTime()) ? undefined : parsedDate;
}

export function CardCampaigns({ campaign, onDelete, onStatusChanged }: Props) {
  const {
    ui,
    form,
    openEdit,
    openDetails,
    openStatusModal,
    openCalendarDisparo,
    openCalendarFinal,
    openTimePicker,
    openTemplatePreview,
    returnToEdit,
    saveCampaignEdits,
    closeModal,
    editStatusCampaign,
    toggleActionsMenu,
  } = useCampaignEditController(campaign);

  const watchDispatchDate = useWatch({ control: form.control, name: "dispatchDate" });
  const watchEndDate = useWatch({ control: form.control, name: "endDate" });
  const watchDispatchTime = useWatch({ control: form.control, name: "dispatchTime" });

  const isFinished = isCampaignFinished(campaign);
  const isActive = isCampaignActive(campaign);
  const isEditFlowOpen =
    ui.activeModal === "EDIT" ||
    ui.activeModal === "CAL_DISPARO" ||
    ui.activeModal === "CAL_FINAL" ||
    ui.activeModal === "TIME";
  const statusLabel = isFinished ? "FINALIZADA" : isActive ? "ATIVA" : "INATIVA";
  const templateMessage = campaign.template?.message ?? campaign.message ?? "Sem mensagem de template";
  const campaignDispatchType = campaign.recurring
    ? "Disparo contínuo"
    : "Disparo único";
  const campaignCategory = campaign.category?.name ?? "-";

  const renderTemplateMessage = (message: string) => {
    const parts = message.split(/(\{\{\d+\}\})/g);
    return parts.map((part, index) => {
      if (/^\{\{\d+\}\}$/.test(part)) {
        return (
          <span key={`${part}-${index}`} className={Style.templateVar}>
            {part}
          </span>
        );
      }
      return <span key={`text-${index}`}>{part}</span>;
    });
  };

  return (
    <>
      <article className={`${Style.campaignCard} ${isActive ? Style.activeCard : ""}`}>
        <header className={Style.header}>
          <h3 className={Style.title} title={campaign.name}>
            {campaign.name}
          </h3>

          <div className={Style.headerActions}>
            <button
              type="button"
              className={`${Style.statusBadge} ${isActive ? Style.statusOn : Style.statusOff}`}
              onClick={!isFinished ? openStatusModal : undefined}
              disabled={isFinished}
              title={isFinished ? "Campanha finalizada" : isActive ? "Desativar campanha" : "Ativar campanha"}
            >
              <span className={Style.statusDot} />
              {statusLabel}
            </button>

            <div
              className={Style.actionsMenuWrapper}
              tabIndex={0}
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  if (ui.actionsMenuOpen) toggleActionsMenu();
                }
              }}
            >
              <button
                type="button"
                className={Style.actionsMenuButton}
                onClick={toggleActionsMenu}
                aria-label="Abrir ações"
              >
                <MoreVertical size={16} />
              </button>

              {ui.actionsMenuOpen && (
                <div className={Style.actionsDropdown}>
                  <button
                    type="button"
                    onClick={() => {
                      openDetails();
                      toggleActionsMenu();
                    }}
                  >
                    <Info size={14} />
                    Detalhes
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      openEdit();
                      toggleActionsMenu();
                    }}
                  >
                    <Pencil size={14} />
                    Editar
                  </button>
                  <button
                    type="button"
                    className={Style.deleteAction}
                    onClick={() => {
                      onDelete(campaign);
                      toggleActionsMenu();
                    }}
                  >
                    <Trash2 size={14} />
                    Deletar
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <section className={Style.templateSection}>
          <h4>TEMPLATE</h4>
          <p className={Style.templateText}>{renderTemplateMessage(templateMessage)}</p>
          <button
            type="button"
            className={Style.previewButton}
            onClick={openTemplatePreview}
          >
            <ExternalLink size={13} /> Ver mensagem completa
          </button>
        </section>

        <section className={Style.detailsSection}>
          <h4>DETALHES DA CAMPANHA</h4>
          <div className={Style.detailsGrid}>
            <div>
              <span>TIPO DE DISPARO</span>
              <strong>{campaignDispatchType}</strong>
            </div>
            <div>
              <span>CATEGORIA</span>
              <strong>{campaignCategory}</strong>
            </div>
            <div>
              <span>INÍCIO DISPARO</span>
              <strong>{formatDateBR(campaign.startDate)}</strong>
            </div>
            <div>
              <span>FIM DISPARO</span>
              <strong>{formatDateBR(campaign.endDate)}</strong>
            </div>
            <div>
              <span>HORÁRIO</span>
              <strong>{campaign.dispatchTime ?? "-"}</strong>
            </div>
          </div>
        </section>
      </article>

      <ModalEditarCampanha
        open={isEditFlowOpen}
        onClose={closeModal}
        form={form}
        onSave={saveCampaignEdits}
        onOpenCalendarDisparo={openCalendarDisparo}
        onOpenCalendarFinalizacao={openCalendarFinal}
        onOpenTimePicker={openTimePicker}
      />

      <DynamicModal
        open={ui.activeModal === "STATUS"}
        type="warning"
        title={isActive ? "Pausar campanha?" : "Ativar campanha?"}
        description="Deseja alterar o status da campanha?"
        onClose={closeModal}
        buttons={[
          { label: "Cancelar", variant: "danger", onClick: closeModal },
          {
            label: "Confirmar",
            variant: "success",
            onClick: async () => {
              const nextStatus = !campaign.isEnabled;
              const result = await editStatusCampaign(campaign.id, {
                isEnabled: !campaign.isEnabled,
              });
              if (result.success) {
                onStatusChanged(campaign.id, nextStatus);
              }
              closeModal();
            },
          },
        ]}
      />

      <DynamicModal
        open={ui.activeModal === "TEMPLATE_PREVIEW"}
        type="custom"
        title={campaign.name}
        onClose={closeModal}
        customContent={
          <div className={Style.templateModalContent}>
            <h4>
              Template "{campaign.template?.name ?? "—"}" completo
            </h4>
            <p>{renderTemplateMessage(templateMessage)}</p>
            <button type="button" className={Style.templateModalClose} onClick={closeModal}>
              Fechar
            </button>
          </div>
        }
      />

      <DynamicModal
        open={ui.activeModal === "CAL_DISPARO"}
        type="custom"
        title="Selecione a Data de Disparo"
        onClose={returnToEdit}
        customContent={
          <MyCalendar
            mode="single"
            selectedSingle={parseDateBr(watchDispatchDate)}
            disabledDays={(date) => {
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              return date < today;
            }}
            onSelectSingle={(date) => {
              if (!date) return;

              form.setValue("dispatchDate", format(date, "dd/MM/yyyy"), {
                shouldValidate: true,
                shouldDirty: true,
                shouldTouch: true,
              });
              returnToEdit();
            }}
          />
        }
      />

      <DynamicModal
        open={ui.activeModal === "CAL_FINAL"}
        type="custom"
        title="Selecione a Data de Finalização"
        onClose={returnToEdit}
        customContent={
          <MyCalendar
            mode="single"
            selectedSingle={parseDateBr(watchEndDate)}
            disabledDays={(date) => {
              const startDate = parseDateBr(watchDispatchDate);
              const minDate = startDate ?? new Date();
              minDate.setHours(0, 0, 0, 0);
              const d = new Date(date);
              d.setHours(0, 0, 0, 0);
              return d < minDate;
            }}
            onSelectSingle={(date) => {
              if (!date) return;

              form.setValue("endDate", format(date, "dd/MM/yyyy"), {
                shouldValidate: true,
                shouldDirty: true,
                shouldTouch: true,
              });
              returnToEdit();
            }}
          />
        }
      />

      <DynamicModal
        open={ui.activeModal === "DETAILS"}
        type="custom"
        title={campaign.name}
        onClose={closeModal}
        customContent={<CampaignDetailsContent campaign={campaign} onClose={closeModal} />}
      />

      <DynamicModal
        open={ui.activeModal === "TIME"}
        type="custom"
        title="Selecione o Horário"
        onClose={returnToEdit}
        customContent={
          <div className={Style.timeModalContent}>
            <MyTimePicker
              selected={watchDispatchTime}
              onSelect={(time) => {
                form.setValue("dispatchTime", time, {
                  shouldValidate: true,
                  shouldDirty: true,
                  shouldTouch: true,
                });
              }}
            />
            <button
              type="button"
              className={Style.timeModalApplyButton}
              onClick={returnToEdit}
            >
              Aplicar horário
            </button>
          </div>
        }
      />
    </>
  );
}
