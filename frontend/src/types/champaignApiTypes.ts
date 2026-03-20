
export type CampaignStatus = "queue" | "pending" | "running" | "finished";

export type RecurringType = "single" | "range" | "monthly_days";

export type CampaignData = {
  id: string;
  name: string;
  status: CampaignStatus;
  startDate: string;
  endDate: string;
  dispatchTime: string;
  timezone: string;
  recurring: boolean;
  recurringType?: RecurringType;
  recurringDays?: number[];
  createdAt: string;
  updatedAt?: string;
  isEnabled?: boolean;
  message?: string;
  category?: { id: string; name: string } | null;
  template?: { id: string; name: string; message?: string } | null;
  company?: { id: string; name: string } | null;
};

export type CampaignMetrics = {
  totalCampaigns: number;
  activeCampaigns: number;
  dispatchesToday: number;
  totalDispatch: number;
  totalDispatchSuccess: number;
  totalDispatchToday: number;
  totalDispatchSuccessToday: number;
  totalDispatch24h: number;
  totalDispatchSuccess24h: number;
  deliveryRateTotal: number;
  deliveryRateToday: number;
  deliveryRate24h: number;
  nextDispatchTime: string | null;
  nextDispatchLabel: string;
};

export type CollectionsMetrics = {
  chargedCustomers30d: number;
  respondedAfterCharge30d: number;
  responseRate30d: number;
  openFollowups: number;
  noResponseOver24h: number;
  lastResponseAt: string | null;
};
export type CampaignUpdate = {
  name?: string;
  status?: CampaignStatus;
  startDate?: string;
  endDate?: string;
  dispatchTime?: string;
  timezone?: string;
  recurring?: boolean;
  createdAt?: string;
  updatedAt?: string;
  isEnabled?: boolean;
  message?: string;
  category?: { id: string; name: string } | null;
  template?: { id: string; name: string; message?: string } | null;
  company?: { id: string; name: string } | null;
};
export type Category = {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
};

export type DropdownType = "template" | "category" | "client" | null;
