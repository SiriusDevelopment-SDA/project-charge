import { createContext } from "react";
import { useHistoricoController } from "../hooks/controller/history/useHistoricoController";
import type { IHistoricoContext } from "../types";

// eslint-disable-next-line react-refresh/only-export-components
export const HistoricoContext = createContext<IHistoricoContext | null>(null);

export const HistoricoProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const controller = useHistoricoController();

  return (
    <HistoricoContext.Provider value={controller}>
      {children}
    </HistoricoContext.Provider>
  );
};
