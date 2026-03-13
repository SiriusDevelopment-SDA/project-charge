import { Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import { AuthService } from "../services/auth/auth.service";
import { Navbar } from "../componente/Index";
import Style from "./AccountLayout.module.css";

export function AccountLayout() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isAuthorizing, setIsAuthorizing] = useState(true);

  const setAccount = useCallback((value: string) => {
    localStorage.setItem("account", value);
  }, []);

  useEffect(() => {
    const accountParam = searchParams.get("account");
    const tokenParam = searchParams.get("token");
    const hasEmbedCredentials = Boolean(accountParam && tokenParam);
    const accessToken = localStorage.getItem("access_token");
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

          localStorage.setItem("access_token", result.accessToken);
          localStorage.setItem("account", result.company.account);
          localStorage.setItem("company_name", result.company.name);
          localStorage.setItem("embed_signature", embedSignature);
          localStorage.setItem("auth_mode", "embed");
          localStorage.removeItem("agent_name");
          localStorage.removeItem("attendant_name");
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
          localStorage.removeItem("access_token");
          localStorage.removeItem("account");
          localStorage.removeItem("embed_signature");
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
      localStorage.removeItem("account");
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
        if (result.agent?.name) {
          localStorage.setItem("agent_name", result.agent.name);
          localStorage.setItem("auth_mode", "agent");
        } else {
          localStorage.setItem("auth_mode", "embed");
          localStorage.removeItem("agent_name");
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
        localStorage.removeItem("access_token");
        localStorage.removeItem("account");
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
