/* eslint-disable react-refresh/only-export-components */ 
// Esconde o warning (não é bug no AccountContext)

import { createContext, useState } from "react";

export interface AccountContextType {
  account: number;
  setAccount: (account: number) => void;
}

export const AccountContext = createContext<AccountContextType | null>(null);

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<number>(4);

  return (
    
    <AccountContext.Provider value={{ account, setAccount }}>
      {children}
    </AccountContext.Provider>
  );
}
