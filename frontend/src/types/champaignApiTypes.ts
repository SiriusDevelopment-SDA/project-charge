export type CampaignData = {
    id: string;
    name: string;
    status: 'pending' | 'running' | 'finished';
    startDate: string;
    endDate: string;
    dispatchStartTime: string;
    dispatchEndTime: string;
    timezone: string;
    recurring: boolean;
    createdAt: string;
    updatedAt?: string;
    isEnabled?: boolean;
    message?: string;
    category?: { id: string; name: string } | null;
    template?: { id: string; name: string; message?: string } | null;
    company?: { id: string; name: string } | null;
  };
  
  export type PropsCardCampanhas = {
    campanha: CampaignData;
    onDelete: (campanha: CampaignData) => void;
  };