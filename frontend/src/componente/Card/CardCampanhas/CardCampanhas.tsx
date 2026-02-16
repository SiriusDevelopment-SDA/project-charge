"use client";

import { useState } from "react";
import { Trash2, Pencil, MoreVertical, HelpCircle } from "lucide-react";
import { toast } from "react-toastify";
import { BaseCardCampanhas, MyButton } from "../../Index";
import DynamicModal from "../../modal/modalAlertTemplate";
import type { PropsCardCampanhas } from "../../../types";
import Style from "./CardCampanhas.module.css";
import FoguinhoVerde from "../../../assets/imagens/FoguinhoVerde.png";
import FoguinhoVermelho from "../../../assets/imagens/FoguinhoVermelho.png";

export function CardCampanhas({ campanha, onDelete }: PropsCardCampanhas) {
  // Estados para os modais
  const [openEdit, setOpenEdit] = useState(false);
  const [openStatusModal, setOpenStatusModal] = useState(false);

  // Estados para os menus e tooltips
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  // Estados dos dados da campanha
  const [isActive, setIsActive] = useState(campanha.isEnabled ?? true);
  const [tipo, setTipo] = useState("Disparo Único");
  const [dataDisparo, setDataDisparo] = useState("15-02-2026");
  const [dataFinalizacao, setDataFinalizacao] = useState("20-02-2026");
  const [horario, setHorario] = useState("09:00");
  const [observacao, setObservacao] = useState(
    "Campanha criada para disparo em massa."
  );

  // Lógica de exibição
  const statusIcon = isActive ? FoguinhoVerde : FoguinhoVermelho;
  const statusText = isActive ? "Desativar" : "Ativar";
  const MAX_OBS = 50;
  const displayedObservacao =
    observacao.length > MAX_OBS
      ? observacao.slice(0, MAX_OBS) + "..."
      : observacao;

  // Funções de manipulação de eventos
  function handleToggleStatus() {
    setIsActive((prev) => !prev);
    setOpenStatusModal(false);
    toast.success("Status atualizado!");
  }

  function handleSave() {
    toast.success("Dados da campanha atualizados!");
    setOpenEdit(false);
  }

  return (
    <>
      <BaseCardCampanhas className={Style.CampaignCard}>
        {/* HEADER */}
        <div className={Style.Header}>
          <h3 className={Style.Title}>{campanha.name}</h3>
          <div
            className={`${Style.StatusWrapper} ${
              isActive ? Style.FlameActive : ""
            }`}
            onClick={() => setOpenStatusModal(true)}
            title={statusText}
          >
            <img
              src={statusIcon}
              alt={statusText}
              className={Style.StatusIcon}
            />
          </div>
        </div>

        {/* TEMPLATE - COM BOTÃO DE AJUDA */}
        <div className={Style.TemplateBox}>
          <div className={Style.TemplateHeader}>
            <span className={Style.TemplateLabel}>TEMPLATE</span>
            <button
              className={Style.HelpButton}
              onMouseEnter={(e) => {
                e.stopPropagation();
                setShowTooltip(true);
              }}
              onMouseLeave={() => setShowTooltip(false)}
              title="Ver mensagem completa"
            >
              <HelpCircle size={24} />
            </button>
          </div>
          <p>{campanha.message}</p>
          {showTooltip && (
            <div className={Style.Tooltip}>{campanha.message}</div>
          )}
        </div>

        {/* DETALHES - COM MENU DE AÇÕES */}
        <div className={Style.DetailsBox}>
          <div className={Style.DetailsHeader}>
            <h4>DETALHES DE CAMPANHA</h4>
            <div className={Style.ActionsMenuWrapper}>
              <button
                className={Style.ActionsMenuButton}
                onClick={() => setShowActionsMenu(!showActionsMenu)}
                onBlur={() => setTimeout(() => setShowActionsMenu(false), 200)}
              >
                <MoreVertical size={18} />
              </button>
              {showActionsMenu && (
                <div className={Style.ActionsDropdown}>
                  <button
                    onClick={() => {
                      setOpenEdit(true);
                      setShowActionsMenu(false);
                    }}
                  >
                    <Pencil size={14} /> Editar
                  </button>
                  <button
                    className={Style.DeleteAction}
                    onClick={() => {
                      onDelete(campanha);
                      setShowActionsMenu(false);
                    }}
                  >
                    <Trash2 size={14} /> Deletar
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className={Style.DetailsGrid}>
            <p><strong>TIPO:</strong> {tipo}</p>
            <p><strong>DATA DE DISPARO:</strong> {dataDisparo}</p>
            <p><strong>DATA DE FINALIZAÇÃO:</strong> {dataFinalizacao}</p>
            <p><strong>HORÁRIO:</strong> {horario}</p>
            <p><strong>OBSERVAÇÃO:</strong> {displayedObservacao}</p>
          </div>
        </div>
      </BaseCardCampanhas>

      {/* MODAL STATUS */}
      <DynamicModal
        open={openStatusModal}
        type="warning"
        title={isActive ? "Pausar campanha?" : "Ativar campanha?"}
        description="Deseja alterar o status da campanha?"
        onClose={() => setOpenStatusModal(false)}
        buttons={[
          {
            label: "Cancelar",
            variant: "danger",
            onClick: () => setOpenStatusModal(false),
          },
          {
            label: "Confirmar",
            variant: "success",
            onClick: handleToggleStatus,
          },
        ]}
      />

      {/* MODAL EDITAR */}
      {openEdit && (
        <div className={Style.ModalOverlay}>
          <div className={Style.Modal}>
            <h3>Editar dados da campanha</h3>
            <label>Tipo</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="Disparo Único">Disparo Único</option>
              <option value="Disparo Contínuo">Disparo Contínuo</option>
            </select>
            <label>Data de Disparo</label>
            <input
              type="date"
              value={dataDisparo}
              onChange={(e) => setDataDisparo(e.target.value)}
            />
            <label>Data de Finalização</label>
            <input
              type="date"
              value={dataFinalizacao}
              onChange={(e) => setDataFinalizacao(e.target.value)}
            />
            <label>Horário</label>
            <input
              className={Style.TimeInput}
              type="time"
              value={horario}
              onChange={(e) => setHorario(e.target.value)}
            />
            <label>Observação</label>
            <textarea
              className={Style.TextArea}
              maxLength={50}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
            />
            <small className={Style.CharCount}>
              {observacao.length}/50 caracteres
            </small>
            <div className={Style.ModalActions}>
              <button onClick={() => setOpenEdit(false)}>Cancelar</button>
              <button onClick={handleSave}>Salvar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
