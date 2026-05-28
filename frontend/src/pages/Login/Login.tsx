import { FormEvent, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { AuthService, applyLoginSession } from "../../services/auth/auth.service";
import { AppStorage } from "../../services/storage/storage.service";
import { getErrorMessage } from "../../utils/error";
import { createNormalizedSearchParams } from "../../utils/locationSearch";
import styles from "./Styles/Login.module.css";
import logoCoraxy from "../../assets/icons/coraxy.svg";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    try {
      setIsSubmitting(true);
      const result = await AuthService.login({
        email: email.trim(),
        password,
      });

      if (!result.success) {
        toast.error("Falha ao autenticar empresa.");
        return;
      }

      AppStorage.clearOnLogin();
      applyLoginSession(result);
      AppStorage.setAuthMode("agent");

      const from =
        typeof (location.state as { from?: string } | null)?.from === "string"
          ? (location.state as { from: string }).from
          : "/";

      const targetUrl = new URL(from, window.location.origin);
      const normalizedParams = createNormalizedSearchParams(targetUrl.search);
      normalizedParams.set("account", result.company.account);
      const normalizedSearch = normalizedParams.toString();
      const targetPath = `${targetUrl.pathname}${normalizedSearch ? `?${normalizedSearch}` : ""}${targetUrl.hash}`;

      navigate(targetPath, { replace: true });
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Nao foi possivel autenticar. Verifique os dados."));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className={styles.loginPage}>
      <section className={styles.loginCard}>
        <div className={styles.loginBrand}>
          <img src={logoCoraxy} alt="Coraxy" className={styles.loginLogo} />
          {/* <h1>Sistema de cobrança</h1> */}
        </div>
        
        <p>Informe email e senha para acessar o painel.</p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="seu-email@empresa.com"
            autoComplete="username"
            required
          />

          <label htmlFor="password">Senha</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Sua senha"
            autoComplete="current-password"
            required
          />

          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Entrando..." : "Entrar"}
          </button>
          <p className={styles.textBotton}>Automatize disparos e acompanhe resultados em tempo real.</p>
        </form>
      </section>
    </main>
  );
}
