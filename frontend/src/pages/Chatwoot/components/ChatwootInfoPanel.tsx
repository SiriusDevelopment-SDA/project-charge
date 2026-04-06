import { Clock, Tag, Users } from "lucide-react";
import type {
  ChatwootAgent,
  ChatwootConversationItem,
  ChatwootTeam,
} from "../../../types/chatwootApiTypes";
import { NativeSelect, NativeTextSelect, Row, StatusChip } from "./ChatwootShared";
import Style from "../Styles/Chatwoot.module.css";

type ChatwootInfoPanelProps = {
  activeConversation: ChatwootConversationItem | null;
  apiOk: boolean;
  isActiveIa: boolean;
  alreadyAssumed: boolean;
  selectedConversationLabels: string[];
  selectedContactLabels: string[];
  selectableLabels: string[];
  conversationLabelChoice: string;
  teams: ChatwootTeam[];
  agents: ChatwootAgent[];
  selectedTeamId: number | null;
  selectedAgentId: number | null;
  savingConversationLabels: boolean;
  canSaveConversationLabels: boolean;
  transferLoading: boolean;
  pendingLoading: boolean;
  onConversationLabelChoiceChange: (value: string) => void;
  onRemoveConversationLabel: (label: string) => void;
  onSaveConversationLabels: () => void;
  onTeamChange: (value: number | null) => void;
  onAgentChange: (value: number | null) => void;
  onTransfer: () => void;
  onMarkPending: () => void;
};

export function ChatwootInfoPanel({
  activeConversation,
  apiOk,
  isActiveIa,
  alreadyAssumed,
  selectedConversationLabels,
  selectedContactLabels,
  selectableLabels,
  conversationLabelChoice,
  teams,
  agents,
  selectedTeamId,
  selectedAgentId,
  savingConversationLabels,
  canSaveConversationLabels,
  transferLoading,
  pendingLoading,
  onConversationLabelChoiceChange,
  onRemoveConversationLabel,
  onSaveConversationLabels,
  onTeamChange,
  onAgentChange,
  onTransfer,
  onMarkPending,
}: ChatwootInfoPanelProps) {
  return (
    <aside className={Style.panel}>
      {!activeConversation ? (
        <div className={Style.panelEmpty}>Nenhuma conversa selecionada</div>
      ) : (
        <>
          <section className={Style.panelSec}>
            <h5 className={Style.panelLabel}>Informações</h5>
            <Row
              k="Status"
              v={
                <StatusChip
                  status={activeConversation.status}
                  isIa={isActiveIa && !alreadyAssumed}
                />
              }
            />
            {activeConversation.teamName && (
              <Row k="Time" v={activeConversation.teamName} />
            )}
            {activeConversation.protocol && (
              <Row k="Protocolo" v={activeConversation.protocol} />
            )}
            {activeConversation.assigneeName && (
              <Row k="Agente" v={activeConversation.assigneeName} />
            )}
            {activeConversation.unreadCount > 0 && (
              <Row
                k="Não lidas"
                v={<span className={Style.unread}>{activeConversation.unreadCount}</span>}
              />
            )}
            {selectedContactLabels.length > 0 && (
              <div>
                <span className={Style.panelLabel}>Etiquetas do contato</span>
                <div className={Style.labels}>
                  {selectedContactLabels.map((label) => (
                    <span key={label} className={Style.labelChip}>
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>

          {activeConversation.report && (
            <section className={Style.panelSec}>
              <h5 className={Style.panelLabel}>Relatório</h5>
              <p className={Style.panelReport}>{activeConversation.report}</p>
            </section>
          )}

          {apiOk && (
            <>
              <section className={Style.panelSec}>
                <h5 className={Style.panelLabel}>
                  <Tag size={11} /> Etiquetas da conversa
                </h5>
                <NativeTextSelect
                  label="Adicionar na conversa"
                  options={selectableLabels.map((label) => ({ value: label, label }))}
                  value={conversationLabelChoice}
                  onChange={onConversationLabelChoiceChange}
                />
                <div className={Style.labels}>
                  {selectedConversationLabels.length ? (
                    selectedConversationLabels.map((label) => (
                      <button
                        key={label}
                        type="button"
                        className={Style.labelChipButton}
                        onClick={() => onRemoveConversationLabel(label)}
                      >
                        {label}
                      </button>
                    ))
                  ) : (
                    <span className={Style.labelsEmpty}>Nenhuma etiqueta selecionada</span>
                  )}
                </div>
                <button
                  type="button"
                  className={Style.panelBtn}
                  onClick={onSaveConversationLabels}
                  disabled={!canSaveConversationLabels}
                >
                  {savingConversationLabels ? "Salvando..." : "Salvar conversa"}
                </button>
              </section>

              {activeConversation.status === "open" && (
                <section className={Style.panelSec}>
                  <button
                    type="button"
                    className={Style.panelBtnGhost}
                    onClick={onMarkPending}
                    disabled={pendingLoading}
                  >
                    <Clock size={11} />{" "}
                    {pendingLoading ? "Atualizando..." : "Marcar pendente"}
                  </button>
                </section>
              )}

              <section className={Style.panelSec}>
                <h5 className={Style.panelLabel}>
                  <Users size={11} /> Transferir
                </h5>
                <NativeSelect
                  label="Time"
                  options={teams.map((team) => ({ value: team.id, label: team.name }))}
                  value={selectedTeamId}
                  onChange={onTeamChange}
                />
                <NativeSelect
                  label="Agente"
                  options={agents.map((agent) => ({
                    value: agent.id,
                    label: agent.name,
                  }))}
                  value={selectedAgentId}
                  onChange={onAgentChange}
                />
                <button
                  type="button"
                  className={Style.panelBtn}
                  onClick={onTransfer}
                  disabled={(!selectedTeamId && !selectedAgentId) || transferLoading}
                >
                  {transferLoading ? "Transferindo..." : "Transferir"}
                </button>
              </section>
            </>
          )}

          {!apiOk && (
            <div className={Style.noApi}>
              Token de administrador do Maestro nao disponivel. Vincule um token com
              permissao de gestao para transferir, concluir e editar etiquetas.
            </div>
          )}
        </>
      )}
    </aside>
  );
}
