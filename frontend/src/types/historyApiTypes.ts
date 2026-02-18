import type { SetStateAction } from "react";

export type history = {
  id: string;
  cliente_name?: string;
  cliente_document?: string;
  cliente_whatsapp?: string;
  message: string;
  templateId?: string;
  category?: string;
  status: string;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
};
export interface IHistoricoContext {
    histories: history[] | [];
    setQuery: React.Dispatch<SetStateAction<string>>;
    setPage: React.Dispatch<SetStateAction<number>>;
    setLimit: React.Dispatch<SetStateAction<number>>;
    setOrder: React.Dispatch<SetStateAction<"DESC" | "ASC">>;
  }
export type responseHistorico = {
    data: history[];
    limit: number;
    page: number;
    total: number;
  };