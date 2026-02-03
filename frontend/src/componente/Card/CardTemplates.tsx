"use client";

// React
import { Play, Trash2 } from "lucide-react";
import { toast } from "react-toastify";

// Components
import { BaseCard } from "../Index";

// Styles
import Style from "./CardTemplates.module.css";
import type { PropsCardTemplates } from "../../types";


export function CardTemplates({
  template,
  isOpen,
  onToggle,
  onDelete,
  setOpenModal
}: PropsCardTemplates) {
  return (
    <>
      <div className={Style.CardWrap}>
        <BaseCard classname={Style.TemplateCard}>
          {isOpen && (
            <div className={Style.Balloon}>
              <span className={Style.BalloonTitle}>{template.name}</span>
              <p className={Style.BalloonMessage}>{template.message}</p>
            </div>
          )}

          <div className={Style.CardInner}>
            <div className={Style.CardHeader}>
              <span className={Style.CardTitle}>{template.name}</span>

              <div className={Style.ContainerCatogoria}>
                <span className={Style.CardBadge}>{template.category}</span>

                <div className={Style.CardIcons}>
                  <button
                    className={Style.BtnUse}
                    onClick={() =>
                      toast.info("Ação de usar template (implementar)")
                    }
                  >
                    <Play size={16} />
                  </button>

                  <button
                    className={Style.BtnDelete}
                    onClick={() => {
                        setOpenModal(true), 
                        onDelete(template)
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>

            <p className={Style.CardMessage}>{template.message}</p>

            <span
              className={Style.VerMais}
              onClick={() => onToggle(template.id)}
            >
              {isOpen ? "Fechar" : "Ver mais"}
            </span>
          </div>
        </BaseCard>
      </div>

      
    </>
  );
}
