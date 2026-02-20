// IMPORT TYPE INPUTS

import type { Dispatch, ReactNode, SetStateAction, } from "react";

export type MyInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
};


export type TemplateBalloonCardProps = {
  title: string;
  message: string;
  category: string;
  onUse?: () => void;
  onDelete?: () => void;
};



export type PaginationProps = {
  className?: string;
  page: number;
  onPrev: () => void;
  onNext: () => void;
  disablePrev?: boolean;
  disableNext?: boolean;
};

export type Template = {
  [x: string]: unknown;
  id: string;
  name: string;
  message: string;
  category: string;
  active: boolean;
  company: company;
  meta_status: string;
  createdAt: Date;
  updatedAt: Date;
  variables: Record<string, string>;
  isEnabled: boolean;
};

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
