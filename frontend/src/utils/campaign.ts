type CampaignStatusSnapshot = {
  isEnabled?: boolean;
  endDate: string;
};

export function isCampaignFinished(campaign: Pick<CampaignStatusSnapshot, "endDate">) {
  const endDate = new Date(campaign.endDate);
  endDate.setHours(23, 59, 59, 999);
  return endDate.getTime() < Date.now();
}

export function isCampaignActive(campaign: CampaignStatusSnapshot) {
  return Boolean(campaign.isEnabled) && !isCampaignFinished(campaign);
}
