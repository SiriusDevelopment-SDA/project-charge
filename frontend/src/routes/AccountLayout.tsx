import { Outlet, useSearchParams } from "react-router-dom";
import { useEffect } from "react";
import { useAccounts } from "../hooks/useAccounts";

export function AccountLayout() {
  const [searchParams] = useSearchParams();
  const { setAccount } = useAccounts();

  useEffect(() => {
    const accountParam = searchParams.get("account");

    if (accountParam && !isNaN(Number(accountParam))) {
      setAccount(accountParam);
    } else {
      setAccount("0");
    }
  }, [searchParams, setAccount]);

  return <Outlet />;
}
