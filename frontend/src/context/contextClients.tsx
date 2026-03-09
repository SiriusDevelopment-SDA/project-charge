import { createContext } from "react";
import type { IClientsContext } from "../types";
import { useClientsDataController } from "../hooks/controller/clients/useClientsDataController";

// eslint-disable-next-line react-refresh/only-export-components
export const ClientContext = createContext<IClientsContext>({} as IClientsContext);

export const ClientProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const controller = useClientsDataController();

  return <ClientContext.Provider value={controller}>{children}</ClientContext.Provider>;
};
