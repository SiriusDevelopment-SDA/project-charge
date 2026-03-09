import { useEffect } from "react";
import { toast } from "react-toastify";
import { ChatwootClientService } from "../../../services/chatwoot/chatwootClient.service";
import type {
  ChatwootAgent,
  ChatwootInboxOption,
  ChatwootTeam,
} from "../../../types/chatwootApiTypes";
import { getErrorMessage } from "../../../utils/error";

type BootstrapParams = {
  account: string;
  setInboxes: (value: ChatwootInboxOption[]) => void;
  setInboxIdentifier: (value: string) => void;
  setShowInboxPicker: (value: boolean) => void;
  setAccountApiEnabled: (value: boolean) => void;
};

export function useChatwootBootstrap({
  account,
  setInboxes,
  setInboxIdentifier,
  setShowInboxPicker,
  setAccountApiEnabled,
}: BootstrapParams) {
  useEffect(() => {
    let mounted = true;
    const boot = async () => {
      if (!account) {
        toast.error("Account não encontrada na URL.");
        return;
      }
      try {
        const bootstrap = await ChatwootClientService.getBootstrap(account);
        if (!mounted) return;

        const options = bootstrap.chatwoot.inboxes ?? [];
        const selected =
          bootstrap.chatwoot.selectedInboxIdentifier ?? options[0]?.identifier ?? "";
        setInboxes(options);
        setInboxIdentifier(selected);
        setShowInboxPicker(options.length > 1 && !bootstrap.chatwoot.selectedInboxIdentifier);
        setAccountApiEnabled(Boolean(bootstrap.chatwoot.permissions?.accountApi));
      } catch (error: unknown) {
        if (!mounted) return;
        toast.error(getErrorMessage(error, "Erro ao carregar Chatwoot."));
      }
    };

    void boot();
    return () => {
      mounted = false;
    };
  }, [account, setInboxes, setInboxIdentifier, setShowInboxPicker, setAccountApiEnabled]);
}

type MetaParams = {
  account: string;
  accountApiEnabled: boolean;
  setTeams: (value: ChatwootTeam[]) => void;
  setAgents: (value: ChatwootAgent[]) => void;
};

export function useChatwootMetaRefresh({
  account,
  accountApiEnabled,
  setTeams,
  setAgents,
}: MetaParams) {
  useEffect(() => {
    const refreshMeta = async () => {
      if (!account || !accountApiEnabled) {
        setTeams([]);
        setAgents([]);
        return;
      }
      try {
        const [teamRows, agentRows] = await Promise.all([
          ChatwootClientService.listTeams(account),
          ChatwootClientService.listAgents(account),
        ]);
        setTeams(teamRows);
        setAgents(agentRows);
      } catch {
        setTeams([]);
        setAgents([]);
      }
    };

    void refreshMeta();
  }, [account, accountApiEnabled, setTeams, setAgents]);
}

type AutoLoadParams = {
  account: string;
  inboxIdentifier: string;
  inboxesLength: number;
  statusFilter: string;
  loadConversations: () => Promise<void>;
};

export function useChatwootAutoLoadConversations({
  account,
  inboxIdentifier,
  inboxesLength,
  statusFilter,
  loadConversations,
}: AutoLoadParams) {
  useEffect(() => {
    if (!account) return;
    if (!inboxIdentifier && inboxesLength) return;
    void loadConversations();
  }, [account, inboxIdentifier, inboxesLength, statusFilter, loadConversations]);
}
