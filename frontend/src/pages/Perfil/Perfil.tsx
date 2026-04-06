import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { InputFields, MyButton, PageContainer } from "../../componente/Index";
import { AuthService } from "../../services/auth/auth.service";
import { AppStorage } from "../../services/storage/storage.service";
import { getErrorMessage } from "../../utils/error";
import styles from "./Styles/Perfil.module.css";

type ProfileState = {
  name: string;
  email: string;
};

export function PerfilPage() {
  const [profile, setProfile] = useState<ProfileState>({ name: "", email: "" });
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const hasPasswordChange = useMemo(
    () =>
      Boolean(
        currentPassword.trim() || newPassword.trim() || confirmPassword.trim(),
      ),
    [confirmPassword, currentPassword, newPassword],
  );

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      try {
        const result = await AuthService.me();

        if (!isMounted) return;

        setProfile({
          name: result.agent?.name ?? "",
          email: result.agent?.email ?? "",
        });
      } catch (error: unknown) {
        if (!isMounted) return;
        toast.error(getErrorMessage(error, "Nao foi possivel carregar o perfil."));
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleLogout = () => {
    AppStorage.clearSession();
    navigate("/login", {
      replace: true,
      state: { from: `${location.pathname}${location.search}` },
    });
  };

  const handleSave = async () => {
    if (isSaving) return;

    const trimmedName = profile.name.trim();
    if (!trimmedName) {
      toast.warning("Informe o nome do usuario.");
      return;
    }

    if (hasPasswordChange) {
      if (!currentPassword.trim()) {
        toast.warning("Informe a senha atual.");
        return;
      }

      if (!newPassword.trim()) {
        toast.warning("Informe a nova senha.");
        return;
      }

      if (newPassword.trim().length < 6) {
        toast.warning("A nova senha precisa ter pelo menos 6 caracteres.");
        return;
      }

      if (newPassword !== confirmPassword) {
        toast.warning("A confirmacao da nova senha nao confere.");
        return;
      }
    }

    try {
      setIsSaving(true);
      const result = await AuthService.updateProfile({
        name: trimmedName,
        ...(hasPasswordChange
          ? {
              currentPassword: currentPassword.trim(),
              newPassword: newPassword.trim(),
            }
          : {}),
      });

      AppStorage.setAgentName(result.agent.name ?? trimmedName);
      setProfile((prev) => ({
        ...prev,
        name: result.agent.name ?? prev.name,
        email: result.agent.email ?? prev.email,
      }));
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success(result.message || "Perfil atualizado com sucesso.");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Nao foi possivel atualizar o perfil."));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <PageContainer className={styles.page}>
      <section className={styles.hero}>
        <div>
          <span className={styles.badge}>Perfil do usuario</span>
          <h1>Gerencie seus dados de acesso</h1>
          <p>
            Atualize nome, altere a senha com seguranca e encerre sua sessao
            quando precisar.
          </p>
        </div>
        <MyButton
          text="Fazer logout"
          variant="secondary"
          onClick={handleLogout}
        />
      </section>

      <section className={styles.card}>
        {isLoading ? (
          <div className={styles.loadingState}>
            <span className={styles.loadingBadge}>Carregando perfil</span>
            <p>Aguarde enquanto buscamos seus dados.</p>
          </div>
        ) : (
          <>
            <div className={styles.sectionHeader}>
              <h2>Dados do usuario</h2>
              <p>Essas informacoes aparecem no seu acesso ao painel.</p>
            </div>

            <div className={styles.formGrid}>
              <InputFields
                label="Nome do usuario"
                value={profile.name}
                onChange={(event) =>
                  setProfile((prev) => ({ ...prev, name: event.target.value }))
                }
              />

              <div className={styles.readOnlyField}>
                <span>Email de acesso</span>
                <strong>{profile.email || "Nao informado"}</strong>
              </div>
            </div>

            <div className={styles.sectionHeader}>
              <h2>Seguranca</h2>
              <p>Preencha os campos abaixo apenas se quiser trocar a senha atual.</p>
            </div>

            <div className={styles.formGrid}>
              <InputFields
                label="Senha atual"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />

              <InputFields
                label="Nova senha"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />

              <InputFields
                label="Confirmar nova senha"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </div>

            <div className={styles.actions}>
              <MyButton
                text={isSaving ? "Salvando..." : "Salvar alteracoes"}
                variant="btn-enviar"
                disabled={isSaving || isLoading}
                onClick={handleSave}
              />
            </div>
          </>
        )}
      </section>
    </PageContainer>
  );
}
