import { useMemo, useState, type ReactNode } from "react";
import { Bot } from "lucide-react";
import type {
  ChatwootConversationItem,
  ChatwootMessageItem,
} from "../../../types/chatwootApiTypes";
import {
  type ChatwootConversationGroup,
  formatConversationTime,
  initials,
  isAgentMessage,
  isBotMessage,
  timeAgo,
} from "../../../hooks/controller/chatwoot/chatwootHelpers";
import Style from "../Styles/Chatwoot.module.css";

type ConversationGroupCardProps = {
  group: ChatwootConversationGroup;
  activeConversationId: number | null;
  isIa: boolean;
  onOpenPrimaryConversation: () => void;
  onSelectConversation: (conversationId: number) => void;
};

export function ConversationGroupCard({
  group,
  activeConversationId,
  isIa,
  onOpenPrimaryConversation,
  onSelectConversation,
}: ConversationGroupCardProps) {
  const [showAllSessions, setShowAllSessions] = useState(false);
  const conversation = group.primaryConversation;
  const hasActiveConversation = group.conversations.some(
    (item) => item.id === activeConversationId,
  );
  const sessionCount = group.conversations.length;
  const visibleSessions = useMemo(() => {
    if (showAllSessions || sessionCount <= 3) {
      return group.conversations;
    }

    const defaultSessions = group.conversations.slice(0, 3);
    const activeSession = group.conversations.find(
      (item) => item.id === activeConversationId,
    );

    if (!activeSession || defaultSessions.some((item) => item.id === activeSession.id)) {
      return defaultSessions;
    }

    return [...group.conversations.slice(0, 2), activeSession];
  }, [activeConversationId, group.conversations, sessionCount, showAllSessions]);

  const hiddenSessionsCount = sessionCount - visibleSessions.length;
  const conversationSummary =
    conversation.status === "resolved"
      ? "Resolvido"
      : conversation.assigneeName ?? "Aberto";

  return (
    <div className={Style.cardGroup}>
      <button
        type="button"
        className={`${Style.card} ${hasActiveConversation ? Style.cardActive : ""}`}
        onClick={onOpenPrimaryConversation}
      >
        <div className={`${Style.cardAvatar} ${isIa ? Style.cardAvatarIa : ""}`}>
          {isIa ? <Bot size={14} /> : initials(conversation.contactName || conversation.phone)}
        </div>
        <div className={Style.cardBody}>
          <div className={Style.cardRow}>
            <span className={Style.cardName}>
              {conversation.contactName || conversation.phone || `#${conversation.id}`}
            </span>
            <span className={Style.cardTime}>{timeAgo(conversation.updatedAt)}</span>
          </div>
          <p className={Style.cardPreview}>{conversation.lastMessage || "—"}</p>
          <div className={Style.cardMeta}>
            {group.unreadCount > 0 && (
              <span className={Style.unread}>{group.unreadCount}</span>
            )}
            {sessionCount > 1 && (
              <span className={Style.groupCount}>{sessionCount} sessoes</span>
            )}
            {isIa ? (
              <span className={Style.tagIa}>
                <Bot size={9} /> IA
              </span>
            ) : (
              <span className={Style.tagHuman}>
                {conversationSummary}
              </span>
            )}
          </div>
        </div>
      </button>

      {sessionCount > 1 && hasActiveConversation && (
        <div className={Style.groupSessions}>
          {visibleSessions.map((item) => {
            
            return (
              <button
                key={item.id}
                type="button"
                className={`${Style.groupSessionButton} ${
                  item.id === activeConversationId ? Style.groupSessionButtonActive : ""
                }`}
                onClick={() => onSelectConversation(item.id)}
              >
                <span className={Style.groupSessionTitle}>
                  Atendimento #{item.id}
                </span>
                <span className={Style.groupSessionMeta}>
                  {item.status === "resolved" ? "Resolvida" : item.assigneeName ?? "Aberta"} ·{" "}
                  {formatConversationTime(item.updatedAt)} · {timeAgo(item.updatedAt)}
                </span>
              </button>
            );
          })}

          {hiddenSessionsCount > 0 && !showAllSessions && (
            <button
              type="button"
              className={Style.groupToggleButton}
              onClick={() => setShowAllSessions(true)}
            >
              Ver mais {hiddenSessionsCount} sessoes
            </button>
          )}

          {sessionCount > 3 && showAllSessions && (
            <button
              type="button"
              className={Style.groupToggleButton}
              onClick={() => setShowAllSessions(false)}
            >
              Ver menos sessoes
            </button>
          )}
        </div>
      )}
    </div>
  );
}

