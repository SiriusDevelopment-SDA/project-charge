import { useEffect, type ReactNode } from "react";
import { setupInvoicesSocket } from "../services/realtime/invoicesRealtime";
import { useAccountParam } from "../hooks/useAccountParam";

export function InvoiceProvider({ children }: { children: ReactNode }) {
  const account = useAccountParam();

  useEffect(() => {
    if (!account) return;
    return setupInvoicesSocket(account);
  }, [account]);

  return <>{children}</>;
}
