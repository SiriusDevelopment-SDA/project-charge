import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import { ChatwootClientService } from "../../../services/chatwoot/chatwootClient.service";
import {
  createChatwootRealtimeConnection,
  type ChatwootRealtimeConfig,
} from "../../../services/realtime/chatwootRealtime";
import { AppStorage } from "../../../services/storage/storage.service";
import { useAccountParam } from "../../useAccountParam";
import type {
  ChatwootAgent,
  ChatwootContactDetails,
  ChatwootConversationItem,
  ChatwootMessageItem,
  ChatwootTeam,
} from "../../../types/chatwootApiTypes";
import { getErrorMessage } from "../../../utils/error";
import {
  areLabelsDifferent,
  extractConversationId,
  getConversationSearchText,
  groupConversationsByClient,
  isHumanPickupConversation,
  isIaConversation,
  deduplicateMessages,
  normalizeLabels,
  normalizeRealtimeConversation,
  normalizeRealtimeMessage,
  REALTIME_CONVERSATION_EVENTS,
  sortMessagesByTime,
  type ChatwootQueue,
} from "./chatwootHelpers";
import {
  loadStoredContactLabels,
  loadStoredLastConversationId,
  loadStoredReadConversationIds,
  persistReadConversationIds,
  persistStoredContactLabels,
  persistStoredLastConversationId,
} from "./chatwootStorage";

type BusyAction = null | "assume" | "resolve" | "reopen" | "pending" | "transfer";

