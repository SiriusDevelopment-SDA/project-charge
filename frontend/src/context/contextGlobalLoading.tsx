import {
  createContext,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import CircularProgress from "@mui/material/CircularProgress";
import Style from "./GlobalLoading.module.css";

type LoadingEntry = {
  id: number;
  message: string;
};

export type GlobalLoadingContextValue = {
  showLoading: (message?: string) => number;
  hideLoading: (id: number) => void;
  isLoading: boolean;
  message: string;
};

const DEFAULT_LOADING_MESSAGE = "Buscando dados, aguarde...";

// eslint-disable-next-line react-refresh/only-export-components
export const GlobalLoadingContext = createContext<GlobalLoadingContextValue | null>(null);

export function GlobalLoadingProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<LoadingEntry[]>([]);
  const nextIdRef = useRef(1);

  const showLoading = useCallback((message?: string) => {
    const id = nextIdRef.current++;

    setEntries((current) => [
      ...current,
      {
        id,
        message: message?.trim() || DEFAULT_LOADING_MESSAGE,
      },
    ]);

    return id;
  }, []);

  const hideLoading = useCallback((id: number) => {
    setEntries((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const activeEntry = entries[entries.length - 1] ?? null;

  const value = useMemo(
    () => ({
      showLoading,
      hideLoading,
      isLoading: entries.length > 0,
      message: activeEntry?.message ?? DEFAULT_LOADING_MESSAGE,
    }),
    [activeEntry?.message, entries.length, hideLoading, showLoading],
  );

  return (
    <GlobalLoadingContext.Provider value={value}>
      {children}
      {value.isLoading && (
        <div className={Style.overlay} role="status" aria-live="polite" aria-busy="true">
          <div className={Style.card}>
            <div className={Style.spinner}>
              <CircularProgress size={28} />
            </div>
            <div className={Style.content}>
              <span className={Style.title}>Carregando</span>
              <span className={Style.message}>{value.message}</span>
            </div>
          </div>
        </div>
      )}
    </GlobalLoadingContext.Provider>
  );
}
