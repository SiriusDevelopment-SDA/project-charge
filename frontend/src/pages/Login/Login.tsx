import { FormEvent, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { AuthService } from "../../services/auth/auth.service";
import { getErrorMessage } from "../../utils/error";
import styles from "./Styles/Login.module.css";

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

      localStorage.setItem("access_token", result.accessToken);
      localStorage.setItem("account", result.company.account);
      localStorage.setItem("company_name", result.company.name);
      localStorage.setItem("auth_mode", "agent");
      localStorage.removeItem("embed_signature");
      localStorage.removeItem("attendant_name");
      if (result.agent?.name) {
        localStorage.setItem("agent_name", result.agent.name);
      } else {
        localStorage.removeItem("agent_name");
      }

      const from =
        typeof (location.state as { from?: string } | null)?.from === "string"
          ? (location.state as { from: string }).from
          : "/";

      const targetPath = from.includes("?")
        ? `${from}&account=${result.company.account}`
        : `${from}?account=${result.company.account}`;

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
        <h1>Login da empresa</h1>
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
        </form>
      </section>
    </main>
  );
}
