import { createContext } from "react";
import type { IDispatchTemplateContext } from "../types";
import { useDispatchTemplateController } from "../hooks/controller/dispatch/useDispatchTemplateController";

// eslint-disable-next-line react-refresh/only-export-components
export const DispatchTemplateContext = createContext<IDispatchTemplateContext>(
  {} as IDispatchTemplateContext
);

export const DispatchTemplateProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const controller = useDispatchTemplateController();

  return (
    <DispatchTemplateContext.Provider value={controller}>
      {children}
    </DispatchTemplateContext.Provider>
  );
};
