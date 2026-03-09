
import { useContext } from "react";
import { CampaignContext } from "../context/contextCampaigns";
import { useCampaignFormController } from "./controller/campaigns/useCampaignFormController";

export function useCampaign() {
  const context = useContext(CampaignContext);
  if (!context) {
    throw new Error("useCampaign must be used within a CampaignProvider");
  }
  return context;
}

export function useCampaignForm() {
  return useCampaignFormController();
}
