import type { CampaignData } from "../types/champaignApiTypes";

export function isCampaignFinished(campaign: CampaignData): boolean {
  if (campaign.status === "finished") return true;
  return new Date(campaign.endDate) < new Date();
}

export function isCampaignActive(campaign: CampaignData): boolean {
  if (isCampaignFinished(campaign)) return false;
  return campaign.isEnabled === true;
}
