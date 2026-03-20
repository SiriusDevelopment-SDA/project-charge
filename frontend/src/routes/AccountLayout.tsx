import { Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import { AuthService } from "../services/auth/auth.service";
import { AppStorage } from "../services/storage/storage.service";
import { Navbar } from "../componente/Index";
import Style from "./AccountLayout.module.css";

export function AccountLayout() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isAuthorizing, setIsAuthorizing] = useState(true);

  const setAccount = useCallback((value: string) => {
    AppStorage.setAccount(value);
  }, []);

  useEffect(() => {
    const accountParam = searchParams.get("account");
    const tokenParam = searchParams.get("token");
    const hasEmbedCredentials = Boolean(accountParam && tokenParam);
    const accessToken = AppStorage.getAccessToken();
    const currentPath = `${location.pathname}${location.search}`;
    let isMounted = true;

    setIsAuthorized(false);
    setIsAuthorizing(true);

    if (hasEmbedCredentials) {
      const embedSignature = `${window.location.origin}|${accountParam}|${tokenParam}`;
      const authenticateEmbed = async () => {
        try {
          const result = await AuthService.embedLogin({
            account: String(accountParam),
            token: String(tokenParam),
          });

          if (!isMounted) return;

          AppStorage.setAccessToken(result.accessToken);
          AppStorage.setAccount(result.company.account);
          AppStorage.setCompanyName(result.company.name);
          AppStorage.setEmbedSignature(embedSignature);
          AppStorage.setAuthMode("embed");
          AppStorage.clearOnLogin();
          setAccount(result.company.account);
          setIsAuthorized(true);
          setIsAuthorizing(false);

          const params = new URLSearchParams(location.search);
          params.delete("token");
          params.set("account", result.company.account);
          navigate(`${location.pathname}?${params.toString()}`, {
            replace: true,
          });
        } catch {
          if (!isMounted) return;
          AppStorage.clearSession();
          navigate("/login", {
            replace: true,
            state: { from: currentPath },
          });
        }
      };

      void authenticateEmbed();
      return () => {
        isMounted = false;
      };
    }

    if (!accessToken) {
      AppStorage.removeAccount();
      navigate("/login", {
        replace: true,
        state: { from: currentPath },
      });
      return;
    }

    const validateSession = async () => {
      try {
        const result = await AuthService.me();
        if (!isMounted) return;

        setAccount(result.company.account);
        AppStorage.setCompanyCnpj(result.company.cnpj ?? '');
        if (result.agent?.name) {
          AppStorage.setAgentName(result.agent.name);
          AppStorage.setAuthMode("agent");
        } else {
          AppStorage.setAuthMode("embed");
          AppStorage.removeAgentName();
        }
        setIsAuthorized(true);
        setIsAuthorizing(false);

        if (accountParam !== result.company.account) {
          const params = new URLSearchParams(location.search);
          params.set("account", result.company.account);
          navigate(`${location.pathname}?${params.toString()}`, {
            replace: true,
          });
        }
      } catch {
        if (!isMounted) return;
        AppStorage.clearSession();
        navigate("/login", {
          replace: true,
          state: { from: currentPath },
        });
      }
    };

    void validateSession();

    return () => {
      isMounted = false;
    };
  }, [searchParams, setAccount, navigate, location.pathname, location.search]);

  if (isAuthorizing) {
    return (
      <main className={Style.authGate}>
        <section className={Style.authCard}>
          <span className={Style.authBadge}>Validando sessao</span>
          <h1 className={Style.authTitle}>Carregando ambiente</h1>
          <p className={Style.authDescription}>
            Aguarde enquanto validamos o acesso da sua conta.
          </p>
          <div className={Style.authSpinner} aria-hidden="true" />
        </section>
      </main>
    );
  }

  if (!isAuthorized) {
    return null;
  }

  return (
    <>
      <Navbar />
      <Outlet />
    </>
  );
}
