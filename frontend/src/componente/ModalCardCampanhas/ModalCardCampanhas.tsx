import { CampaignDetails, DynamicModal, Pagination } from "../Index";
import { useCampaign } from "../../hooks/useCampaign";
import { useCampaignListController } from "../../hooks/controller/campaigns/useCampaignListController";
import { TemplateBalloonCard } from "../TemplateCard/TemplateCard";
import Style from "./ModalCardCampanhas.module.css";
import type { CampaignData } from "../../types";
import { useModalCardCampanhasController } from "../../hooks/components/useModalCardCampanhasController";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  onConfirmCampaign?: (campaign: CampaignData) => void;
};

export default function ModalCardCampanhas({
  open,
  onClose,
  onConfirmCampaign,
}: ModalProps) {
  const { campaigns, categories } = useCampaign();
  const { paginatedCampaigns, page, setPage, totalPages } =
    useCampaignListController({ campaigns, categories });

  const {
    selectedCampaign,
    openConfirmation,
    closeConfirmation,
    confirmSelection,
  } = useModalCardCampanhasController(onClose);

  if (!open) return null;

  return (
    <>
      <DynamicModal
        open
        type="modaltemplates"
        title="SELECIONE UMA CAMPANHA"
        description={
          <div className={Style.modalTemplatesContent}>
            <div className={Style.listaTemplates}>
              {paginatedCampaigns.length === 0 ? (
                <span>Nenhuma campanha encontrada.</span>
              ) : (
                paginatedCampaigns.map((campaign) => (
                  <div
                    key={campaign.id}
                    className={Style.templateWrapper}
                    onClick={() => openConfirmation(campaign)}
                  >
                    <TemplateBalloonCard
                      title={campaign.name ?? ""}
                      message={campaign.message ?? ""}
                      category={campaign.template?.name ?? ""}
                      showExpand={false}
                    >
                      <CampaignDetails
                        category={campaign.category}
                        dispatchTime={campaign.dispatchTime}
                        startDate={campaign.startDate}
                        endDate={campaign.endDate}
                        key={campaign.id}
                      />
                    </TemplateBalloonCard>
                  </div>
                ))
              )}
            </div>

            <Pagination
              className={Style.Pagination}
              page={page}
              onPrev={() => setPage((prev: number) => Math.max(prev - 1, 1))}
              onNext={() =>
                setPage((prev: number) => Math.min(prev + 1, totalPages))
              }
              disablePrev={page === 1}
              disableNext={page === totalPages}
            />
          </div>
        }
        onClose={onClose}
        buttons={[]}
      />

      {selectedCampaign && (
        <DynamicModal
          open
          type="warning"
          title="Confirmar campanha"
          description={
            <>
              Deseja utilizar esta campanha para o disparo?
              <br />
              <strong>{selectedCampaign.name}</strong>
            </>
          }
          onClose={closeConfirmation}
          buttons={[
            {
              label: "Sim",
              variant: "success",
              onClick: () => confirmSelection(onConfirmCampaign),
            },
            {
              label: "Não",
              variant: "danger",
              onClick: closeConfirmation,
            },
          ]}
        />
      )}
    </>
  );
}
