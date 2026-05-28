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

/**
 * Nome do evento custom disparado quando a empresa ativa muda (ex.: depois do
 * switch-company do super_admin). Mantemos o provider desacoplado do mutation
 * — qualquer codigo que altere a sessao deve chamar `notifyActiveCompanyChanged`.
 */
export const ACTIVE_COMPANY_CHANGED_EVENT = "active-company-changed";

/**
 * Dispara o evento custom escutado pelo `ActiveCompanyProvider`.
 * Usar imediatamente apos gravar a nova empresa no `AppStorage`.
 */
export function notifyActiveCompanyChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(ACTIVE_COMPANY_CHANGED_EVENT));
}

function readFromStorage(): ActiveCompany | null {
  const account = AppStorage.getAccount();
  if (!account) return null;

  // Nao temos `companyId` no storage hoje — usamos o id da ultima empresa
  // marcada como ativa (caso de super_admin) ou cai num fallback vazio.
  const id = AppStorage.getLastActiveCompanyId();

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
