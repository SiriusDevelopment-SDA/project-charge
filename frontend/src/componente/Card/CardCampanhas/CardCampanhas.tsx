"use client";

import { useState } from "react";
import { Trash2, Pencil, MoreVertical, HelpCircle } from "lucide-react";
import { toast } from "react-toastify";
import { BaseCardCampanhas, MyCalendar, MyTimePicker } from "../../Index";
import DynamicModal from "../../modal/modalAlertTemplate";
import { ModalEditarCampanha } from "./ModalEditarCampanha";
import type { PropsCardCampanhas } from "../../../types";
import Style from "./CardCampanhas.module.css";
import FoguinhoVerde from "../../../assets/imagens/FoguinhoVerde.png";
import FoguinhoVermelho from "../../../assets/imagens/FoguinhoVermelho.png";
import { Api } from "../../../services/api";
import type { DateRange } from "react-day-picker";
import { format } from "date-fns";

export function CardCampanhas({ campanha, onDelete }: PropsCardCampanhas) {
  const [openEdit, setOpenEdit] = useState(false);
  const [openStatusModal, setOpenStatusModal] = useState(false);
  const [showCalendarDisparo, setShowCalendarDisparo] = useState(false);
  const [showCalendarFinalizacao, setShowCalendarFinalizacao] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  const [isActive, setIsActive] = useState(campanha.isEnabled ?? true);

  // Valores diretos da campanha
  const categoria = campanha.category?.name ?? "—";
  const dataDisparo = campanha.startDate
    ? new Date(campanha.startDate).toLocaleDateString("pt-BR")
    : "—";
  const dataFinalizacao = campanha.endDate
    ? new Date(campanha.endDate).toLocaleDateString("pt-BR")
    : "—";
  const horarioInicio = campanha.dispatchStartTime ?? "—";

  // Estados temporários para edição (modal)
  const [tempDataDisparo, setTempDataDisparo] = useState(dataDisparo);
  const [tempDataFinalizacao, setTempDataFinalizacao] = useState(dataFinalizacao);
  const [tempHorario, setTempHorario] = useState(horarioInicio);
  const [tempObservacao, setTempObservacao] = useState("");
  const [tempTipo, setTempTipo] = useState(
    campanha.recurring ? "true" : "false"
  );


  // Valores exibidos no card (atualizados após salvar)
  const [displayDataDisparo, setDisplayDataDisparo] = useState(dataDisparo);
  const [displayDataFinalizacao, setDisplayDataFinalizacao] = useState(dataFinalizacao);
  const [displayHorario, setDisplayHorario] = useState(horarioInicio);

  const statusIcon = isActive ? FoguinhoVerde : FoguinhoVermelho;
  const statusText = isActive ? "Desativar" : "Ativar";

  async function handleToggleStatus() {
    try {
      await Api.patch(`/campaigns/${campanha.id}/toggle-status`);
      setIsActive((prev) => !prev);
      toast.success("Status atualizado!");
    } catch {
      toast.error("Erro ao atualizar status da campanha.");
    }
    setOpenStatusModal(false);
  }

  function handleOpenEdit() {
    setTempDataDisparo(dataDisparo);
    setTempDataFinalizacao(dataFinalizacao);
    setTempHorario(horarioInicio);
    setTempObservacao("");
    setShowCalendarDisparo(false);
    setShowCalendarFinalizacao(false);
    setShowTimePicker(false);
    setOpenEdit(true);
    setTempTipo(campanha.recurring ? "true" : "false");
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

  async function handleSave() {
    try {
      const toISO = (dateBR: string) => {
        const [day, month, year] = dateBR.split("/");
        return new Date(`${year}-${month}-${day}`).toISOString();
      };

      const horarioFormatado = tempHorario.length > 5
        ? tempHorario.slice(0, 5)
        : tempHorario;

      const payload = {
        recurring: tempTipo === "true",
        startDate: toISO(tempDataDisparo),
        endDate: toISO(tempDataFinalizacao),
        dispatchStartTime: horarioFormatado,
      };

      

      console.log("Payload enviado:", payload);

      await Api.patch(`/campaigns/${campanha.id}`, payload);

      setDisplayDataDisparo(tempDataDisparo);
      setDisplayDataFinalizacao(tempDataFinalizacao);
      setDisplayHorario(horarioFormatado);

      toast.success("Campanha atualizada com sucesso!");
      setOpenEdit(false);
    } catch (err: any) {
      console.error("Erro ao atualizar campanha:", err?.response?.data ?? err);
      const msg = err?.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg.join(", ") : msg ?? "Erro ao atualizar campanha.");
    }
  }

  return (
    <>
      <BaseCardCampanhas className={Style.campaignCard}>
        {/* HEADER */}
        <div className={Style.header}>
          <h3 className={Style.title}>{campanha.name}</h3>
          <div
            className={`${Style.StatusWrapper} ${isActive ? Style.flameActive : ""}`}
            onClick={() => setOpenStatusModal(true)}
            title={statusText}
          >
            <img src={statusIcon} alt={statusText} className={Style.statusIcon} />
          </div>
        </div>

        {/* TEMPLATE */}
        <div className={Style.templateBox}>
          <div className={Style.templateHeader}>
            <span className={Style.templateLabel}>
              TEMPLATE: {campanha.template?.name ?? "—"}
            </span>
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
          <p>{campanha.template?.message ?? "Sem mensagem"}</p>
          {showTooltip && (
            <div
              className={Style.tooltip}
              onMouseEnter={() => setShowTooltip(true)}
              onMouseLeave={() => setShowTooltip(false)}
            >
              {campanha.template?.message ?? "Sem mensagem"}
            </div>
          )}
        </div>

        {/* DETALHES */}
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
            <p><strong>Categoria:</strong> {categoria}</p>
            <p><strong>Início:</strong> {displayDataDisparo}</p>
            <p><strong>Fim:</strong> {displayDataFinalizacao}</p>
            <p><strong>Horário:</strong> {displayHorario}</p>
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
          { label: "Cancelar", variant: "danger", onClick: () => setOpenStatusModal(false) },
          { label: "Confirmar", variant: "success", onClick: handleToggleStatus },
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
        observacao={tempObservacao}
        setObservacao={setTempObservacao}

      />

      {/* MODAL CALENDÁRIO DISPARO */}
      <DynamicModal
        open={showCalendarDisparo}
        type="custom"
        title="Selecione a Data de Disparo"
        onClose={() => setShowCalendarDisparo(false)}
        customContent={
          <>
            <MyCalendar selected={undefined} onSelect={handleDateDisparoSelect} />
            <button className={Style.closeCalendarButton} onClick={() => setShowCalendarDisparo(false)}>
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
            <MyCalendar selected={undefined} onSelect={handleDateFinalizacaoSelect} />
            <button className={Style.closeCalendarButton} onClick={() => setShowCalendarFinalizacao(false)}>
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
            <button className={Style.closeCalendarButton} onClick={() => setShowTimePicker(false)}>
              Fechar
            </button>
          </>
        }
      />
    </>
  );
}
