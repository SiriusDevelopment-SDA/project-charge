import type { SetStateAction } from "react";

export type history = {
  id: string;
  name?: string;
  number?: string;
  message?: string | null;
  date_dispatch?: string | Date | null;
  status_sent?: string;
  response?: boolean | null;
  response_at?: string | Date | null;
  templateId?: string;
  category?: string;
  status?: string;
  errorMessage?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
};
export interface IHistoricoContext {
    histories: history[] | [];
    total: number;
    page: number;
    limit: number;
    // Setter com debounce interno (useHistorico): dispara a busca no SERVIDOR
    // (name/number) e repagina o resultado filtrado a partir da página 1.
    setQuery: (value: string) => void;
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