export function useChatwootPageController() {
  const account = useAccountParam();
  const myName = AppStorage.getAgentName();
  const bottomRef = useRef<HTMLDivElement>(null);
  const activeIdRef = useRef<number | null>(null);
  const teamIdRef = useRef<string | null>(null);
  const fetchConversationsRef = useRef<(options?: { silent?: boolean; showErrorToast?: boolean }) => Promise<void>>(() => Promise.resolve());
  const loadMessagesRef = useRef<(conversationId: number) => Promise<void>>(() => Promise.resolve());
  const resolvedAccountRef = useRef<string>("");

  const [chatAccount, setChatAccount] = useState("");
  const [apiOk, setApiOk] = useState(false);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [availableLabels, setAvailableLabels] = useState<string[]>([]);
  const [realtimeConfig, setRealtimeConfig] = useState<ChatwootRealtimeConfig | null>(null);
  const [currentChatwootUserId, setCurrentChatwootUserId] = useState<number | null>(null);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [ready, setReady] = useState(false);
  const [bootErr, setBootErr] = useState<string | null>(null);

  const [conversations, setConversations] = useState<ChatwootConversationItem[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [refreshingConversations, setRefreshingConversations] = useState(false);

  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatwootMessageItem[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  // Cache de mensagens recebidas via WS para conversas não ativas.
  // Quando o agente abre a conversa, as mensagens são mescladas com as do banco.
  const wsPendingMessagesRef = useRef<Map<number, ChatwootMessageItem[]>>(new Map());

  const [teams, setTeams] = useState<ChatwootTeam[]>([]);
  const [agents, setAgents] = useState<ChatwootAgent[]>([]);

  const [queue, setQueue] = useState<ChatwootQueue>("human");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [savingConversationLabels, setSavingConversationLabels] = useState(false);
  const [savingContactLabels, setSavingContactLabels] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
  const [selectedConversationLabels, setSelectedConversationLabels] = useState<string[]>([]);
  const [initialConversationLabels, setInitialConversationLabels] = useState<string[]>([]);
  const [selectedContactLabels, setSelectedContactLabels] = useState<string[]>([]);
  const [initialContactLabels, setInitialContactLabels] = useState<string[]>([]);
  const [conversationLabelChoice, setConversationLabelChoice] = useState("");
  const [contactLabelChoice, setContactLabelChoice] = useState("");
  const [contactDetails, setContactDetails] = useState<ChatwootContactDetails | null>(null);
  const [assumedConversationIds, setAssumedConversationIds] = useState<Set<number>>(new Set());
  const [locallyReadConversationIds, setLocallyReadConversationIds] = useState<Set<number>>(new Set());
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [initialQueueSelectionDone, setInitialQueueSelectionDone] = useState(false);
  const [initialConversationSelectionDone, setInitialConversationSelectionDone] = useState(false);

  const resolvedAccount = chatAccount || account;
  resolvedAccountRef.current = resolvedAccount;
  teamIdRef.current = teamId;

  const notifySuccess = useCallback((message: string) => {
    toast.success(message);
  }, []);

  const notifyError = useCallback((error: unknown, fallback: string) => {
    toast.error(getErrorMessage(error, fallback));
  }, []);

  useEffect(() => {
    activeIdRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    setQueue("human");
    setActiveConversationId(null);
    setMessages([]);
    setInitialQueueSelectionDone(false);
    setInitialConversationSelectionDone(false);
  }, [account]);

  useEffect(() => {
    if (!account) return;

    let mounted = true;

    void (async () => {
      try {
        const [bootstrap, accountLabels] = await Promise.all([
          ChatwootClientService.getBootstrap(account),
          ChatwootClientService.listAccountLabels(account).catch(() => []),
        ]);

        if (!mounted) return;

        const normalizedAccount = String(bootstrap.company.account ?? "").trim();
        const targetAccount = normalizedAccount || account;
        const expectedAccountId = Number(normalizedAccount);
        const realtimeAccountId = Number(bootstrap.chatwoot.realtime?.accountId ?? 0);
        const realtimeMatchesAccount =
          !realtimeAccountId ||
          !Number.isFinite(expectedAccountId) ||
          expectedAccountId <= 0 ||
          realtimeAccountId === expectedAccountId;

        setChatAccount(targetAccount);
        setApiOk(bootstrap.chatwoot.permissions?.accountApi ?? false);
        setTeamId(bootstrap.chatwoot.teamChargeId ?? null);
        setAvailableLabels(
          normalizeLabels([
            ...(Array.isArray(bootstrap.chatwoot.availableLabels)
              ? bootstrap.chatwoot.availableLabels
              : []),
            ...accountLabels,
          ]),
        );
        setCurrentChatwootUserId(bootstrap.chatwoot.realtime?.userId ?? null);
        setSelectedTeamId(
          bootstrap.chatwoot.teamChargeId
            ? Number(bootstrap.chatwoot.teamChargeId)
            : null,
        );
        setSelectedAgentId(bootstrap.chatwoot.realtime?.userId ?? null);
        console.log('realtimeAccountId', realtimeAccountId);
        // setBootErr(
        //   !realtimeMatchesAccount
        //     ? `O token Maestro deste agente pertence à account ${realtimeAccountId}, mas esta empresa usa a account ${normalizedAccount}. Atualize o token individual do agente.`
        //     : null,
        // );
        setRealtimeConfig(
          realtimeMatchesAccount &&
            bootstrap.chatwoot.realtime?.enabled &&
            bootstrap.chatwoot.realtime.cableUrl &&
            bootstrap.chatwoot.realtime.pubsubToken &&
            bootstrap.chatwoot.realtime.accountId &&
            bootstrap.chatwoot.realtime.userId
            ? {
                cableUrl: bootstrap.chatwoot.realtime.cableUrl,
                pubsubToken: bootstrap.chatwoot.realtime.pubsubToken,
                accountId: bootstrap.chatwoot.realtime.accountId,
                userId: bootstrap.chatwoot.realtime.userId,
              }
            : null,
        );

        if (bootstrap.chatwoot.permissions?.accountApi) {
          const [nextTeams, nextAgents] = await Promise.all([
            ChatwootClientService.listTeams(targetAccount),
            ChatwootClientService.listAgents(targetAccount),
          ]);

          if (mounted) {
            setTeams(nextTeams);
            setAgents(nextAgents);
          }
        } else {
          setTeams([]);
          setAgents([]);
        }
      } catch (error: unknown) {
        if (!mounted) return;

        setChatAccount("");
        setBootErr(getErrorMessage(error, "Erro ao inicializar o Maestro."));
      } finally {
        if (mounted) {
          setReady(true);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [account]);

  const mergeLocalReadState = useCallback(
    (items: ChatwootConversationItem[]) =>
      items.map((item) =>
        item.status === "resolved" || locallyReadConversationIds.has(item.id)
          ? { ...item, unreadCount: 0 }
          : item,
      ),
    [locallyReadConversationIds],
  );

  const loadConversationsByTeam = useCallback(
    async (targetAccount: string, targetTeamId?: string | null) => {
      const params = { teamId: targetTeamId ?? undefined };
      const [openRows, pendingRows, resolvedRows] = await Promise.all([
        ChatwootClientService.listConversations(targetAccount, { ...params, status: "open" }),
        ChatwootClientService.listConversations(targetAccount, { ...params, status: "pending" }),
        ChatwootClientService.listConversations(targetAccount, { ...params, status: "resolved" }),
      ]);

      return [...openRows, ...pendingRows, ...resolvedRows];
    },
    [],
  );

  const fetchConversations = useCallback(
    async (options?: { silent?: boolean; showErrorToast?: boolean }) => {
      if (!resolvedAccount || !ready) return;

      const { silent = false, showErrorToast = false } = options ?? {};

      if (silent) {
        setRefreshingConversations(true);
      } else {
        setLoadingConversations(true);
      }

      try {
        const teamScoped = await loadConversationsByTeam(resolvedAccount, teamId);
        setConversations(mergeLocalReadState(teamScoped));
      } catch (error: unknown) {
        if (showErrorToast) {
          notifyError(error, "Nao foi possivel atualizar os atendimentos.");
        }
      } finally {
        setLoadingConversations(false);
        setRefreshingConversations(false);
      }
    },
    [
      loadConversationsByTeam,
      mergeLocalReadState,
      notifyError,
      ready,
      resolvedAccount,
      teamId,
    ],
  );

  useEffect(() => {
    fetchConversationsRef.current = fetchConversations;
  }, [fetchConversations]);

  useEffect(() => {
    void fetchConversations();
  }, [fetchConversations]);

  useEffect(() => {
    if (!ready) return;
    if (realtimeConfig && realtimeConnected) return;

    const intervalId = window.setInterval(() => {
      void fetchConversations({ silent: true });
    }, 15_000);

    return () => window.clearInterval(intervalId);
  }, [fetchConversations, ready, realtimeConfig, realtimeConnected]);

  const loadMessages = useCallback(
    async (conversationId: number) => {
      if (!resolvedAccount) return;

      const conversation = conversations.find((item) => item.id === conversationId);
      setLoadingMessages(true);
      setMessages([]);

      try {
        const rows = await ChatwootClientService.listMessages(
          resolvedAccount,
          conversationId,
          {
            inboxIdentifier: conversation?.inboxIdentifier ?? null,
            contactIdentifier: conversation?.contactIdentifier ?? null,
          },
        );
        // Mescla com mensagens que chegaram via WS enquanto a conversa não estava ativa
        const pending = wsPendingMessagesRef.current.get(conversationId) ?? [];
        wsPendingMessagesRef.current.delete(conversationId);
        const dbIds = new Set(rows.map((m) => m.id));
        const merged = [...rows, ...pending.filter((m) => !dbIds.has(m.id))];
        setMessages(sortMessagesByTime(deduplicateMessages(merged)));
      } catch {
        setMessages([]);
      } finally {
        setLoadingMessages(false);
      }
    },
    [conversations, resolvedAccount],
  );

  useEffect(() => {
    loadMessagesRef.current = loadMessages;
  }, [loadMessages]);

  const loadLabelCatalog = useCallback(
    async (conversationId: number) => {
      if (!resolvedAccount) return;

      const conversation = conversations.find((item) => item.id === conversationId);
      if (!conversation) return;

      try {
        const [conversationLabels, contactLabels] = await Promise.all([
          ChatwootClientService.listConversationLabels(resolvedAccount, conversationId).catch(
            () => [],
          ),
          conversation.contactId
            ? ChatwootClientService.listContactLabels(
                resolvedAccount,
                conversation.contactId,
              ).catch(() => [])
            : Promise.resolve([]),
        ]);

        const storedContactLabels = conversation.contactId
          ? loadStoredContactLabels(resolvedAccount, conversation.contactId)
          : [];

        const mergedContactLabels = normalizeLabels([
          ...contactLabels,
          ...storedContactLabels,
        ]);

        setAvailableLabels((previous) =>
          normalizeLabels([
            ...previous,
            ...conversationLabels,
            ...mergedContactLabels,
            ...(conversation.labels ?? []),
          ]),
        );
        const nextConversationLabels = normalizeLabels(
          conversationLabels.length ? conversationLabels : conversation.labels ?? [],
        );
        setSelectedConversationLabels(nextConversationLabels);
        setInitialConversationLabels(nextConversationLabels);
        setSelectedContactLabels(mergedContactLabels);
        setInitialContactLabels(mergedContactLabels);

        if (conversation.contactId) {
          persistStoredContactLabels(
            resolvedAccount,
            conversation.contactId,
            mergedContactLabels,
          );
        }
      } catch {
        // keep the chat usable even when label lookup fails
      }
    },
    [conversations, resolvedAccount],
  );

  const loadContactDetails = useCallback(
    async (conversationId: number) => {
      if (!resolvedAccount) return;

      const conversation = conversations.find((item) => item.id === conversationId);
      if (!conversation?.contactId) {
        setContactDetails(null);
        return;
      }

      try {
        const nextDetails = await ChatwootClientService.getContactDetails(
          resolvedAccount,
          conversation.contactId,
        );
        setContactDetails(nextDetails);
      } catch {
        setContactDetails(null);
      }
    },
    [conversations, resolvedAccount],
  );

  const selectConversation = useCallback(
    (conversationId: number) => {
      setActiveConversationId(conversationId);
      if (resolvedAccount) {
        persistStoredLastConversationId(resolvedAccount, conversationId);
      }
      void loadMessages(conversationId);
      void loadLabelCatalog(conversationId);

      const conversation = conversations.find((item) => item.id === conversationId);
      const storedLabels =
        conversation?.contactId && resolvedAccount
          ? loadStoredContactLabels(resolvedAccount, conversation.contactId)
          : [];

      setSelectedConversationLabels(normalizeLabels(conversation?.labels ?? []));
      setInitialConversationLabels(normalizeLabels(conversation?.labels ?? []));
      setSelectedContactLabels(storedLabels);
      setInitialContactLabels(storedLabels);
      setConversationLabelChoice("");
      setContactLabelChoice("");
      setSelectedTeamId(teamId ? Number(teamId) : null);
      setSelectedAgentId(currentChatwootUserId);
      setLocallyReadConversationIds((previous) => new Set(previous).add(conversationId));
      setConversations((previous) =>
        previous.map((item) =>
          item.id === conversationId ? { ...item, unreadCount: 0 } : item,
        ),
      );
    },
    [
      conversations,
      currentChatwootUserId,
      loadLabelCatalog,
      loadMessages,
      resolvedAccount,
      teamId,
    ],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!resolvedAccount) return;
    setLocallyReadConversationIds(loadStoredReadConversationIds(resolvedAccount));
  }, [resolvedAccount]);

  useEffect(() => {
    if (!resolvedAccount) return;
    persistReadConversationIds(resolvedAccount, locallyReadConversationIds);
  }, [locallyReadConversationIds, resolvedAccount]);

  useEffect(() => {
    if (!realtimeConfig) {
      setRealtimeConnected(false);
      return;
    }

    const connection = createChatwootRealtimeConnection(realtimeConfig, {
      onOpen: () => setRealtimeConnected(true),
      onClose: () => setRealtimeConnected(false),
      onError: () => setRealtimeConnected(false),
      onEvent: ({ event, data }) => {
        if (!REALTIME_CONVERSATION_EVENTS.has(event)) return;

        // For message.created, data.id is the MESSAGE id — extract conversation id from
        // data.conversation_id or data.conversation.id instead.
        const targetConversationId =
          event === "message.created" && data
            ? (() => {
                const raw = data as Record<string, unknown>;
                const fromConvId = Number(raw.conversation_id ?? null);
                if (Number.isFinite(fromConvId) && fromConvId > 0) return fromConvId;
                const conv = raw.conversation as Record<string, unknown> | undefined;
                const fromConv = Number(conv?.id ?? null);
                return Number.isFinite(fromConv) && fromConv > 0 ? fromConv : null;
              })()
            : extractConversationId(data);

        if (event === "message.created" && data) {
          const incomingMessage = normalizeRealtimeMessage(data);

          if (incomingMessage && targetConversationId) {
            if (activeIdRef.current === targetConversationId) {
              // Conversa ativa: adiciona direto no state
              setMessages((prev) =>
                sortMessagesByTime([
                  ...prev.filter((m) => m.id !== incomingMessage.id),
                  incomingMessage,
                ]),
              );
            } else {
              // Conversa não ativa: guarda no cache WS para quando o agente abrir
              const pending = wsPendingMessagesRef.current;
              const existing = pending.get(targetConversationId) ?? [];
              const alreadyIn = existing.some((m) => m.id === incomingMessage.id);
              if (!alreadyIn) {
                pending.set(targetConversationId, [...existing, incomingMessage]);
              }
            }

            if (incomingMessage.content) {
              setConversations((prev) =>
                prev.map((c) =>
                  c.id === targetConversationId
                    ? {
                        ...c,
                        lastMessage: incomingMessage.content,
                        unreadCount:
                          activeIdRef.current === targetConversationId
                            ? 0
                            : c.unreadCount + 1,
                      }
                    : c,
                ),
              );
            }

            // Persiste a mensagem no banco em background
            ChatwootClientService.syncWsEvent(resolvedAccountRef.current, event, data);
          }

          return;
        }

        // Para eventos de conversa (status, assignee, team, etc.):
        // atualiza o state diretamente a partir do payload WS — sem chamar API externa.
        if (data) {
          const updatedConv = normalizeRealtimeConversation(data);
          if (updatedConv) {
            setConversations((prev) => {
              const exists = prev.some((c) => c.id === updatedConv.id);
              if (exists) {
                return prev.map((c) =>
                  c.id === updatedConv.id
                    ? {
                        ...c,
                        status: updatedConv.status,
                        assigneeName: updatedConv.assigneeName ?? c.assigneeName,
                        teamName: updatedConv.teamName ?? c.teamName,
                        teamId: updatedConv.teamId ?? c.teamId,
                        labels: updatedConv.labels.length > 0 ? updatedConv.labels : c.labels,
                        unreadCount: updatedConv.unreadCount,
                        updatedAt: updatedConv.updatedAt ?? c.updatedAt,
                        lastMessage: updatedConv.lastMessage || c.lastMessage,
                      }
                    : c,
                );
              }
              // Nova conversa: só adiciona se pertencer ao time configurado
              const numericTeamId = teamIdRef.current ? Number(teamIdRef.current) : null;
              if (numericTeamId && updatedConv.teamId !== numericTeamId) {
                return prev;
              }
              return [updatedConv, ...prev];
            });

            // Persiste no banco em background
            ChatwootClientService.syncWsEvent(resolvedAccountRef.current, event, data);
          }
        }
      },
    });

    return () => {
      connection.disconnect();
      setRealtimeConnected(false);
    };
  }, [realtimeConfig]);

  const doneQueue = useMemo(
    () => conversations.filter((conversation) => conversation.status === "resolved"),
    [conversations],
  );
  const iaQueue = useMemo(
    () => conversations.filter(isIaConversation),
    [conversations],
  );
  const humanQueue = useMemo(
    () => conversations.filter(isHumanPickupConversation),
    [conversations],
  );
  const groupedDoneQueue = useMemo(
    () => groupConversationsByClient(doneQueue),
    [doneQueue],
  );
  const groupedIaQueue = useMemo(
    () => groupConversationsByClient(iaQueue),
    [iaQueue],
  );
  const groupedHumanQueue = useMemo(
    () => groupConversationsByClient(humanQueue),
    [humanQueue],
  );
  const groupedAllQueue = useMemo(
    () => groupConversationsByClient(conversations),
    [conversations],
  );

  const groupedCurrentQueue = useMemo(() => {
    if (queue === "human") return groupedHumanQueue;
    if (queue === "ia") return groupedIaQueue;
    if (queue === "done") return groupedDoneQueue;
    return groupedAllQueue;
  }, [groupedAllQueue, groupedDoneQueue, groupedHumanQueue, groupedIaQueue, queue]);

  useEffect(() => {
    if (!ready || loadingConversations || initialQueueSelectionDone) {
      return;
    }

    // Aguarda as conversas carregarem antes de bloquear a seleção.
    // Sem isso, o efeito dispara antes do fetch iniciar (conversations=[])
    // e trava na fila "all" com initialQueueSelectionDone=true.
    if (conversations.length === 0) {
      return;
    }

    const nextQueue: ChatwootQueue =
      groupedIaQueue.length > 0
        ? "ia"
        : groupedHumanQueue.length > 0
          ? "human"
          : "all";

    setQueue(nextQueue);
    setInitialQueueSelectionDone(true);
  }, [
    conversations.length,
    groupedHumanQueue.length,
    groupedIaQueue.length,
    initialQueueSelectionDone,
    loadingConversations,
    ready,
  ]);

  useEffect(() => {
    if (!ready || !resolvedAccount || loadingConversations || !conversations.length) {
      return;
    }

    if (activeConversationId != null) {
      return;
    }

    if (!initialQueueSelectionDone || initialConversationSelectionDone) {
      return;
    }

    const storedConversationId = loadStoredLastConversationId(resolvedAccount);
    const storedConversationBelongsToQueue =
      storedConversationId != null &&
      groupedCurrentQueue.some((group) =>
        group.conversations.some((conversation) => conversation.id === storedConversationId),
      );
    const fallbackConversationId =
      groupedCurrentQueue[0]?.primaryConversation.id ??
      groupedAllQueue[0]?.primaryConversation.id ??
      conversations[0]?.id ??
      null;
    const nextConversationId =
      storedConversationId && storedConversationBelongsToQueue
        ? storedConversationId
        : fallbackConversationId;

    setInitialConversationSelectionDone(true);

    if (nextConversationId) {
      selectConversation(nextConversationId);
    }
  }, [
    activeConversationId,
    conversations,
    groupedCurrentQueue,
    groupedAllQueue,
    initialQueueSelectionDone,
    initialConversationSelectionDone,
    loadingConversations,
    ready,
    resolvedAccount,
    selectConversation,
  ]);

  useEffect(() => {
    if (!ready || !conversations.length || activeConversationId == null) {
      return;
    }

    const activeConversationStillExists = conversations.some(
      (conversation) => conversation.id === activeConversationId,
    );

    if (activeConversationStillExists) {
      return;
    }

    const fallbackConversationId =
      groupedCurrentQueue[0]?.primaryConversation.id ??
      groupedAllQueue[0]?.primaryConversation.id ??
      conversations[0]?.id ??
      null;
    if (fallbackConversationId) {
      selectConversation(fallbackConversationId);
      return;
    }

    setActiveConversationId(null);
    setMessages([]);
  }, [
    activeConversationId,
    conversations,
    groupedCurrentQueue,
    groupedAllQueue,
    ready,
    selectConversation,
  ]);

  const selectableLabels = useMemo(
    () =>
      normalizeLabels([
        ...availableLabels,
        ...conversations.flatMap((conversation) => conversation.labels ?? []),
        ...selectedContactLabels,
      ]),
    [availableLabels, conversations, selectedContactLabels],
  );

  const displayedConversationGroups = useMemo(() => {
    const base =
      queue === "ia"
        ? groupedIaQueue
        : queue === "human"
          ? groupedHumanQueue
          : queue === "done"
            ? groupedDoneQueue
            : groupedAllQueue;

    const term = search.trim().toLowerCase();
    return term
      ? base.filter((group) =>
          group.conversations.some((conversation) =>
            getConversationSearchText(conversation).includes(term),
          ),
        )
      : base;
  }, [
    groupedAllQueue,
    groupedDoneQueue,
    groupedHumanQueue,
    groupedIaQueue,
    queue,
    search,
  ]);

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) ?? null,
    [activeConversationId, conversations],
  );
  const isActiveIa = activeConversation ? isIaConversation(activeConversation) : false;
  const alreadyAssumed =
    activeConversationId != null && assumedConversationIds.has(activeConversationId);
  const conversationLabelsDirty = useMemo(
    () => areLabelsDifferent(selectedConversationLabels, initialConversationLabels),
    [initialConversationLabels, selectedConversationLabels],
  );
  const contactLabelsDirty = useMemo(
    () => areLabelsDifferent(selectedContactLabels, initialContactLabels),
    [initialContactLabels, selectedContactLabels],
  );

  const openDetailsModal = useCallback(() => {
    if (!activeConversation?.id) return;

    setDetailsOpen(true);
    void loadContactDetails(activeConversation.id);
    void loadLabelCatalog(activeConversation.id);
  }, [activeConversation?.id, loadContactDetails, loadLabelCatalog]);

  const closeDetailsModal = useCallback(() => {
    setDetailsOpen(false);
    setSelectedContactLabels(initialContactLabels);
    setContactLabelChoice("");
  }, [initialContactLabels]);

  const handleConversationLabels = useCallback(async () => {
    if (
      !resolvedAccount ||
      !apiOk ||
      !activeConversationId ||
      savingConversationLabels
    ) {
      return;
    }

    const pendingChoice = conversationLabelChoice.trim();
    const nextLabels = normalizeLabels([
      ...selectedConversationLabels,
      ...(pendingChoice ? [pendingChoice] : []),
    ]);
    const shouldSave = conversationLabelsDirty || Boolean(pendingChoice);
    if (!shouldSave) return;

    setSavingConversationLabels(true);
    try {
      await ChatwootClientService.updateLabels(
        resolvedAccount,
        activeConversationId,
        nextLabels,
      );

      setSelectedConversationLabels(nextLabels);
      setInitialConversationLabels(nextLabels);
      setConversationLabelChoice("");
      setConversations((previous) =>
        previous.map((item) =>
          item.id === activeConversationId ? { ...item, labels: nextLabels } : item,
        ),
      );
      notifySuccess("Etiquetas da conversa salvas.");
    } catch (error: unknown) {
      notifyError(error, "Erro ao salvar etiquetas da conversa.");
    } finally {
      setSavingConversationLabels(false);
    }
  }, [
    activeConversationId,
    apiOk,
    conversationLabelChoice,
    conversationLabelsDirty,
    notifyError,
    notifySuccess,
    resolvedAccount,
    savingConversationLabels,
    selectedConversationLabels,
  ]);

  const handleSend = useCallback(async () => {
    if (!resolvedAccount || !activeConversationId || !draft.trim() || sending) return;

    setSending(true);
    try {
      const message = await ChatwootClientService.sendMessage(
        resolvedAccount,
        activeConversationId,
        draft.trim(),
        {
          inboxIdentifier: activeConversation?.inboxIdentifier ?? null,
          contactIdentifier: activeConversation?.contactIdentifier ?? null,
        },
      );
      setMessages((previous) =>
        sortMessagesByTime([...previous.filter((m) => m.id !== message.id), message]),
      );
      setDraft("");
      notifySuccess("Mensagem enviada.");
    } catch (error: unknown) {
      notifyError(error, "Erro ao enviar mensagem.");
    } finally {
      setSending(false);
    }
  }, [
    activeConversation?.contactIdentifier,
    activeConversation?.inboxIdentifier,
    activeConversationId,
    draft,
    notifyError,
    notifySuccess,
    resolvedAccount,
    sending,
  ]);

  const handleAssume = useCallback(async () => {
    if (!resolvedAccount || !activeConversationId || !apiOk || busyAction) return;

    setBusyAction("assume");
    try {
      await ChatwootClientService.transferConversation(
        resolvedAccount,
        activeConversationId,
        {
          assigneeId: currentChatwootUserId,
          teamId: teamId ? Number(teamId) : null,
        },
      );
      setAssumedConversationIds((previous) => new Set(previous).add(activeConversationId));
      setLocallyReadConversationIds((previous) =>
        new Set(previous).add(activeConversationId),
      );
      setConversations((previous) =>
        previous.map((item) =>
          item.id === activeConversationId
            ? { ...item, unreadCount: 0, assigneeName: myName || item.assigneeName }
            : item,
        ),
      );
      notifySuccess("Atendimento assumido.");
      void fetchConversations({ silent: true });
    } catch (error: unknown) {
      notifyError(error, "Erro ao assumir atendimento.");
    } finally {
      setBusyAction(null);
    }
  }, [
    activeConversationId,
    apiOk,
    busyAction,
    currentChatwootUserId,
    fetchConversations,
    myName,
    notifyError,
    notifySuccess,
    resolvedAccount,
    teamId,
  ]);

  const handleStatusChange = useCallback(
    async (status: "open" | "resolved" | "pending") => {
      if (!resolvedAccount || !activeConversationId || !apiOk || busyAction) return;

      const nextBusyAction: BusyAction =
        status === "resolved" ? "resolve" : status === "open" ? "reopen" : "pending";

      setBusyAction(nextBusyAction);
      try {
        await ChatwootClientService.updateStatus(
          resolvedAccount,
          activeConversationId,
          status,
        );

        if (status === "resolved") {
          setActiveConversationId(null);
          setMessages([]);
          setDetailsOpen(false);
        }

        notifySuccess(
          status === "resolved"
            ? "Atendimento concluido."
            : status === "open"
              ? "Atendimento reaberto."
              : "Status atualizado.",
        );
        void fetchConversations({ silent: true });
      } catch (error: unknown) {
        notifyError(error, "Erro ao alterar status do atendimento.");
      } finally {
        setBusyAction(null);
      }
    },
    [
      activeConversationId,
      apiOk,
      busyAction,
      fetchConversations,
      notifyError,
      notifySuccess,
      resolvedAccount,
    ],
  );

  const handleTransfer = useCallback(async () => {
    if (!resolvedAccount || !activeConversationId || !apiOk || busyAction) return;

    setBusyAction("transfer");
    try {
      await ChatwootClientService.transferConversation(
        resolvedAccount,
        activeConversationId,
        { assigneeId: selectedAgentId, teamId: selectedTeamId },
      );
      notifySuccess("Atendimento transferido.");
      void fetchConversations({ silent: true });
    } catch (error: unknown) {
      notifyError(error, "Erro ao transferir atendimento.");
    } finally {
      setBusyAction(null);
    }
  }, [
    activeConversationId,
    apiOk,
    busyAction,
    fetchConversations,
    notifyError,
    notifySuccess,
    resolvedAccount,
    selectedAgentId,
    selectedTeamId,
  ]);

  const handleContactLabels = useCallback(async () => {
    if (
      !resolvedAccount ||
      !apiOk ||
      !activeConversation?.contactId ||
      savingContactLabels
    ) {
      return;
    }

    const pendingChoice = contactLabelChoice.trim();
    const nextLabels = normalizeLabels([
      ...selectedContactLabels,
      ...(pendingChoice ? [pendingChoice] : []),
    ]);
    const shouldSave = contactLabelsDirty || Boolean(pendingChoice);
    if (!shouldSave) return;

    setSavingContactLabels(true);
    try {
      await ChatwootClientService.updateContactLabels(
        resolvedAccount,
        activeConversation.contactId,
        nextLabels,
      );

      const refreshedContactLabels = await ChatwootClientService.listContactLabels(
        resolvedAccount,
        activeConversation.contactId,
      ).catch(() => nextLabels);

      setSelectedContactLabels(refreshedContactLabels);
      setInitialContactLabels(refreshedContactLabels);
      setContactLabelChoice("");
      persistStoredContactLabels(
        resolvedAccount,
        activeConversation.contactId,
        refreshedContactLabels,
      );
      notifySuccess("Alterações realizadas com sucesso.");
    } catch (error: unknown) {
      notifyError(error, "Erro ao realizar alterações.");
    } finally {
      setSavingContactLabels(false);
    }
  }, [
    activeConversation?.contactId,
    apiOk,
    contactLabelChoice,
    contactLabelsDirty,
    notifyError,
    notifySuccess,
    resolvedAccount,
    savingContactLabels,
    selectedContactLabels,
  ]);

  const handleRemoveContactLabel = useCallback((label: string) => {
    setSelectedContactLabels((previous) =>
      previous.filter((item) => item !== label),
    );
  }, []);

  const handleRemoveConversationLabel = useCallback((label: string) => {
    setSelectedConversationLabels((previous) =>
      previous.filter((item) => item !== label),
    );
  }, []);

  const handleQueueChange = useCallback((nextQueue: ChatwootQueue) => {
    setQueue(nextQueue);
  }, []);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
  }, []);

  const handleDraftChange = useCallback((value: string) => {
    setDraft(value);
  }, []);

  const handleContactLabelChoiceChange = useCallback((value: string) => {
    setContactLabelChoice(value);
  }, []);

  const handleConversationLabelChoiceChange = useCallback((value: string) => {
    setConversationLabelChoice(value);
  }, []);

  const handleTeamChange = useCallback((value: number | null) => {
    setSelectedTeamId(value);
  }, []);

  const handleAgentChange = useCallback((value: number | null) => {
    setSelectedAgentId(value);
  }, []);

  const handleRefreshClick = useCallback(() => {
    void fetchConversations({ silent: true, showErrorToast: true });
  }, [fetchConversations]);

  const handleDeleteFromQueue = useCallback(async (conversationId: number) => {
    if (!resolvedAccount) return;
    try {
      await ChatwootClientService.deleteLocalConversation(resolvedAccount, conversationId);
      setConversations((prev) => prev.filter((c) => c.id !== conversationId));
      if (activeConversationId === conversationId) {
        setActiveConversationId(null);
        setMessages([]);
      }
    } catch (error: unknown) {
      notifyError(error, "Erro ao remover conversa da fila local.");
    }
  }, [activeConversationId, notifyError, resolvedAccount]);

  return {
    sidebar: {
      queue,
      search,
      ready,
      bootErr,
      displayedConversationGroups,
      loadingConversations,
      refreshingConversations,
      activeConversationId,
      iaCount: groupedIaQueue.length,
      humanCount: groupedHumanQueue.length,
      doneCount: groupedDoneQueue.length,
      onQueueChange: handleQueueChange,
      onSearchChange: handleSearchChange,
      onRefresh: handleRefreshClick,
      onSelectConversation: selectConversation,
    },
    conversationView: {
      activeConversation,
      isActiveIa,
      alreadyAssumed,
      apiOk,
      loadingMessages,
      messages,
      draft,
      sending,
      canSend: Boolean(draft.trim()) && !sending,
      bottomRef,
      onDraftChange: handleDraftChange,
      onSend: handleSend,
      onAssume: handleAssume,
      onResolve: () => void handleStatusChange("resolved"),
      onReopen: () => void handleStatusChange("open"),
      onOpenDetails: openDetailsModal,
      onDeleteFromQueue: handleDeleteFromQueue,
      assumeLoading: busyAction === "assume",
      resolveLoading: busyAction === "resolve",
      reopenLoading: busyAction === "reopen",
    },
    infoPanel: {
      activeConversation,
      apiOk,
      isActiveIa,
      alreadyAssumed,
      selectedContactLabels,
      selectedConversationLabels,
      selectableLabels,
      teams,
      agents,
      selectedTeamId,
      selectedAgentId,
      conversationLabelChoice,
      savingConversationLabels,
      canSaveConversationLabels:
        Boolean(activeConversationId) &&
        apiOk &&
        (conversationLabelsDirty || Boolean(conversationLabelChoice.trim())) &&
        !savingConversationLabels,
      transferLoading: busyAction === "transfer",
      pendingLoading: busyAction === "pending",
      onConversationLabelChoiceChange: handleConversationLabelChoiceChange,
      onRemoveConversationLabel: handleRemoveConversationLabel,
      onSaveConversationLabels: handleConversationLabels,
      onTeamChange: handleTeamChange,
      onAgentChange: handleAgentChange,
      onTransfer: handleTransfer,
      onMarkPending: () => void handleStatusChange("pending"),
    },
    detailsModal: {
      open: detailsOpen && Boolean(activeConversation),
      activeConversation,
      apiOk,
      isActiveIa,
      alreadyAssumed,
      contactDetails,
      selectableLabels,
      selectedContactLabels,
      contactLabelChoice,
      savingContactLabels,
      canSave:
        Boolean(activeConversation?.contactId) &&
        apiOk &&
        (contactLabelsDirty || Boolean(contactLabelChoice.trim())) &&
        !savingContactLabels,
      onClose: closeDetailsModal,
      onContactLabelChoiceChange: handleContactLabelChoiceChange,
      onRemoveContactLabel: handleRemoveContactLabel,
      onSave: handleContactLabels,
    },
    isConversationIa: isIaConversation,
  };
}
