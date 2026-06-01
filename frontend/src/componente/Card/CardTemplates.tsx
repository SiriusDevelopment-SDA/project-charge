"use client";

import { Play, Trash2 } from "lucide-react";
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
}: PropsCardTemplates) {
  const canUseTemplate = isTemplateApproved(template.meta_status);
  const statusTone = getTemplateStatusTone(template.meta_status);
  const statusLabel = getTemplateStatusLabel(template.meta_status);

  return (
    <>
      <div className={Style.CardWrap}>
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

                <div className={Style.CardIcons}>
                  <button
                    className={Style.BtnUse}
                    onClick={() => onUse?.(template)}
                    disabled={!canUseTemplate}
                    title={
                      canUseTemplate
                        ? "Usar template"
                        : `Template indisponível enquanto estiver com status ${statusLabel}.`
                    }
                  >
                    <Play size={16} />
                  </button>

                  <button className={Style.BtnDelete} onClick={() => onDelete(template)}>
                    <Trash2 size={16} />
                  </button>
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
