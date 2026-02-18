import { useContext } from "react";
import { AccountContext } from "../context/AccountContext";

export function useAccounts() {
  const context = useContext(AccountContext);

  if (!context) {
    throw new Error("useAccount must be used inside AccountProvider");
  }

  return context;
}
