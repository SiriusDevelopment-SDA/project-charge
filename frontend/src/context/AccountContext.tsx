/* eslint-disable react-refresh/only-export-components */ 
// Esconde o warning (não é bug no AccountContext)

import { createContext, useEffect, useState, type Dispatch } from "react";
import { useLocation, useNavigate } from "react-router";

export interface AccountContextType {
  account: string;
  setAccount: Dispatch<React.SetStateAction<string>>;
}

export const AccountContext = createContext<AccountContextType | null>(null);

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<string>(() => localStorage.getItem("account") || "");
  const searchParams = new URLSearchParams(window.location.search);
  const accountParam = searchParams.get("account");
 const navigate = useNavigate();
 const location = useLocation();

  useEffect(() => {
    if (accountParam) {
      localStorage.setItem("account", accountParam);
    } else {
      const storedAccount = localStorage.getItem("account");
      navigate(
        `${location.pathname}?account=${storedAccount}`,
        { replace: true }
      );
    }
  }, []);
  

  return (
    
    <AccountContext.Provider value={{ account, setAccount }}>
      {children}
    </AccountContext.Provider>
  );
}
