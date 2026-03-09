import { useCallback, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { PageContainer, TitlePage } from "../../componente/Index";
import { ChatwootClientService } from "../../services/chatwoot/chatwootClient.service";
import type {
  ChatwootAgent,
  ChatwootConversationItem,
  ChatwootInboxOption,
  ChatwootMessageItem,
  ChatwootTeam,
} from "../../types/chatwootApiTypes";
import { getErrorMessage } from "../../utils/error";
import Style from "./Styles/Chatwoot.module.css";
import {
  useChatwootAutoLoadConversations,
  useChatwootBootstrap,
  useChatwootMetaRefresh,
} from "../../hooks/controller/chatwoot/useChatwootEffects";

type StatusFilter = "all" | "open" | "pending" | "resolved" | "snoozed";

export function ChatwootPage() {
  const account = useMemo(() => new URLSearchParams(window.location.search).get("account") ?? "", []);

  const [inboxes, setInboxes] = useState<ChatwootInboxOption[]>([]);
  const [inboxIdentifier, setInboxIdentifier] = useState("");
  const [showInboxPicker, setShowInboxPicker] = useState(false);
  const [accountApiEnabled, setAccountApiEnabled] = useState(false);

  const [conversations, setConversations] = useState<ChatwootConversationItem[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatwootMessageItem[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [myFilter, setMyFilter] = useState<"new" | "mine" | "others">("new");

  const [teams, setTeams] = useState<ChatwootTeam[]>([]);
  const [agents, setAgents] = useState<ChatwootAgent[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<number | "">("");
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<number | "">("");
  const [labelInput, setLabelInput] = useState("");
  const [newMessage, setNewMessage] = useState("");

  const [loading, setLoading] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const selectedConversation = useMemo(
    () => conversations.find((item) => item.id === selectedConversationId) ?? null,
    [conversations, selectedConversationId]
  );

  const filteredConversations = useMemo(() => {
    const term = search.trim().toLowerCase();
    return conversations.filter((item) => {
      const matchesSearch =
        !term || `${item.contactName} ${item.phone} ${item.lastMessage}`.toLowerCase().includes(term);

      const currentAgent = localStorage.getItem("agent_name") ?? "";
      const matchesMine =
        myFilter === "new"
          ? !item.assigneeName
          : myFilter === "mine"
          ? item.assigneeName === currentAgent
          : Boolean(item.assigneeName && item.assigneeName !== currentAgent);

      return matchesSearch && matchesMine;
    });
  }, [conversations, myFilter, search]);

  const conversationsToRender = useMemo(() => {
    if (filteredConversations.length) return filteredConversations;
    if (search.trim()) return filteredConversations;
    return conversations;
  }, [filteredConversations, conversations, search]);

  const loadMessages = useCallback(async (conversationId: number, listRef?: ChatwootConversationItem[]) => {
    if (!account) return;
    try {
      setLoadingMessages(true);
      const source = listRef ?? conversations;
      const conversation = source.find((item) => item.id === conversationId);
      const rows = await ChatwootClientService.listMessages(account, conversationId, {
        inboxIdentifier: conversation?.inboxIdentifier ?? inboxIdentifier,
        contactIdentifier: conversation?.contactIdentifier ?? null,
      });
      setSelectedConversationId(conversationId);
      setMessages(rows);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Erro ao carregar mensagens."));
    } finally {
      setLoadingMessages(false);
    }
  }, [account, conversations, inboxIdentifier]);

  const loadConversations = useCallback(async () => {
    if (!account) return;
    try {
      setLoading(true);
      const rows = await ChatwootClientService.listConversations(account, {
        status: statusFilter,
        inboxIdentifier: inboxIdentifier || undefined,
      });
      setConversations(rows);

      if (!rows.length) {
        setSelectedConversationId(null);
        setMessages([]);
        return;
      }

      const fallbackId = rows[0].id;
      const targetId = rows.some((item) => item.id === selectedConversationId)
        ? selectedConversationId
        : fallbackId;

      if (targetId) {
        setSelectedConversationId(targetId);
        await loadMessages(targetId, rows);
      }
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Erro ao listar conversas."));
    } finally {
      setLoading(false);
    }
  }, [account, statusFilter, inboxIdentifier, selectedConversationId, loadMessages]);

  useChatwootBootstrap({
    account,
    setInboxes,
    setInboxIdentifier,
    setShowInboxPicker,
    setAccountApiEnabled,
  });

  useChatwootMetaRefresh({
    account,
    accountApiEnabled,
    setTeams,
    setAgents,
  });

  useChatwootAutoLoadConversations({
    account,
    inboxIdentifier,
    inboxesLength: inboxes.length,
    statusFilter,
    loadConversations,
  });

  const sendMessage = async () => {
    if (!account || !selectedConversation) return;
    const content = newMessage.trim();
    if (!content) return;
    try {
      const sent = await ChatwootClientService.sendMessage(account, selectedConversation.id, content, {
        inboxIdentifier: selectedConversation.inboxIdentifier ?? inboxIdentifier,
        contactIdentifier: selectedConversation.contactIdentifier ?? null,
      });
      setMessages((prev) => [...prev, sent]);
      setNewMessage("");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Erro ao enviar mensagem."));
    }
  };

  const updateStatus = async (status: "open" | "resolved" | "pending" | "snoozed") => {
    if (!account || !selectedConversation || !accountApiEnabled) return;
    try {
      await ChatwootClientService.updateStatus(account, selectedConversation.id, status);
      toast.success("Status atualizado.");
      await loadConversations();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Erro ao atualizar status."));
    }
  };

  const transferConversation = async () => {
    if (!account || !selectedConversation || !accountApiEnabled) return;
    try {
      await ChatwootClientService.transferConversation(account, selectedConversation.id, {
        teamId: selectedTeamId === "" ? null : selectedTeamId,
        assigneeId: selectedAssigneeId === "" ? null : selectedAssigneeId,
      });
      toast.success("Conversa transferida.");
      await loadConversations();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Erro ao transferir conversa."));
    }
  };

  const saveLabels = async () => {
    if (!account || !selectedConversation || !accountApiEnabled) return;
    const labels = labelInput
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    try {
      await ChatwootClientService.updateLabels(account, selectedConversation.id, labels);
      toast.success("Etiquetas atualizadas.");
      await loadConversations();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Erro ao salvar etiquetas."));
    }
  };

  return (
    <PageContainer className={Style.container}>
      <TitlePage title="Chat" subtitle="Operação completa: filtros, etiquetas, status e transferência" className={Style.container_title}>
      <section className={Style.toolbar}>
        <div className={Style.segmented}>
          <button type="button" className={myFilter === "new" ? Style.active : ""} onClick={() => setMyFilter("new")}>
            Novos
          </button>
          <button type="button" className={myFilter === "mine" ? Style.active : ""} onClick={() => setMyFilter("mine")}>
            Meus
          </button>
          <button type="button" className={myFilter === "others" ? Style.active : ""} onClick={() => setMyFilter("others")}>
            Outros
          </button>
        </div>
        <div className={Style.filters}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar conversa..." />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
            <option value="all">Todos</option>
            <option value="open">Abertos</option>
            <option value="pending">Pendentes</option>
            <option value="resolved">Resolvidos</option>
            <option value="snoozed">Snoozed</option>
          </select>
        </div>
      </section>
      </TitlePage>
      {showInboxPicker && (
        <div className={Style.modalOverlay}>
          <div className={Style.modal}>
            <h3>Escolha a inbox</h3>
            <p>Selecione a caixa de entrada para iniciar o atendimento.</p>
            <select value={inboxIdentifier} onChange={(e) => setInboxIdentifier(e.target.value)}>
              <option value="">Selecione</option>
              {inboxes.map((inbox) => (
                <option key={inbox.id} value={inbox.identifier}>
                  {inbox.name}
                </option>
              ))}
            </select>
            <button type="button" disabled={!inboxIdentifier} onClick={() => setShowInboxPicker(false)}>
              Entrar
            </button>
          </div>
        </div>
      )}

      

      <section className={Style.chatLayout}>
        <aside className={Style.sidebar}>
          {!conversationsToRender.length && <p className={Style.empty}>Nenhuma conversa.</p>}
          {conversationsToRender.map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              className={`${Style.conversationItem} ${
                conversation.id === selectedConversationId ? Style.conversationItemActive : ""
              }`}
              onClick={() => void loadMessages(conversation.id)}
            >
              <div className={Style.conversationTitle}>
                <strong>{conversation.contactName}</strong>
                <small>{conversation.unreadCount > 0 ? conversation.unreadCount : ""}</small>
              </div>
              <p>{conversation.lastMessage || "Sem mensagem"}</p>
              <div className={Style.labelsRow}>
                {conversation.labels?.slice(0, 3).map((label) => (
                  <span key={label}>{label}</span>
                ))}
              </div>
            </button>
          ))}
        </aside>

        <main className={Style.mainChat}>
          <header className={Style.chatHeader}>
            <div>
              <h3>{selectedConversation?.contactName ?? "Selecione uma conversa"}</h3>
              <p>
                {selectedConversation?.teamName ?? "Sem time"} · {selectedConversation?.assigneeName ?? "Sem agente"}
              </p>
            </div>
            <div className={Style.headerActions}>
              <button type="button" onClick={() => void updateStatus("open")} disabled={!selectedConversation || !accountApiEnabled}>
                Reabrir
              </button>
              <button type="button" onClick={() => void updateStatus("resolved")} disabled={!selectedConversation || !accountApiEnabled}>
                Concluir
              </button>
            </div>
          </header>

          <section className={Style.messagesArea}>
            {loadingMessages && <p className={Style.empty}>Carregando mensagens...</p>}
            {!loadingMessages && !messages.length && <p className={Style.empty}>Sem mensagens.</p>}
            {messages.map((message) => (
              <div key={message.id} className={`${Style.messageBubble} ${message.senderType === "agent" ? Style.agent : Style.customer}`}>
                <p>{message.content || "[mensagem sem texto]"}</p>
              </div>
            ))}
          </section>

          <footer className={Style.composer}>
            <input
              value={newMessage}
              onChange={(event) => setNewMessage(event.target.value)}
              placeholder="Digite aqui..."
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void sendMessage();
                }
              }}
            />
            <button type="button" onClick={() => void sendMessage()} disabled={!selectedConversation}>
              Enviar
            </button>
          </footer>
        </main>

        <aside className={Style.sideTools}>
          {!accountApiEnabled && (
            <p className={Style.warning}>
              Token atual é de bot/API pública. Para transferir, concluir e editar etiquetas use token admin/agente na tabela company.
            </p>
          )}

          <h4>Transferência</h4>
          <label>Time/Setor</label>
          <select value={selectedTeamId} onChange={(e) => setSelectedTeamId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">Selecionar</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>

          <label>Agente</label>
          <select value={selectedAssigneeId} onChange={(e) => setSelectedAssigneeId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">Selecionar</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>

          <button type="button" onClick={() => void transferConversation()} disabled={!selectedConversation || loading || !accountApiEnabled}>
            Transferir
          </button>

          <h4>Etiquetas</h4>
          <input value={labelInput} onChange={(e) => setLabelInput(e.target.value)} placeholder="ex: suporte, prioridade, cobrança" />
          <button type="button" onClick={() => void saveLabels()} disabled={!selectedConversation || loading || !accountApiEnabled}>
            Salvar etiquetas
          </button>
        </aside>
      </section>
    </PageContainer>
  );
}
