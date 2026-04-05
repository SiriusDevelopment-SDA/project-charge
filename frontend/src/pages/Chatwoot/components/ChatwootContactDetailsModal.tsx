import { Tag } from "lucide-react";
import { DynamicModal } from "../../../componente/Index";
import type {
  ChatwootContactDetails,
  ChatwootConversationItem,
} from "../../../types/chatwootApiTypes";
import { NativeTextSelect, Row, StatusChip } from "./ChatwootShared";
import Style from "../Styles/Chatwoot.module.css";

type ChatwootContactDetailsModalProps = {
  open: boolean;
  activeConversation: ChatwootConversationItem | null;
  apiOk: boolean;
  isActiveIa: boolean;
  alreadyAssumed: boolean;
  contactDetails: ChatwootContactDetails | null;
  selectableLabels: string[];
  selectedContactLabels: string[];
  contactLabelChoice: string;
  savingContactLabels: boolean;
  canSave: boolean;
  onClose: () => void;
  onContactLabelChoiceChange: (value: string) => void;
  onRemoveContactLabel: (label: string) => void;
  onSave: () => void;
};

export function ChatwootContactDetailsModal({
  open,
  activeConversation,
  apiOk,
  isActiveIa,
  alreadyAssumed,
  contactDetails,
  selectableLabels,
  selectedContactLabels,
  contactLabelChoice,
  savingContactLabels,
  canSave,
  onClose,
  onContactLabelChoiceChange,
  onRemoveContactLabel,
  onSave,
}: ChatwootContactDetailsModalProps) {
  return (
    <DynamicModal
      open={open && Boolean(activeConversation)}
      type="custom"
      size="default"
      title="Detalhes do contato"
      onClose={onClose}
      containerClassName={Style.detailsModalContainer}
      customContent={
        activeConversation ? (
          <div className={Style.detailsModalContent}>
            <section className={Style.detailsBlock}>
              <h5 className={Style.panelLabel}>Contato</h5>
              <div className={Style.detailsGrid}>
                <Row
                  k="Nome"
                  v={contactDetails?.name || activeConversation.contactName || "Nao informado"}
                />
                <Row
                  k="Telefone"
                  v={contactDetails?.phone || activeConversation.phone || "Nao informado"}
                />
                <Row
                  k="Email"
                  v={contactDetails?.email || "Nao informado"}
                />
                <Row
                  k="Identificador"
                  v={
                    contactDetails?.identifier ||
                    activeConversation.contactIdentifier ||
                    "Nao informado"
                  }
                />
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
                {activeConversation.assigneeName && (
                  <Row k="Agente" v={activeConversation.assigneeName} />
                )}
              </div>
            </section>

            <section className={Style.detailsBlock}>
              <h5 className={Style.panelLabel}>
                <Tag size={11} /> Etiquetas do contato
              </h5>
              <NativeTextSelect
                label="Adicionar no contato"
                options={selectableLabels.map((label) => ({ value: label, label }))}
                value={contactLabelChoice}
                onChange={onContactLabelChoiceChange}
              />
              <div className={Style.labels}>
                {selectedContactLabels.length ? (
                  selectedContactLabels.map((label) => (
                    <button
                      key={label}
                      type="button"
                      className={Style.labelChipButton}
                      onClick={() => onRemoveContactLabel(label)}
                    >
                      {label}
                    </button>
                  ))
                ) : (
                  <span className={Style.labelsEmpty}>Nenhuma etiqueta selecionada</span>
                )}
              </div>
              {contactDetails &&
                Object.keys(contactDetails.customAttributes ?? {}).length > 0 && (
                  <div className={Style.detailsGrid}>
                    {Object.entries(contactDetails.customAttributes).map(([key, value]) => (
                      <Row key={key} k={key} v={String(value ?? "—")} />
                    ))}
                  </div>
                )}

              {!apiOk && (
                <div className={Style.noApi}>
                  Token sem permissão para alterar etiquetas deste contato.
                </div>
              )}

              <button
                type="button"
                className={Style.panelBtn}
                onClick={onSave}
                disabled={!canSave}
              >
                {savingContactLabels ? "Salvando..." : "Salvar alteracao"}
              </button>
            </section>
          </div>
        ) : null
      }
    />
  );
}
