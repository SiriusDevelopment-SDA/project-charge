"use client";

import { useState } from "react";
import { Info, MoreVertical, Play, Trash2 } from "lucide-react";
import { BaseCard } from "../Index";
import Style from "./CardTemplates.module.css";
import type { PropsCardTemplates } from "../../types";
import {
  getTemplateStatusLabel,
  getTemplateStatusTone,
  isTemplateApproved,
} from "../../utils/templateStatus";

export function CardTemplates({
  template,
  onPreview,
  onDelete,
  onUse,
  onDetails,
}: PropsCardTemplates) {
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const canUseTemplate = isTemplateApproved(template.meta_status);
  const statusTone = getTemplateStatusTone(template.meta_status);
  const statusLabel = getTemplateStatusLabel(template.meta_status);

  const closeMenu = () => setActionsMenuOpen(false);

  return (
    <>
      <div className={`${Style.CardWrap} ${actionsMenuOpen ? Style.CardWrapOpen : ""}`}>
        <BaseCard classname={Style.TemplateCard}>
          <div className={Style.CardInner}>
            <div className={Style.CardHeader}>
              <span className={Style.CardTitle}>{template.name}</span>

              <div className={Style.ContainerCatogoria}>
                <div className={Style.BadgesRow}>
                  <span className={Style.CardBadge}>{template.category}</span>
                  <span
                    className={`${Style.StatusBadge} ${
                      statusTone === "approved"
                        ? Style.StatusApproved
                        : statusTone === "warning"
                          ? Style.StatusWarning
                          : statusTone === "danger"
                            ? Style.StatusDanger
                            : Style.StatusNeutral
                    }`}
                  >
                    {statusLabel}
                  </span>
                </div>

                <div
                  className={Style.actionsMenuWrapper}
                  tabIndex={0}
                  onBlur={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                      closeMenu();
                    }
                  }}
                >
                  <button
                    type="button"
                    className={Style.actionsMenuButton}
                    onClick={() => setActionsMenuOpen((open) => !open)}
                    aria-label="Abrir ações"
                    aria-haspopup="menu"
                    aria-expanded={actionsMenuOpen}
                  >
                    <MoreVertical size={16} />
                  </button>

                  {actionsMenuOpen && (
                    <div className={Style.actionsDropdown} role="menu">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          onDetails?.(template);
                          closeMenu();
                        }}
                      >
                        <Info size={14} />
                        Detalhes
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        disabled={!canUseTemplate}
                        title={
                          canUseTemplate
                            ? "Usar template"
                            : `Template indisponível enquanto estiver com status ${statusLabel}.`
                        }
                        onClick={() => {
                          onUse?.(template);
                          closeMenu();
                        }}
                      >
                        <Play size={14} />
                        Usar
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className={Style.deleteAction}
                        onClick={() => {
                          onDelete(template);
                          closeMenu();
                        }}
                      >
                        <Trash2 size={14} />
                        Deletar
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <p className={Style.CardMessage}>{template.message}</p>

            <span className={Style.VerMais} onClick={() => onPreview(template)}>
              Ver mais
            </span>
          </div>
        </BaseCard>
      </div>
    </>
  );
}
