"use client";

import { useState } from "react";
import { Trash2, Pencil, MoreVertical, HelpCircle } from "lucide-react";
import { toast } from "react-toastify";
import type { DateRange } from "react-day-picker";
import { format } from "date-fns";
import { BaseCardCampanhas, MyCalendar, MyTimePicker } from "../../Index";
import DynamicModal from "../../modal/modalAlertTemplate";
import { ModalEditarCampanha } from "./ModalEditarCampanha";
import type { PropsCardCampanhas } from "../../../types";
import Style from "./CardCampanhas.module.css";
import FoguinhoVerde from "../../../assets/imagens/FoguinhoVerde.png";
import FoguinhoVermelho from "../../../assets/imagens/FoguinhoVermelho.png";

export function CardCampanhas({ campanha, onDelete }: PropsCardCampanhas) {
  // Estados para os modais
  const [openEdit, setOpenEdit] = useState(false);
  const [openStatusModal, setOpenStatusModal] = useState(false);
  const [showCalendarDisparo, setShowCalendarDisparo] = useState(false);
  const [showCalendarFinalizacao, setShowCalendarFinalizacao] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  // Estados para os menus e tooltips
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  // Estados dos dados da campanha
  const [isActive, setIsActive] = useState(campanha.isEnabled ?? true);
  const [tipo, setTipo] = useState(campanha.category || "UTILITY");
  const [dataDisparo, setDataDisparo] = useState(
    campanha.createdAt
      ? new Date(campanha.createdAt).toLocaleDateString("pt-BR")
      : "-",
  );
  const [dataFinalizacao, setDataFinalizacao] = useState(
    campanha.updatedAt
      ? new Date(campanha.updatedAt).toLocaleDateString("pt-BR")
      : "-",
  );
  const [horario, setHorario] = useState("09:00");

  // Estados temporários para edição
  const [tempTipo, setTempTipo] = useState(tipo);
  const [tempDataDisparo, setTempDataDisparo] = useState(dataDisparo);
  const [tempDataFinalizacao, setTempDataFinalizacao] =
    useState(dataFinalizacao);
  const [tempHorario, setTempHorario] = useState(horario);

  // Lógica de exibição
  const statusIcon = isActive ? FoguinhoVerde : FoguinhoVermelho;
  const statusText = isActive ? "Desativar" : "Ativar";

  
  function handleToggleStatus() {
    setIsActive((prev) => !prev);
    setOpenStatusModal(false);
    toast.success("Status atualizado!");
  }

  function handleOpenEdit() {
    setTempTipo(tipo);
    setTempDataDisparo(dataDisparo);
    setTempDataFinalizacao(dataFinalizacao);
    setTempHorario(horario);
    setShowCalendarDisparo(false);
    setShowCalendarFinalizacao(false);
    setShowTimePicker(false);
    setOpenEdit(true);
  }

  function handleDateDisparoSelect(range: DateRange | undefined) {
    if (range?.from) {
      setTempDataDisparo(format(range.from, "dd/MM/yyyy"));
      setShowCalendarDisparo(false);
    }
  }

  function handleDateFinalizacaoSelect(range: DateRange | undefined) {
    if (range?.from) {
      setTempDataFinalizacao(format(range.from, "dd/MM/yyyy"));
      setShowCalendarFinalizacao(false);
    }
  }

  function handleTimeSelect(time: string) {
    setTempHorario(time);
  }

  function handleSave() {
    setTipo(tempTipo);
    setDataDisparo(tempDataDisparo);
    setDataFinalizacao(tempDataFinalizacao);
    setHorario(tempHorario);
    toast.success("Dados da campanha atualizados!");
    setOpenEdit(false);
  }

  return (
    <>
      {/* CARDS */}
      <BaseCardCampanhas className={Style.campaignCard}>
        {/* HEADER */}
        <div className={Style.header}>
          <h3 className={Style.title}>{campanha.name}</h3>
          <div
            className={`${Style.StatusWrapper} ${
              isActive ? Style.flameActive : ""
            }`}
            onClick={() => setOpenStatusModal(true)}
            title={statusText}
          >
            <img
              src={statusIcon}
              alt={statusText}
              className={Style.statusIcon}
            />
          </div>
        </div>

        {/* TEMPLATE - COM BOTÃO DE AJUDA */}
        <div className={Style.templateBox}>
          <div className={Style.templateHeader}>
            <span className={Style.templateLabel}>TEMPLATE</span>
            <button
              className={Style.helpButton}
              onMouseEnter={(e) => {
                e.stopPropagation();
                setShowTooltip(true);
              }}
              onMouseLeave={(e) => {
                const relatedTarget = e.relatedTarget as HTMLElement;
                if (!relatedTarget?.closest(`.${Style.tooltip}`)) {
                  setShowTooltip(false);
                }
              }}
              title="Ver mensagem completa"
            >
              <HelpCircle size={24} />
            </button>
          </div>
          <p>{campanha.message}</p>
          {showTooltip && (
            <div
              className={Style.tooltip}
              onMouseEnter={() => setShowTooltip(true)}
              onMouseLeave={() => setShowTooltip(false)}
            >
              {campanha.message}
            </div>
          )}
        </div>

        {/* DETALHES - COM MENU DE AÇÕES */}
        <div className={Style.detailsBox}>
          <div className={Style.detailsHeader}>
            <h4>DETALHES DE CAMPANHA</h4>
            <div className={Style.actionsMenuWrapper}>
              <button
                className={Style.actionsMenuButton}
                onClick={() => setShowActionsMenu(!showActionsMenu)}
                onBlur={() => setTimeout(() => setShowActionsMenu(false), 200)}
              >
                <MoreVertical size={18} />
              </button>
              {showActionsMenu && (
                <div className={Style.actionsDropdown}>
                  <button
                    onClick={() => {
                      handleOpenEdit();
                      setShowActionsMenu(false);
                    }}
                  >
                    <Pencil size={14} /> Editar
                  </button>
                  <button
                    className={Style.deleteAction}
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
          <div className={Style.detailsGrid}>
            <p><strong>Tipo:</strong> {tipo}</p>
            <p><strong>Início disparo:</strong> {dataDisparo}</p>
            <p><strong>Fim disparo:</strong> {dataFinalizacao}</p>
            <p><strong>Horário disparo:</strong> {horario}</p>
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
      <ModalEditarCampanha
        open={openEdit}
        onClose={() => setOpenEdit(false)}
        onSave={handleSave}
        tipo={tempTipo}
        setTipo={setTempTipo}
        dataDisparo={tempDataDisparo}
        onOpenCalendarDisparo={() => setShowCalendarDisparo(true)}
        dataFinalizacao={tempDataFinalizacao}
        onOpenCalendarFinalizacao={() => setShowCalendarFinalizacao(true)}
        horario={tempHorario}
        onOpenTimePicker={() => setShowTimePicker(true)}
      />

      {/* MODAL CALENDÁRIO DISPARO */}
      <DynamicModal
        open={showCalendarDisparo}
        type="custom"
        title="Selecione a Data de Disparo"
        onClose={() => setShowCalendarDisparo(false)}
        customContent={
          <>
            <MyCalendar
              selected={undefined}
              onSelect={handleDateDisparoSelect}
            />
            <button
              className={Style.closeCalendarButton}
              onClick={() => setShowCalendarDisparo(false)}
            >
              Fechar
            </button>
          </>
        }
      />

      {/* MODAL CALENDÁRIO FINALIZAÇÃO */}
      <DynamicModal
        open={showCalendarFinalizacao}
        type="custom"
        title="Selecione a Data de Finalização"
        onClose={() => setShowCalendarFinalizacao(false)}
        customContent={
          <>
            <MyCalendar
              selected={undefined}
              onSelect={handleDateFinalizacaoSelect}
            />
            <button
              className={Style.closeCalendarButton}
              onClick={() => setShowCalendarFinalizacao(false)}
            >
              Fechar
            </button>
          </>
        }
      />

      {/* MODAL TIME PICKER */}
      <DynamicModal
        open={showTimePicker}
        type="custom"
        title="Selecione o Horário"
        onClose={() => setShowTimePicker(false)}
        customContent={
          <>
            <MyTimePicker selected={tempHorario} onSelect={handleTimeSelect} />
            <button
              className={Style.closeCalendarButton}
              onClick={() => setShowTimePicker(false)}
            >
              Fechar
            </button>
          </>
        }
      />
    </>
  );
}
