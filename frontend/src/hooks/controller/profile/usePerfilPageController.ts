import { useCallback, useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { AuthService, type CompanyAgent } from "../../../services/auth/auth.service";
import { AppStorage } from "../../../services/storage/storage.service";
import {
  profileFormSchema,
  teamAgentFormSchema,
  type AgentRoleValue,
  type ProfileFormValues,
  type TeamAgentFormValues,
} from "../../../schemas/profile.schema";
import { getErrorMessage } from "../../../utils/error";
import { buildNormalizedSearch } from "../../../utils/locationSearch";

type ProfileMeta = {
  active: boolean;
  currentAgentId: string;
  role: AgentRoleValue;
};

const DEFAULT_PROFILE_VALUES: ProfileFormValues = {
  name: "",
  email: "",
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
};

const DEFAULT_TEAM_AGENT_VALUES: TeamAgentFormValues = {
  name: "",
  email: "",
  password: "",
  role: "operator",
};

function getAgentDisplayLabel(agent: Pick<CompanyAgent, "name" | "email">) {
  return agent.name?.trim() || agent.email?.trim() || "este usuario";
}

function sortAgents(agents: CompanyAgent[]) {
  return [...agents].sort((left, right) =>
    getAgentDisplayLabel(left).localeCompare(getAgentDisplayLabel(right), "pt-BR"),
  );
}

function replaceTeamMember(teamMembers: CompanyAgent[], nextMember: CompanyAgent) {
  return teamMembers.map((member) => (member.id === nextMember.id ? nextMember : member));
}

export function usePerfilPageController() {
  const [profileMeta, setProfileMeta] = useState<ProfileMeta>({
    active: true,
    currentAgentId: "",
    role: "operator",
  });
  const [teamMembers, setTeamMembers] = useState<CompanyAgent[]>([]);
  const [teamSearch, setTeamSearch] = useState("");
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreatingAgent, setIsCreatingAgent] = useState(false);
  const [isTeamLoading, setIsTeamLoading] = useState(false);
  const [busyAgentId, setBusyAgentId] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const normalizedSearch = buildNormalizedSearch(location.search);

  const profileForm = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: DEFAULT_PROFILE_VALUES,
    mode: "onChange",
  });

  const newAgentForm = useForm<TeamAgentFormValues>({
    resolver: zodResolver(teamAgentFormSchema),
    defaultValues: DEFAULT_TEAM_AGENT_VALUES,
    mode: "onChange",
  });

  const isAdmin = profileMeta.role === "admin";

  const filteredTeamMembers = useMemo(() => {
    const query = teamSearch.trim().toLowerCase();

    if (!query) {
      return teamMembers;
    }

    return teamMembers.filter((member) =>
      `${member.name ?? ""} ${member.email ?? ""}`.toLowerCase().includes(query),
    );
  }, [teamMembers, teamSearch]);

  const teamSummary = useMemo(
    () => ({
      total: teamMembers.length,
      active: teamMembers.filter((member) => member.active).length,
      blocked: teamMembers.filter((member) => !member.active).length,
      admins: teamMembers.filter((member) => member.role === "admin").length,
    }),
    [teamMembers],
  );

  const loadTeam = useCallback(async () => {
    const result = await AuthService.listTeam();
    setTeamMembers(sortAgents(result.agents ?? []));
  }, []);

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      try {
        const result = await AuthService.me();

        if (!isMounted) {
          return;
        }

        profileForm.reset({
          ...DEFAULT_PROFILE_VALUES,
          name: result.agent?.name ?? "",
          email: result.agent?.email ?? "",
        });

        const nextMeta: ProfileMeta = {
          active: result.agent?.active ?? true,
          currentAgentId: result.agent?.id ?? "",
          role: result.agent?.role ?? "operator",
        };

        setProfileMeta(nextMeta);

        if (nextMeta.role === "admin") {
          await loadTeam();
        }
      } catch (error: unknown) {
        if (isMounted) {
          toast.error(getErrorMessage(error, "Nao foi possivel carregar o perfil."));
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [loadTeam, profileForm]);

  const handleLogout = useCallback(() => {
    AppStorage.clearSession();
    navigate("/login", {
      replace: true,
      state: { from: `${location.pathname}${normalizedSearch}` },
    });
  }, [location.pathname, navigate, normalizedSearch]);

  const handleSaveProfile = profileForm.handleSubmit(async (values) => {
    if (isSaving) {
      return;
    }

    try {
      setIsSaving(true);

      const hasPasswordChange = Boolean(
        values.currentPassword.trim() ||
          values.newPassword.trim() ||
          values.confirmPassword.trim(),
      );

      const result = await AuthService.updateProfile({
        name: values.name.trim(),
        ...(hasPasswordChange
          ? {
              currentPassword: values.currentPassword.trim(),
              newPassword: values.newPassword.trim(),
            }
          : {}),
      });

      AppStorage.setAgentName(result.agent.name ?? values.name.trim());

      profileForm.reset({
        ...DEFAULT_PROFILE_VALUES,
        name: result.agent.name ?? values.name.trim(),
        email: result.agent.email ?? values.email.trim(),
      });

      setProfileMeta((previous) => ({
        ...previous,
        active: result.agent.active ?? previous.active,
        role: result.agent.role ?? previous.role,
      }));

      toast.success(result.message || "Perfil atualizado com sucesso.");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Nao foi possivel atualizar o perfil."));
    } finally {
      setIsSaving(false);
    }
  });

  const handleCreateAgent = newAgentForm.handleSubmit(async (values) => {
    if (!isAdmin || isCreatingAgent) {
      return;
    }

    try {
      setIsCreatingAgent(true);
      const result = await AuthService.createTeamAgent({
        name: values.name.trim(),
        email: values.email.trim(),
        password: values.password.trim(),
        role: values.role,
      });

      setTeamMembers((previous) => sortAgents([...previous, result.agent]));
      newAgentForm.reset(DEFAULT_TEAM_AGENT_VALUES);
      toast.success(`Usuario ${getAgentDisplayLabel(result.agent)} adicionado com sucesso.`);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Nao foi possivel adicionar o usuario."));
    } finally {
      setIsCreatingAgent(false);
    }
  });

  const openTeamModal = useCallback(async () => {
    if (!isAdmin) {
      return;
    }

    try {
      setIsTeamModalOpen(true);
      setIsTeamLoading(true);
      await loadTeam();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Nao foi possivel carregar a equipe."));
    } finally {
      setIsTeamLoading(false);
    }
  }, [isAdmin, loadTeam]);

  const closeTeamModal = useCallback(() => {
    setIsTeamModalOpen(false);
  }, []);

  const handleToggleAccess = useCallback(
    async (member: CompanyAgent) => {
      if (busyAgentId || member.id === profileMeta.currentAgentId) {
        return;
      }

      try {
        setBusyAgentId(member.id);
        const result = await AuthService.manageAgent(member.id, {
          active: !member.active,
        });

        setTeamMembers((previous) => replaceTeamMember(previous, result.agent));
        toast.success(result.message || "Acesso atualizado com sucesso.");
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, "Nao foi possivel atualizar o acesso."));
      } finally {
        setBusyAgentId("");
      }
    },
    [busyAgentId, profileMeta.currentAgentId],
  );

  const handleRoleChange = useCallback(
    async (member: CompanyAgent, role: AgentRoleValue) => {
      if (
        busyAgentId ||
        member.id === profileMeta.currentAgentId ||
        member.role === role
      ) {
        return;
      }

      try {
        setBusyAgentId(member.id);
        const result = await AuthService.manageAgent(member.id, { role });

        setTeamMembers((previous) => replaceTeamMember(previous, result.agent));
        toast.success(result.message || "Perfil de acesso atualizado.");
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, "Nao foi possivel atualizar a role."));
      } finally {
        setBusyAgentId("");
      }
    },
    [busyAgentId, profileMeta.currentAgentId],
  );

  const handleRemoveAgent = useCallback(
    async (agent: CompanyAgent) => {
      if (busyAgentId || agent.id === profileMeta.currentAgentId) {
        return;
      }

      const confirmed = window.confirm(
        `Remover o acesso de ${getAgentDisplayLabel(agent)}? Essa acao nao pode ser desfeita.`,
      );

      if (!confirmed) {
        return;
      }

      try {
        setBusyAgentId(agent.id);
        const result = await AuthService.removeAgent(agent.id);

        setTeamMembers((previous) =>
          previous.filter((member) => member.id !== agent.id),
        );
        toast.success(result.message || "Usuario removido com sucesso.");
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, "Nao foi possivel remover o usuario."));
      } finally {
        setBusyAgentId("");
      }
    },
    [busyAgentId, profileMeta.currentAgentId],
  );

  return {
    busyAgentId,
    closeTeamModal,
    currentAgentId: profileMeta.currentAgentId,
    filteredTeamMembers,
    handleCreateAgent,
    handleLogout,
    handleRemoveAgent,
    handleRoleChange,
    handleSaveProfile,
    handleToggleAccess,
    isAdmin,
    isCreatingAgent,
    isLoading,
    isSaving,
    isTeamLoading,
    isTeamModalOpen,
    newAgentForm,
    openTeamModal,
    profileForm,
    profileMeta,
    setTeamSearch,
    teamSearch,
    teamSummary,
  };
}
