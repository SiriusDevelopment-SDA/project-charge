import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AppStorage } from "../services/storage/storage.service";
import {
  ACTIVE_COMPANY_CHANGED_EVENT,
  notifyActiveCompanyChanged,
} from "../services/session/activeCompanyEvents";

// Re-export para compatibilidade com imports existentes que ainda apontam aqui.
// A fonte canonica agora e `services/session/activeCompanyEvents`.
export { ACTIVE_COMPANY_CHANGED_EVENT, notifyActiveCompanyChanged };

export type ActiveCompany = {
  id: string;
  account: string;
  name: string;
};

type ActiveCompanyContextValue = {
  activeCompany: ActiveCompany | null;
  /**
   * Forca releitura do `AppStorage`.
   * Geralmente nao precisa ser chamado manualmente — o provider escuta o evento
   * global `active-company-changed` disparado por `notifyActiveCompanyChanged()`.
   */
  refreshActiveCompany: () => void;
};

function readFromStorage(): ActiveCompany | null {
  const account = AppStorage.getAccount();
  if (!account) return null;

  // Fonte principal: `COMPANY_ID` (gravado em `applyLoginSession`).
  // Fallback para sessoes antigas que so tinham `LAST_ACTIVE_COMPANY_ID`
  // (super_admin) — evita "perder" o id em sessao ja persistida.
  const id =
    AppStorage.getCompanyId() || AppStorage.getLastActiveCompanyId();

  return {
    id,
    account,
    name: AppStorage.getCompanyName() || account,
  };
}

const ActiveCompanyContext = createContext<ActiveCompanyContextValue | null>(null);

export function ActiveCompanyProvider({ children }: { children: ReactNode }) {
  const [activeCompany, setActiveCompany] = useState<ActiveCompany | null>(() =>
    readFromStorage(),
  );

  const refreshActiveCompany = useCallback(() => {
    setActiveCompany(readFromStorage());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleChange = () => {
      refreshActiveCompany();
    };

    window.addEventListener(ACTIVE_COMPANY_CHANGED_EVENT, handleChange);
    // Suporta mudancas vindas de outras abas via `storage` event nativo.
    window.addEventListener("storage", handleChange);

    return () => {
      window.removeEventListener(ACTIVE_COMPANY_CHANGED_EVENT, handleChange);
      window.removeEventListener("storage", handleChange);
    };
  }, [refreshActiveCompany]);

  const value = useMemo<ActiveCompanyContextValue>(
    () => ({ activeCompany, refreshActiveCompany }),
    [activeCompany, refreshActiveCompany],
  );

  return (
    <ActiveCompanyContext.Provider value={value}>
      {children}
    </ActiveCompanyContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useActiveCompany(): ActiveCompanyContextValue {
  const context = useContext(ActiveCompanyContext);
  if (!context) {
    throw new Error(
      "useActiveCompany precisa ser usado dentro de <ActiveCompanyProvider>.",
    );
  }
  return context;
}
