import {
  createContext,
  useCallback,
  useEffect,
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
  progress: number | null;
};

export type GlobalLoadingContextValue = {
  showLoading: (message?: string) => number;
  hideLoading: (id: number) => void;
  updateProgress: (id: number, progress: number) => void;
  isLoading: boolean;
  message: string;
  progress: number | null;
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
        progress: null,
      },
    ]);

    return id;
  }, []);

  const hideLoading = useCallback((id: number) => {
    setEntries((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const updateProgress = useCallback((id: number, progress: number) => {
    setEntries((current) =>
      current.map((entry) =>
        entry.id === id ? { ...entry, progress: Math.min(100, Math.max(0, progress)) } : entry,
      ),
    );
  }, []);

  const activeEntry = entries[entries.length - 1] ?? null;

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const { body, documentElement } = document;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyPaddingRight = body.style.paddingRight;
    const previousHtmlOverflow = documentElement.style.overflow;

    if (entries.length > 0) {
      const scrollbarWidth = window.innerWidth - documentElement.clientWidth;

      body.style.overflow = "hidden";
      documentElement.style.overflow = "hidden";

      if (scrollbarWidth > 0) {
        body.style.paddingRight = `${scrollbarWidth}px`;
      }
    }

    return () => {
      body.style.overflow = previousBodyOverflow;
      body.style.paddingRight = previousBodyPaddingRight;
      documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [entries.length]);

  const value = useMemo(
    () => ({
      showLoading,
      hideLoading,
      updateProgress,
      isLoading: entries.length > 0,
      message: activeEntry?.message ?? DEFAULT_LOADING_MESSAGE,
      progress: activeEntry?.progress ?? null,
    }),
    [activeEntry?.message, activeEntry?.progress, entries.length, hideLoading, showLoading, updateProgress],
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
              {value.progress !== null && (
                <div className={Style.progressTrack}>
                  <div
                    className={Style.progressFill}
                    style={{ width: `${value.progress}%` }}
                  />
                  <span className={Style.progressLabel}>{value.progress}%</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </GlobalLoadingContext.Provider>
  );
}
