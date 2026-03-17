import { createContext } from "react";
import type { ReactNode } from "react";
import type { IDispatchTemplateContext } from "../types";
import { useDispatchTemplateController } from "../hooks/controller/dispatch/useDispatchTemplateController";

// eslint-disable-next-line react-refresh/only-export-components
export const DispatchTemplateContext = createContext<IDispatchTemplateContext | null>(null);

export function DispatchTemplateProvider({ children }: { children: ReactNode }) {
  const controller = useDispatchTemplateController();

  return (
    <DispatchTemplateContext.Provider value={controller}>
      {children}
    </DispatchTemplateContext.Provider>
  );
}
