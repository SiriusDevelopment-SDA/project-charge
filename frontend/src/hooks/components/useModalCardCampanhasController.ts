import { useState } from "react";
import type { CampaignData } from "../../types";

export function useModalCardCampanhasController(onClose: () => void) {
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignData | null>(null);

  const openConfirmation = (campaign: CampaignData) => {
    setSelectedCampaign(campaign);
  };

  const closeConfirmation = () => {
    setSelectedCampaign(null);
  };

  const confirmSelection = (onConfirmCampaign?: (campaign: CampaignData) => void) => {
    if (!selectedCampaign) return;
    onConfirmCampaign?.(selectedCampaign);
    setSelectedCampaign(null);
    onClose();
  };

  return {
    selectedCampaign,
    openConfirmation,
    closeConfirmation,
    confirmSelection,
  };
}
