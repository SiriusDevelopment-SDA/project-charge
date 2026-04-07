import type { RefObject } from "react";
import { Bot, Check, Send, Trash2, UserCheck } from "lucide-react";
import type {
  ChatwootConversationItem,
  ChatwootMessageItem,
} from "../../../types/chatwootApiTypes";
import {
  formatConversationProtocol,
  initials,
} from "../../../hooks/controller/chatwoot/chatwootHelpers";
import { Bubble } from "./ChatwootShared";
import Style from "../Styles/Chatwoot.module.css";

type ChatwootConversationPanelProps = {
  activeConversation: ChatwootConversationItem | null;
  isActiveIa: boolean;
  alreadyAssumed: boolean;
  apiOk: boolean;
  loadingMessages: boolean;
  messages: ChatwootMessageItem[];
  draft: string;
  sending: boolean;
  canSend: boolean;
  assumeLoading: boolean;
  resolveLoading: boolean;
  reopenLoading: boolean;
  bottomRef: RefObject<HTMLDivElement | null>;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onAssume: () => void;
  onResolve: () => void;
  onReopen: () => void;
  onOpenDetails: () => void;
  onDeleteFromQueue: (conversationId: number) => void;
};

export function ChatwootConversationPanel({
  activeConversation,
  isActiveIa,
  alreadyAssumed,
  apiOk,
  loadingMessages,
  messages,
  draft,
  sending,
  canSend,
  assumeLoading,
  resolveLoading,
  reopenLoading,
  bottomRef,
  onDraftChange,
  onSend,
  onAssume,
  onResolve,
  onReopen,
  onOpenDetails,
  onDeleteFromQueue,
}: ChatwootConversationPanelProps) {
  if (!activeConversation) {
    return (
      <main className={Style.chat}>
        <div className={Style.chatEmpty}>
          <Bot size={40} strokeWidth={1} opacity={0.15} />
          <p>Selecione um atendimento</p>
        </div>
      </main>
    );
  }

  const showAssumeButton =
    (isActiveIa || !activeConversation.assigneeName) &&
    !alreadyAssumed &&
    apiOk;

  return (
    <main className={Style.chat}>
      <div className={Style.chatHead}>
        <div className={Style.chatHeadLeft}>
          <div
            className={`${Style.headAvatar} ${
              isActiveIa && !alreadyAssumed ? Style.headAvatarIa : ""
            }`}
          >
            {isActiveIa && !alreadyAssumed ? (
              <Bot size={14} />
            ) : (
              initials(activeConversation.contactName || activeConversation.phone)
            )}
          </div>
          <div>
            <div className={Style.headName}>
              {activeConversation.contactName || activeConversation.phone}
            </div>
            <div className={Style.headSub}>
              {activeConversation.phone}
              {activeConversation.teamName ? ` · ${activeConversation.teamName}` : ""}
              {activeConversation.assigneeName
                ? ` · ${activeConversation.assigneeName}`
                : ""}
              {isActiveIa && !alreadyAssumed && (
                <span className={Style.iaBadge}>
                  <Bot size={9} /> Fila IA
                </span>
              )}
            </div>
          </div>
        </div>

        <div className={Style.chatActions}>
          <div
            className={`${Style.protocolBadge} ${
              activeConversation.generatedProtocol ? Style.protocolBadgeAuto : ""
            }`}
            title={
              activeConversation.generatedProtocol
                ? "Protocolo gerado automaticamente para este atendimento"
                : "Protocolo do atendimento"
            }
          >
            <span className={Style.protocolBadgeLabel}>Protocolo</span>
            <span className={Style.protocolBadgeValue}>
              {formatConversationProtocol(activeConversation)}
            </span>
          </div>
          {showAssumeButton && (
            <button
              type="button"
              className={Style.btnAssume}
              onClick={onAssume}
              disabled={assumeLoading}
            >
              <UserCheck size={13} /> {assumeLoading ? "Assumindo..." : "Assumir"}
            </button>
          )}
          {apiOk && activeConversation.status !== "resolved" && (
            <button
              type="button"
              className={Style.btnResolve}
              onClick={onResolve}
              disabled={resolveLoading}
            >
              <Check size={13} /> {resolveLoading ? "Concluindo..." : "Concluir"}
            </button>
          )}
          {apiOk && activeConversation.status === "resolved" && (
            <button
              type="button"
              className={Style.btnGhost}
              onClick={onReopen}
              disabled={reopenLoading}
            >
              {reopenLoading ? "Reabrindo..." : "Reabrir"}
            </button>
          )}
          <button type="button" className={Style.btnGhost} onClick={onOpenDetails}>
            Detalhes
          </button>
          <button
            type="button"
            className={Style.btnDanger}
            title="Remover conversa da fila local"
            onClick={() => onDeleteFromQueue(activeConversation.id)}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      <div className={Style.msgs}>
        {loadingMessages &&
          [1, 2, 3, 4].map((item) => (
            <div
              key={item}
              className={`${Style.skelMsg} ${item % 2 === 0 ? Style.skelMsgR : ""}`}
            />
          ))}
        {!loadingMessages &&
          messages.map((message) => <Bubble key={message.id} message={message} />)}
        <div ref={bottomRef} />
      </div>

      <div className={Style.composer}>
        <input
          className={Style.composerInput}
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          placeholder="Escreva uma mensagem..."
          disabled={sending}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onSend();
            }
          }}
        />
        <button
          type="button"
          className={Style.composerSend}
          onClick={onSend}
          disabled={!canSend}
        >
          <Send size={14} />
        </button>
      </div>
    </main>
  );
}
