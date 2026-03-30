// Integração com API pausada temporariamente — UI mantida para demonstração
import { useCallback, useMemo, useState } from "react";
import { Dropdown, PageContainer, TitlePage } from "../../componente/Index";
import type {
  ChatwootAgent,
  ChatwootConversationItem,
  ChatwootInboxOption,
  ChatwootMessageItem,
  ChatwootTeam,
} from "../../types/chatwootApiTypes";
import { AppStorage } from "../../services/storage/storage.service";
import { useAccountParam } from "../../hooks/useAccountParam";
import Style from "./Styles/Chatwoot.module.css";

type StatusFilter = "all" | "open" | "pending" | "resolved" | "snoozed";
type ChatwootSelectOption = { id: string; name: string };

const STATUS_OPTIONS: ChatwootSelectOption[] = [
  { id: "all", name: "Todos" },
  { id: "open", name: "Abertos" },
  { id: "pending", name: "Pendentes" },
  { id: "resolved", name: "Resolvidos" },
  { id: "snoozed", name: "Snoozed" },
];

export function ChatwootPage() {
  const account = useAccountParam();

  const [inboxes] = useState<ChatwootInboxOption[]>([]);
  const [inboxIdentifier, setInboxIdentifier] = useState("");
  const [showInboxPicker] = useState(false);
  const [accountApiEnabled] = useState(false);

  const [conversations] = useState<ChatwootConversationItem[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [messages] = useState<ChatwootMessageItem[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [myFilter, setMyFilter] = useState<"new" | "mine" | "others">("new");

  const [teams] = useState<ChatwootTeam[]>([]);
  const [agents] = useState<ChatwootAgent[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<number | "">("");
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<number | "">("");
  const [labelInput, setLabelInput] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [openDropdown, setOpenDropdown] = useState<
    "status" | "inbox" | "team" | "agent" | null
  >(null);

  const [loading] = useState(false);
  const [loadingMessages] = useState(false);

  const selectedConversation = useMemo(
    () => conversations.find((item) => item.id === selectedConversationId) ?? null,
    [conversations, selectedConversationId]
  );

  const selectedStatusOption = useMemo(
    () => STATUS_OPTIONS.find((option) => option.id === statusFilter) ?? STATUS_OPTIONS[0],
    [statusFilter]
  );

  const inboxOptions = useMemo<ChatwootSelectOption[]>(
    () => inboxes.map((inbox) => ({ id: inbox.identifier, name: inbox.name })),
    [inboxes]
  );

  const teamOptions = useMemo<ChatwootSelectOption[]>(
    () => teams.map((team) => ({ id: String(team.id), name: team.name })),
    [teams]
  );

  const agentOptions = useMemo<ChatwootSelectOption[]>(
    () => agents.map((agent) => ({ id: String(agent.id), name: agent.name })),
    [agents]
  );

  const selectedInboxOption = useMemo(
    () => inboxOptions.find((option) => option.id === inboxIdentifier) ?? null,
    [inboxIdentifier, inboxOptions]
  );

  const selectedTeamOption = useMemo(
    () => teamOptions.find((option) => option.id === String(selectedTeamId)) ?? null,
    [selectedTeamId, teamOptions]
  );

  const selectedAgentOption = useMemo(
    () => agentOptions.find((option) => option.id === String(selectedAssigneeId)) ?? null,
    [agentOptions, selectedAssigneeId]
  );

  const filteredConversations = useMemo(() => {
    const term = search.trim().toLowerCase();
    return conversations.filter((item) => {
      const matchesSearch =
        !term || `${item.contactName} ${item.phone} ${item.lastMessage}`.toLowerCase().includes(term);
      const currentAgent = AppStorage.getAgentName();
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

  // API pausada — funções desabilitadas temporariamente
  const loadMessages = useCallback(async (_conversationId: number) => {
    void account;
  }, [account]);

  const sendMessage = async () => { void newMessage; };
  const updateStatus = async (_status: string) => {};
  const transferConversation = async () => {};
  const saveLabels = async () => { void labelInput; };

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
          <Dropdown<ChatwootSelectOption>
            className={Style.filtersDropdown}
            label="Status"
            options={STATUS_OPTIONS}
            value={selectedStatusOption}
            placeholder="Selecionar"
            open={openDropdown === "status"}
            onOpen={() => setOpenDropdown("status")}
            onClose={() => setOpenDropdown(null)}
            onChange={(value) =>
              setStatusFilter((value as ChatwootSelectOption).id as StatusFilter)
            }
          />
        </div>
      </section>
      </TitlePage>
      {showInboxPicker && (
        <div className={Style.modalOverlay}>
          <div className={Style.modal}>
            <h3>Escolha a inbox</h3>
            <p>Selecione a caixa de entrada para iniciar o atendimento.</p>
            <Dropdown<ChatwootSelectOption>
              className={Style.modalDropdown}
              label="Inbox"
              options={inboxOptions}
              value={selectedInboxOption}
              placeholder="Selecione"
              open={openDropdown === "inbox"}
              onOpen={() => setOpenDropdown("inbox")}
              onClose={() => setOpenDropdown(null)}
              onChange={(value) =>
                setInboxIdentifier((value as ChatwootSelectOption).id)
              }
            />
            <button type="button" disabled={!inboxIdentifier} onClick={() => {}}>
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
          <Dropdown<ChatwootSelectOption>
            className={Style.sideToolsDropdown}
            label="Time/Setor"
            options={teamOptions}
            value={selectedTeamOption}
            placeholder="Selecionar"
            open={openDropdown === "team"}
            onOpen={() => setOpenDropdown("team")}
            onClose={() => setOpenDropdown(null)}
            onChange={(value) => {
              const nextValue = (value as ChatwootSelectOption).id;
              setSelectedTeamId(nextValue ? Number(nextValue) : "");
            }}
          />

          <label>Agente</label>
          <Dropdown<ChatwootSelectOption>
            className={Style.sideToolsDropdown}
            label="Agente"
            options={agentOptions}
            value={selectedAgentOption}
            placeholder="Selecionar"
            open={openDropdown === "agent"}
            onOpen={() => setOpenDropdown("agent")}
            onClose={() => setOpenDropdown(null)}
            onChange={(value) => {
              const nextValue = (value as ChatwootSelectOption).id;
              setSelectedAssigneeId(nextValue ? Number(nextValue) : "");
            }}
          />

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
