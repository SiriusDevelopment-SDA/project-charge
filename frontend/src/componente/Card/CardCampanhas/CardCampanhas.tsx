"use client";

import { ExternalLink, MoreVertical, Pencil, Trash2 } from "lucide-react";
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

export function CardCampaigns({ campaign, onDelete, onStatusChanged }: Props) {
  const {
    ui,
    form,
    openEdit,
    openStatusModal,
    openCalendarDisparo,
    openCalendarFinal,
    openTimePicker,
    openTemplatePreview,
    closeModal,
    editStatusCampaign,
    toggleActionsMenu,
  } = useCampaignEditController(campaign);

  const isFinished = isCampaignFinished(campaign);
  const isActive = isCampaignActive(campaign);
  const statusLabel = isFinished ? "FINALIZADA" : isActive ? "ATIVA" : "INATIVA";
  const templateMessage = campaign.template?.message ?? campaign.message ?? "Sem mensagem de template";
  const campaignType = campaign.category?.name ?? "-";

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

            <div className={Style.actionsMenuWrapper}>
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
              <span>TIPO</span>
              <strong>{campaignType}</strong>
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
        open={ui.activeModal === "EDIT"}
        onClose={closeModal}
        form={form}
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
            <h4>TEMPLATE COMPLETO</h4>
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
        onClose={closeModal}
        customContent={
          <MyCalendar
            selected={undefined}
            onSelect={(range) => {
              if (range?.from) {
                form.setValue("dispatchDate", format(range.from, "dd/MM/yyyy"), {
                  shouldValidate: true,
                });
                closeModal();
              }
            }}
          />
        }
      />

      <DynamicModal
        open={ui.activeModal === "CAL_FINAL"}
        type="custom"
        title="Selecione a Data de Finalização"
        onClose={closeModal}
        customContent={
          <MyCalendar
            selected={undefined}
            onSelect={(range) => {
              if (range?.from) {
                form.setValue("endDate", format(range.from, "dd/MM/yyyy"), {
                  shouldValidate: true,
                });
                closeModal();
              }
            }}
          />
        }
      />

      <DynamicModal
        open={ui.activeModal === "TIME"}
        type="custom"
        title="Selecione o Horário"
        onClose={closeModal}
        customContent={
          <MyTimePicker
            selected={form.watch("dispatchTime")}
            onSelect={(time) => {
              form.setValue("dispatchTime", time, { shouldValidate: true });
              closeModal();
            }}
          />
        }
      />
    </>
  );
}
