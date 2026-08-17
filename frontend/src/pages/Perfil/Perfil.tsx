import { memo, useState } from "react";
import { Controller } from "react-hook-form";
import { Eye, EyeOff, KeyRound, Pencil } from "lucide-react";
import { DynamicModal, InputFields, MyButton, PageContainer } from "../../componente/Index";
import { usePerfilPageController } from "../../hooks/controller/profile/usePerfilPageController";
import type { AgentRoleValue } from "../../schemas/profile.schema";
import type { CompanyAgent } from "../../services/auth/auth.service";
import styles from "./Styles/Perfil.module.css";

type TeamMemberRowProps = {
  allowSuperAdmin: boolean;
  busyAgentId: string;
  currentAgentId: string;
  member: CompanyAgent;
  onEditName: (member: CompanyAgent) => void;
  onRemove: (member: CompanyAgent) => void;
  onResetPassword: (member: CompanyAgent) => void;
  onToggleAccess: (member: CompanyAgent) => void;
  onUpdateRole: (member: CompanyAgent, role: AgentRoleValue) => void;
};

type RoleSegmentSelectorProps = {
  allowSuperAdmin: boolean;
  onChange: (role: AgentRoleValue) => void;
  value: AgentRoleValue;
};

function getRoleLabel(role: AgentRoleValue) {
  if (role === "super_admin") {
    return "Super Admin";
  }

  return role === "admin" ? "Administrador" : "Operador";
}

const FormFieldError = memo(function FormFieldError({
  message,
}: {
  message?: string;
}) {
  if (!message) {
    return null;
  }

  return <span className={styles.fieldError}>{message}</span>;
});

const SummaryMetricCard = memo(function SummaryMetricCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className={styles.summaryMetric}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
});

const RoleSegmentSelector = memo(function RoleSegmentSelector({
  allowSuperAdmin,
  onChange,
  value,
}: RoleSegmentSelectorProps) {
  return (
    <label className={styles.dropdownField}>
      <span>Perfil inicial</span>
      <div className={styles.roleSegmented}>
        <button
          type="button"
          className={`${styles.roleSegmentButton} ${
            value === "operator" ? styles.roleSegmentButtonActive : ""
          }`}
          onClick={() => onChange("operator")}
        >
          Operador
        </button>
        <button
          type="button"
          className={`${styles.roleSegmentButton} ${
            value === "admin" ? styles.roleSegmentButtonActive : ""
          }`}
          onClick={() => onChange("admin")}
        >
          Administrador
        </button>
        {allowSuperAdmin && (
          <button
            type="button"
            className={`${styles.roleSegmentButton} ${
              value === "super_admin" ? styles.roleSegmentButtonActive : ""
            }`}
            onClick={() => onChange("super_admin")}
          >
            Super Admin
          </button>
        )}
      </div>
    </label>
  );
});