type BubbleProps = {
  message: ChatwootMessageItem;
};

export function Bubble({ message }: BubbleProps) {
  if (!message.content?.trim()) return null;

  const bot = isBotMessage(message);
  const agent = isAgentMessage(message);

  return (
    <div
      className={`${Style.bubble} ${agent ? Style.bubbleOut : Style.bubbleIn} ${
        bot ? Style.bubbleBot : ""
      }`}
    >
      {bot && (
        <span className={Style.botLabel}>
          <Bot size={9} /> IA
        </span>
      )}
      <p className={Style.bubbleText}>{message.content}</p>
      <span className={Style.bubbleTs}>{timeAgo(message.createdAt)}</span>
    </div>
  );
}

type RowProps = {
  k: string;
  v: ReactNode;
};

export function Row({ k, v }: RowProps) {
  return (
    <div className={Style.detailsRow}>
      <span className={Style.detailsRowKey}>{k}</span>
      <span className={Style.detailsRowValue}>{v}</span>
    </div>
  );
}

type StatusChipProps = {
  status: string;
  isIa: boolean;
};

export function StatusChip({ status, isIa }: StatusChipProps) {
  const map: Record<string, { label: string; color: string }> = {
    open: { label: "Aberto", color: "rgba(74,222,128,0.85)" },
    pending: { label: "Pendente", color: "rgba(167,139,250,0.85)" },
    resolved: { label: "Resolvido", color: "rgba(100,116,139,0.7)" },
    snoozed: { label: "Snoozed", color: "rgba(251,191,36,0.7)" },
  };
  const current = map[status] ?? {
    label: status,
    color: "rgba(255,255,255,0.5)",
  };

  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: isIa ? "rgba(167,139,250,0.9)" : current.color,
      }}
    >
      {isIa ? "IA" : current.label}
    </span>
  );
}

export type NumericSelectOption = {
  value: number;
  label: string;
};

type NativeSelectProps = {
  label: string;
  options: NumericSelectOption[];
  value: number | null;
  onChange: (value: number | null) => void;
};

export function NativeSelect({
  label,
  options,
  value,
  onChange,
}: NativeSelectProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span
        style={{
          fontSize: 11,
          color: "rgba(255,255,255,0.3)",
          textTransform: "uppercase",
          letterSpacing: "0.5px",
        }}
      >
        {label}
      </span>
      <select
        style={{
          height: 30,
          borderRadius: 7,
          border: "1px solid rgba(255,255,255,0.1)",
          background: "#1a1a1c",
          color: "rgba(255,255,255,0.8)",
          fontSize: 12,
          padding: "0 8px",
          outline: "none",
        }}
        value={value ?? ""}
        onChange={(event) =>
          onChange(event.target.value ? Number(event.target.value) : null)
        }
      >
        <option value="">— {label} —</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

type NativeTextSelectProps = {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
};

export function NativeTextSelect({
  label,
  options,
  value,
  onChange,
}: NativeTextSelectProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span
        style={{
          fontSize: 11,
          color: "rgba(255,255,255,0.3)",
          textTransform: "uppercase",
          letterSpacing: "0.5px",
        }}
      >
        {label}
      </span>
      <select
        style={{
          height: 30,
          borderRadius: 7,
          border: "1px solid rgba(255,255,255,0.1)",
          background: "#1a1a1c",
          color: "rgba(255,255,255,0.8)",
          fontSize: 12,
          padding: "0 8px",
          outline: "none",
        }}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">— {label} —</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
