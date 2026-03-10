import { Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useCallback, useEffect } from "react";
import { AuthService } from "../services/auth/auth.service";

export function AccountLayout() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  const setAccount = useCallback((value: string) => {
    localStorage.setItem("account", value);
  }, []);

  useEffect(() => {
    const accountParam = searchParams.get("account");
    const tokenParam = searchParams.get("token");
    const hasEmbedCredentials = Boolean(accountParam && tokenParam);
    const accessToken = localStorage.getItem("access_token");
    const currentPath = `${location.pathname}${location.search}`;

    if (hasEmbedCredentials) {
      const embedSignature = `${window.location.origin}|${accountParam}|${tokenParam}`;
      const alreadyAuthenticated =
        localStorage.getItem("embed_signature") === embedSignature &&
        Boolean(accessToken);

      if (alreadyAuthenticated && accountParam) {
        setAccount(accountParam);
        return;
      }

      let isMounted = true;
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

    if (accountParam && !hasEmbedCredentials) {
      if (!accessToken) {
        localStorage.removeItem("account");
        navigate("/login", {
          replace: true,
          state: { from: currentPath },
        });
        return;
      }

      setAccount(accountParam);
      return;
    }

    if (!accessToken) {
      localStorage.removeItem("account");
      navigate("/login", {
        replace: true,
        state: { from: currentPath },
      });
      return;
    }

    let isMounted = true;

    const resolveAccountByToken = async () => {
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
        const queryPrefix = location.search ? `${location.search}&` : "?";
        navigate(`${location.pathname}${queryPrefix}account=${result.company.account}`, {
          replace: true,
        });
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

    void resolveAccountByToken();

    return () => {
      isMounted = false;
    };
  }, [searchParams, setAccount, navigate, location.pathname, location.search]);

  return <Outlet />;
}
