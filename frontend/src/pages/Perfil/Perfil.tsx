import { memo } from "react";
import { Controller } from "react-hook-form";
import { DynamicModal, InputFields, MyButton, PageContainer } from "../../componente/Index";
import { usePerfilPageController } from "../../hooks/controller/profile/usePerfilPageController";
import type { AgentRoleValue } from "../../schemas/profile.schema";
import type { CompanyAgent } from "../../services/auth/auth.service";
import styles from "./Styles/Perfil.module.css";

type TeamMemberRowProps = {
  busyAgentId: string;
  currentAgentId: string;
  member: CompanyAgent;
  onRemove: (member: CompanyAgent) => void;
  onToggleAccess: (member: CompanyAgent) => void;
  onUpdateRole: (member: CompanyAgent, role: AgentRoleValue) => void;
};

type RoleSegmentSelectorProps = {
  onChange: (role: AgentRoleValue) => void;
  value: AgentRoleValue;
};

function getRoleLabel(role: AgentRoleValue) {
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
      </div>
    </label>
  );
});

const TeamMemberRow = memo(function TeamMemberRow({
  busyAgentId,
  currentAgentId,
  member,
  onRemove,
  onToggleAccess,
  onUpdateRole,
}: TeamMemberRowProps) {
  const isCurrentUser = member.id === currentAgentId;
  const isBusy = busyAgentId === member.id;

  return (
    <article className={styles.teamRow}>
      <div className={styles.teamRowMain}>
        <div className={styles.teamIdentity}>
          <strong>{member.name?.trim() || "Usuario sem nome"}</strong>
          <span>{member.email?.trim() || "Email nao informado"}</span>
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
          {isCurrentUser && <span className={styles.selfBadge}>Voce</span>}
        </div>
      </div>

      <div className={styles.teamRowActions}>
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
        </div>

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
    </article>
  );
});

export function PerfilPage() {
  const {
    busyAgentId,
    closeTeamModal,
    currentAgentId,
    filteredTeamMembers,
    handleCreateAgent,
    handleLogout,
    handleRemoveAgent,
    handleRoleChange,
    handleSaveProfile,
    handleSyncChatwootAgents,
    handleToggleAccess,
    isAdmin,
    isCreatingAgent,
    isLoading,
    isSaving,
    isSyncingChatwootAgents,
    isTeamLoading,
    isTeamModalOpen,
    newAgentForm,
    openTeamModal,
    profileForm,
    profileEmail,
    profileMeta,
    setTeamSearch,
    teamSearch,
    teamSummary,
  } = usePerfilPageController();

  return (
    <PageContainer className={styles.page}>
      <section className={styles.hero}>
        <div>
          <span className={styles.badge}>
            {isAdmin ? "Painel de administracao" : "Perfil do usuario"}
          </span>
          <h1>{isAdmin ? "Gerencie conta e equipe" : "Gerencie seus dados de acesso"}</h1>
          <p>
            {isAdmin
              ? "Acompanhe seu acesso e gerencie a equipe da empresa quando precisar."
              : "Atualize nome, altere a senha com seguranca e encerre sua sessao quando precisar."}
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
              <p>Edite seus dados sem sair da area administrativa.</p>
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
                    <InputFields label="Nome do usuario" {...field} />
                    <FormFieldError message={profileForm.formState.errors.name?.message} />
                  </div>
                )}
              />

              <div className={styles.readOnlyField}>
                <span>Email de acesso</span>
                <strong>{profileEmail || "Nao informado"}</strong>
              </div>
            </div>

            <div className={styles.sectionHeader}>
              <h2>Seguranca</h2>
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
                text={isSaving ? "Salvando..." : "Salvar alteracoes"}
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
                <p>Uma visao rapida da equipe, dos acessos ativos e das etiquetas disponiveis no chat.</p>
              </div>

              <div className={styles.summaryGrid}>
                <SummaryMetricCard label="Usuarios" value={teamSummary.total} />
                <SummaryMetricCard label="Ativos" value={teamSummary.active} />
                <SummaryMetricCard label="Bloqueados" value={teamSummary.blocked} />
                <SummaryMetricCard label="Admins" value={teamSummary.admins} />
              </div>

              <div className={styles.adminNotes}>
                <strong>Gestao de equipe</strong>
                <p>Abra a administracao para cadastrar acessos, organizar os perfis da empresa e importar os agentes ja existentes do Maestro quando precisar.</p>
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
          title="Administracao da equipe"
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
                        <InputFields label="Senha provisoria" type="password" {...field} />
                        <FormFieldError
                          message={newAgentForm.formState.errors.password?.message}
                        />
                      </div>
                    )}
                  />

                  <Controller
                    name="role"
                    control={newAgentForm.control}
                    render={({ field }) => (
                      <div className={styles.fieldBlock}>
                        <RoleSegmentSelector
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
                  {isTeamLoading ? "Atualizando..." : `${filteredTeamMembers.length} usuarios`}
                </span>
              </div>

              <div className={styles.teamModalList}>
                {isTeamLoading ? (
                  <div className={styles.teamEmptyState}>
                    <strong>Carregando equipe</strong>
                    <span>Buscando usuarios vinculados a esta empresa.</span>
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
                      busyAgentId={busyAgentId}
                      currentAgentId={currentAgentId}
                      member={member}
                      onRemove={handleRemoveAgent}
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

    </PageContainer>
  );
}