const TeamMemberRow = memo(function TeamMemberRow({
  allowSuperAdmin,
  busyAgentId,
  currentAgentId,
  member,
  onEditName,
  onRemove,
  onResetPassword,
  onToggleAccess,
  onUpdateRole,
}: TeamMemberRowProps) {
  const isCurrentUser = member.id === currentAgentId;
  const isBusy = busyAgentId === member.id;

  return (
    <article className={styles.teamRow}>
      <div className={styles.teamRowMain}>
        <div className={styles.teamIdentity}>
          <div className={styles.teamIdentityName}>
            <strong>{member.name?.trim() || "Usuário sem nome"}</strong>
            <button
              type="button"
              className={styles.editNameButton}
              disabled={isBusy || isCurrentUser}
              onClick={() => onEditName(member)}
              title="Editar nome"
              aria-label="Editar nome"
            >
              <Pencil size={13} />
            </button>
          </div>
          <span>{member.email?.trim() || "Email não informado"}</span>
        </div>
        <div className={styles.teamTags}>
          <span className={styles.roleBadge}>{getRoleLabel(member.role)}</span>
          <span
            className={`${styles.statusBadge} ${
              member.active ? styles.statusActive : styles.statusBlocked
            }`}
          >
            {member.active ? "Ativo" : "Bloqueado"}
          </span>
          <span className={styles.syncBadge}>
            {member.chatwootLinked ? "Maestro OK" : "Sem Maestro"}
          </span>
          {isCurrentUser && <span className={styles.selfBadge}>Você</span>}
        </div>
      </div>

      <div className={styles.teamRowActions}>
        <div className={styles.actionGroup}>
          <span className={styles.actionGroupLabel}>Cargo</span>
          <div className={styles.inlineRoleSwitcher}>
            <button
              type="button"
              className={`${styles.roleSwitchButton} ${
                member.role === "operator" ? styles.roleSwitchActive : ""
              }`}
              disabled={isBusy || isCurrentUser}
              onClick={() => onUpdateRole(member, "operator")}
            >
              Operador
            </button>
            <button
              type="button"
              className={`${styles.roleSwitchButton} ${
                member.role === "admin" ? styles.roleSwitchActive : ""
              }`}
              disabled={isBusy || isCurrentUser}
              onClick={() => onUpdateRole(member, "admin")}
            >
              Admin
            </button>
            {allowSuperAdmin && (
              <button
                type="button"
                className={`${styles.roleSwitchButton} ${
                  member.role === "super_admin" ? styles.roleSwitchActive : ""
                }`}
                disabled={isBusy || isCurrentUser}
                onClick={() => onUpdateRole(member, "super_admin")}
              >
                Super Admin
              </button>
            )}
          </div>
        </div>

        <div className={`${styles.actionGroup} ${styles.actionGroupManage}`}>
          <span className={styles.actionGroupLabel}>Ações</span>
          <div className={styles.manageButtons}>
            <button
              type="button"
              className={styles.resetPasswordAction}
              disabled={
                isBusy ||
                isCurrentUser ||
                (member.role === "super_admin" && !allowSuperAdmin)
              }
              onClick={() => onResetPassword(member)}
            >
              <KeyRound size={13} />
              Redefinir senha
            </button>

            <button
              type="button"
              className={styles.secondaryAction}
              disabled={isBusy || isCurrentUser}
              onClick={() => onToggleAccess(member)}
            >
              {isBusy ? "Salvando..." : member.active ? "Bloquear" : "Desbloquear"}
            </button>

            <button
              type="button"
              className={styles.removeMemberButton}
              disabled={isBusy || isCurrentUser}
              onClick={() => onRemove(member)}
            >
              {isBusy ? "Processando..." : "Excluir"}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
});

export function PerfilPage() {
  const {
    busyAgentId,
    closeEditName,
    closeResetPassword,
    closeTeamModal,
    currentAgentId,
    editNameTarget,
    editNameValue,
    filteredTeamMembers,
    handleCreateAgent,
    handleLogout,
    handleRemoveAgent,
    handleResetPassword,
    handleRoleChange,
    handleSaveName,
    handleSaveProfile,
    handleSyncChatwootAgents,
    handleToggleAccess,
    isAdmin,
    isSuperAdmin,
    isCreatingAgent,
    isLoading,
    isResettingPassword,
    isSavingName,
    isSaving,
    isSyncingChatwootAgents,
    isTeamLoading,
    isTeamModalOpen,
    newAgentForm,
    openEditName,
    openResetPassword,
    openTeamModal,
    profileForm,
    profileEmail,
    profileMeta,
    resetPasswordForm,
    resetPasswordTarget,
    setEditNameValue,
    setTeamSearch,
    teamSearch,
    teamSummary,
  } = usePerfilPageController();

  // "Olhinho" do modal de redefinição: mostra/oculta as duas senhas juntas.
  const [showResetPassword, setShowResetPassword] = useState(false);

  return (
    <PageContainer className={styles.page}>
      <section className={styles.hero}>
        <div>
          <span className={styles.badge}>
            {isAdmin ? "Painel de administração" : "Perfil do usuário"}
          </span>
          <h1>{isAdmin ? "Gerencie conta e equipe" : "Gerencie seus dados de acesso"}</h1>
          <p>
            {isAdmin
              ? "Acompanhe seu acesso e gerencie a equipe da empresa quando precisar."
              : "Atualize nome, altere a senha com segurança e encerre sua sessão quando precisar."}
          </p>
        </div>
        <div className={styles.heroActions}>
          <MyButton text="Fazer logout" variant="secondary" onClick={handleLogout} />
        </div>
      </section>

      {isLoading ? (
        <section className={styles.loadingPanel}>
          <span className={styles.loadingBadge}>Carregando perfil</span>
          <p>Aguarde enquanto buscamos seus dados.</p>
        </section>
      ) : (
        <section className={styles.contentGrid}>
          <article className={styles.profileCard}>
            <div className={styles.sectionHeader}>
              <h2>Conta atual</h2>
              <p>Edite seus dados sem sair da área administrativa.</p>
            </div>

            <div className={styles.accountSummary}>
              <div className={styles.summaryPill}>
                <span>Role</span>
                <strong>{getRoleLabel(profileMeta.role)}</strong>
              </div>
              <div className={styles.summaryPill}>
                <span>Status</span>
                <strong>{profileMeta.active ? "Ativo" : "Bloqueado"}</strong>
              </div>
            </div>

            <div className={styles.formGrid}>
              <Controller
                name="name"
                control={profileForm.control}
                render={({ field }) => (
                  <div className={styles.fieldBlock}>
                    <InputFields label="Nome do usuário" {...field} />
                    <FormFieldError message={profileForm.formState.errors.name?.message} />
                  </div>
                )}
              />

              <div className={styles.readOnlyField}>
                <span>Email de acesso</span>
                <strong>{profileEmail || "Não informado"}</strong>
              </div>
            </div>

            <div className={styles.sectionHeader}>
              <h2>Segurança</h2>
              <p>Troque a senha apenas quando precisar.</p>
            </div>

            <div className={styles.formGridCompact}>
              <Controller
                name="currentPassword"
                control={profileForm.control}
                render={({ field }) => (
                  <div className={styles.fieldBlock}>
                    <InputFields
                      label="Senha atual"
                      type="password"
                      autoComplete="current-password"
                      {...field}
                    />
                    <FormFieldError
                      message={profileForm.formState.errors.currentPassword?.message}
                    />
                  </div>
                )}
              />

              <Controller
                name="newPassword"
                control={profileForm.control}
                render={({ field }) => (
                  <div className={styles.fieldBlock}>
                    <InputFields
                      label="Nova senha"
                      type="password"
                      autoComplete="new-password"
                      {...field}
                    />
                    <FormFieldError
                      message={profileForm.formState.errors.newPassword?.message}
                    />
                  </div>
                )}
              />

              <Controller
                name="confirmPassword"
                control={profileForm.control}
                render={({ field }) => (
                  <div className={styles.fieldBlock}>
                    <InputFields
                      label="Confirmar nova senha"
                      type="password"
                      autoComplete="new-password"
                      {...field}
                    />
                    <FormFieldError
                      message={profileForm.formState.errors.confirmPassword?.message}
                    />
                  </div>
                )}
              />
            </div>

            <div className={styles.actions}>
              <MyButton
                text={isSaving ? "Salvando..." : "Salvar alterações"}
                variant="btn-enviar"
                disabled={isSaving}
                onClick={handleSaveProfile}
              />
            </div>
          </article>

          {isAdmin && (
            <aside className={styles.adminSummaryCard}>
              <div className={styles.sectionHeader}>
                <h2>Resumo administrativo</h2>
                <p>Uma visão rápida da equipe, dos acessos ativos e das etiquetas disponíveis no chat.</p>
              </div>

              <div className={styles.summaryGrid}>
                <SummaryMetricCard label="Usuários" value={teamSummary.total} />
                <SummaryMetricCard label="Ativos" value={teamSummary.active} />
                <SummaryMetricCard label="Bloqueados" value={teamSummary.blocked} />
                <SummaryMetricCard label="Admins" value={teamSummary.admins} />
              </div>

              <div className={styles.adminNotes}>
                <strong>Gestão de equipe</strong>
                <p>Abra a administração para cadastrar acessos, organizar os perfis da empresa e importar os agentes já existentes do Maestro quando precisar.</p>
              </div>

              <div className={styles.adminActions}>
                <MyButton
                  text="Gerenciar equipe"
                  variant="secondary"
                  onClick={openTeamModal}
                />
                <MyButton
                  text={isSyncingChatwootAgents ? "Sincronizando..." : "Importar e sincronizar agentes"}
                  variant="btn-enviar"
                  disabled={isSyncingChatwootAgents}
                  onClick={handleSyncChatwootAgents}
                />
              </div>
            </aside>
          )}
        </section>
      )}

      {isAdmin && (
        <DynamicModal
          open={isTeamModalOpen}
          type="custom"
          size="wide"
          title="Administração da equipe"
          containerClassName={styles.teamModalContainer}
          onClose={closeTeamModal}
          customContent={
            <div className={styles.teamModalContent}>
              <div className={styles.teamModalIntro}>
                <p>Cadastre novos acessos, crie o agente no Maestro e depois atualize a base para buscar o token gerado automaticamente.</p>
              </div>

              <div className={styles.teamModalCreate}>
                <div className={styles.createGrid}>
                  <Controller
                    name="name"
                    control={newAgentForm.control}
                    render={({ field }) => (
                      <div className={styles.fieldBlock}>
                        <InputFields label="Nome do agente" {...field} />
                        <FormFieldError
                          message={newAgentForm.formState.errors.name?.message}
                        />
                      </div>
                    )}
                  />

                  <Controller
                    name="email"
                    control={newAgentForm.control}
                    render={({ field }) => (
                      <div className={styles.fieldBlock}>
                        <InputFields label="Email" {...field} />
                        <FormFieldError
                          message={newAgentForm.formState.errors.email?.message}
                        />
                      </div>
                    )}
                  />

                  <Controller
                    name="password"
                    control={newAgentForm.control}
                    render={({ field }) => (
                      <div className={styles.fieldBlock}>
                        <InputFields label="Senha provisória" type="password" {...field} />
                        <FormFieldError
                          message={newAgentForm.formState.errors.password?.message}
                        />
                      </div>
                    )}
                  />

                  <Controller
                    name="confirmPassword"
                    control={newAgentForm.control}
                    render={({ field }) => (
                      <div className={styles.fieldBlock}>
                        <InputFields label="Confirmar senha" type="password" {...field} />
                        <FormFieldError
                          message={newAgentForm.formState.errors.confirmPassword?.message}
                        />
                      </div>
                    )}
                  />

                  <p className={styles.createPasswordHint}>
                    A senha precisa ter no mínimo <strong>6 caracteres</strong>, com
                    letra <strong>maiúscula</strong>, <strong>minúscula</strong> e um{" "}
                    <strong>caractere especial</strong> (ex.: !@#$%).
                  </p>

                  <Controller
                    name="role"
                    control={newAgentForm.control}
                    render={({ field }) => (
                      <div className={styles.fieldBlock}>
                        <RoleSegmentSelector
                          allowSuperAdmin={isSuperAdmin}
                          value={field.value}
                          onChange={field.onChange}
                        />
                      </div>
                    )}
                  />

                  <div className={styles.createActions}>
                    <MyButton
                      text={isCreatingAgent ? "Adicionando..." : "Adicionar agente"}
                      variant="secondary"
                      disabled={isCreatingAgent}
                      onClick={handleCreateAgent}
                    />
                  </div>
                </div>
              </div>

              <div className={styles.teamModalToolbar}>
                <input
                  value={teamSearch}
                  onChange={(event) => setTeamSearch(event.target.value)}
                  placeholder="Buscar agente por nome ou email"
                  className={styles.teamSearchInput}
                />
                <span className={styles.teamCounter}>
                  {isTeamLoading ? "Atualizando..." : `${filteredTeamMembers.length} usuários`}
                </span>
              </div>

              <div className={styles.teamModalList}>
                {isTeamLoading ? (
                  <div className={styles.teamEmptyState}>
                    <strong>Carregando equipe</strong>
                    <span>Buscando usuários vinculados a esta empresa.</span>
                  </div>
                ) : filteredTeamMembers.length === 0 ? (
                  <div className={styles.teamEmptyState}>
                    <strong>Nenhum agente encontrado</strong>
                    <span>Use a busca ou adicione um novo acesso acima.</span>
                  </div>
                ) : (
                  filteredTeamMembers.map((member) => (
                    <TeamMemberRow
                      key={member.id}
                      allowSuperAdmin={isSuperAdmin}
                      busyAgentId={busyAgentId}
                      currentAgentId={currentAgentId}
                      member={member}
                      onEditName={openEditName}
                      onRemove={handleRemoveAgent}
                      onResetPassword={(target) => {
                        setShowResetPassword(false);
                        openResetPassword(target);
                      }}
                      onToggleAccess={handleToggleAccess}
                      onUpdateRole={handleRoleChange}
                    />
                  ))
                )}
              </div>
            </div>
          }
        />
      )}

      <DynamicModal
        open={Boolean(resetPasswordTarget)}
        type="custom"
        size="default"
        title={`Redefinir senha — ${
          resetPasswordTarget
            ? resetPasswordTarget.name?.trim() || resetPasswordTarget.email || ""
            : ""
        }`}
        onClose={closeResetPassword}
        customContent={
          <div className={styles.resetPasswordContent}>
            <p className={styles.resetPasswordHint}>
              A senha será alterada no sistema de cobrança e no chat (Maestro).
              Requisitos: mínimo de <strong>6 caracteres</strong>, com letra{" "}
              <strong>maiúscula</strong>, <strong>minúscula</strong> e um{" "}
              <strong>caractere especial</strong> (ex.: !@#$%).
            </p>

            <Controller
              name="newPassword"
              control={resetPasswordForm.control}
              render={({ field }) => (
                <div className={styles.fieldBlock}>
                  <InputFields
                    label="Nova senha"
                    type={showResetPassword ? "text" : "password"}
                    autoComplete="new-password"
                    {...field}
                  />
                  <FormFieldError
                    message={resetPasswordForm.formState.errors.newPassword?.message}
                  />
                </div>
              )}
            />

            <Controller
              name="confirmPassword"
              control={resetPasswordForm.control}
              render={({ field }) => (
                <div className={styles.fieldBlock}>
                  <InputFields
                    label="Repetir nova senha"
                    type={showResetPassword ? "text" : "password"}
                    autoComplete="new-password"
                    {...field}
                  />
                  <FormFieldError
                    message={
                      resetPasswordForm.formState.errors.confirmPassword?.message
                    }
                  />
                </div>
              )}
            />

            <button
              type="button"
              className={styles.togglePasswordButton}
              onClick={() => setShowResetPassword((previous) => !previous)}
            >
              {showResetPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              {showResetPassword ? "Ocultar senhas" : "Mostrar senhas"}
            </button>

            <div className={styles.resetPasswordActions}>
              <MyButton
                text="Cancelar"
                variant="secondary"
                disabled={isResettingPassword}
                onClick={closeResetPassword}
              />
              <MyButton
                text={isResettingPassword ? "Salvando..." : "Confirmar nova senha"}
                variant="primary"
                disabled={isResettingPassword}
                onClick={() => void handleResetPassword()}
              />
            </div>
          </div>
        }
      />

      <DynamicModal
        open={Boolean(editNameTarget)}
        type="custom"
        size="default"
        title="Editar nome do agente"
        onClose={closeEditName}
        customContent={
          <div className={styles.resetPasswordContent}>
            <p className={styles.resetPasswordHint}>
              {editNameTarget?.email || "Atualize apenas o nome exibido do agente."}
            </p>

            <div className={styles.fieldBlock}>
              <InputFields
                label="Nome do agente"
                value={editNameValue}
                onChange={(event) => setEditNameValue(event.target.value)}
              />
            </div>

            <div className={styles.resetPasswordActions}>
              <MyButton
                text="Cancelar"
                variant="secondary"
                disabled={isSavingName}
                onClick={closeEditName}
              />
              <MyButton
                text={isSavingName ? "Salvando..." : "Salvar nome"}
                variant="primary"
                disabled={isSavingName}
                onClick={() => void handleSaveName()}
              />
            </div>
          </div>
        }
      />

    </PageContainer>
  );
}
