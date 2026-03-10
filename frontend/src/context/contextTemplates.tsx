import { createContext } from "react";
import { useTemplatesController } from "../hooks/controller/templates/useTemplatesController";
import type { ITemplatesContext } from "../types";

// eslint-disable-next-line react-refresh/only-export-components
export const TemplateContext = createContext<ITemplatesContext | null>(null);

export const TemplateProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const controller = useTemplatesController();

  return (
    <TemplateContext.Provider value={controller}>
      {children}
    </TemplateContext.Provider>
  );
};

