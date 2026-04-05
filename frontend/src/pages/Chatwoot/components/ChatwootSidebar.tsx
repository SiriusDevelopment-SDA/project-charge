import { AlertCircle, Bot, Check, RefreshCw, Users } from "lucide-react";
import type { ChatwootConversationItem } from "../../../types/chatwootApiTypes";
import type {
  ChatwootConversationGroup,
  ChatwootQueue,
} from "../../../hooks/controller/chatwoot/chatwootHelpers";
import { ConversationGroupCard } from "./ChatwootShared";
import Style from "../Styles/Chatwoot.module.css";

type ChatwootSidebarProps = {
  queue: ChatwootQueue;
  search: string;
  ready: boolean;
  bootErr: string | null;
  displayedConversationGroups: ChatwootConversationGroup[];
  loadingConversations: boolean;
  refreshingConversations: boolean;
  activeConversationId: number | null;
  iaCount: number;
  humanCount: number;
  doneCount: number;
  onQueueChange: (queue: ChatwootQueue) => void;
  onSearchChange: (value: string) => void;
  onRefresh: () => void;
  onSelectConversation: (conversationId: number) => void;
  isConversationIa: (conversation: ChatwootConversationItem) => boolean;
};

export function ChatwootSidebar({
  queue,
  search,
  ready,
  bootErr,
  displayedConversationGroups,
  loadingConversations,
  refreshingConversations,
  activeConversationId,
  iaCount,
  humanCount,
  doneCount,
  onQueueChange,
  onSearchChange,
  onRefresh,
  onSelectConversation,
  isConversationIa,
}: ChatwootSidebarProps) {
  return (
    <aside className={Style.sidebar}>
      <div className={Style.sideHead}>
        <div className={Style.sideTitle}>
          <Bot size={15} className={Style.sideTitleIcon} />
          Atendimentos
        </div>
        <button
          type="button"
          className={`${Style.iconBtn} ${refreshingConversations ? Style.spin : ""}`}
          onClick={onRefresh}
          disabled={refreshingConversations}
          title="Atualizar"
        >
          <RefreshCw size={13} />
        </button>
      </div>

      <div className={Style.tabs}>
        <button
          type="button"
          className={`${Style.tab} ${queue === "ia" ? Style.tabOn : ""}`}
          onClick={() => onQueueChange("ia")}
        >
          <Bot size={11} /> IA
          {iaCount > 0 && <em className={Style.tabCount}>{iaCount}</em>}
        </button>
        <button
          type="button"
          className={`${Style.tab} ${queue === "human" ? Style.tabOn : ""}`}
          onClick={() => onQueueChange("human")}
        >
          <Users size={11} /> Humano
          {humanCount > 0 && <em className={Style.tabCountGreen}>{humanCount}</em>}
        </button>
        <button
          type="button"
          className={`${Style.tab} ${queue === "done" ? Style.tabOn : ""}`}
          onClick={() => onQueueChange("done")}
        >
          <Check size={11} /> Finalizadas
          {doneCount > 0 && <em className={Style.tabCountDone}>{doneCount}</em>}
        </button>
        <button
          type="button"
          className={`${Style.tab} ${queue === "all" ? Style.tabOn : ""}`}
          onClick={() => onQueueChange("all")}
        >
          Todos
        </button>
      </div>

      <div className={Style.searchBox}>
        <input
          className={Style.searchInput}
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Buscar..."
        />
      </div>

      {bootErr && (
        <div className={Style.bootErr}>
          <AlertCircle size={12} /> {bootErr}
        </div>
      )}

      <div className={Style.list}>
        {loadingConversations && [1, 2, 3, 4].map((item) => (
          <div key={item} className={Style.skel} />
        ))}

        {!loadingConversations && displayedConversationGroups.length === 0 && (
          <p className={Style.empty}>{ready ? "Nenhuma conversa." : "Carregando..."}</p>
        )}

        {displayedConversationGroups.map((group) => (
          <ConversationGroupCard
            key={group.key}
            group={group}
            activeConversationId={activeConversationId}
            isIa={isConversationIa(group.primaryConversation)}
            onOpenPrimaryConversation={() =>
              onSelectConversation(group.primaryConversation.id)
            }
            onSelectConversation={onSelectConversation}
          />
        ))}
      </div>
    </aside>
  );
}
