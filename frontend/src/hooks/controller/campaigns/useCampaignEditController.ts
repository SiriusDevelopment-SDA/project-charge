import { useCallback, useReducer } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { campaignFormSchema } from "../../../schemas/campaign.schema";
import type { CampaignFormValues } from "../../../schemas/campaign.schema";
import type { CampaignData } from "../../../types";
import { formatDateBR } from "../../../utils/date";
import { CampaignService } from "../../../services/campaign/campaign.service";
import { toast } from "react-toastify";
import type { CampaignUpdate } from "../../../types/champaignApiTypes";
import { getErrorMessage } from "../../../utils/error";

export type ActiveModal =
  | null
  | "STATUS"
  | "EDIT"
  | "CREATE"
  | "CAL_DISPARO"
  | "CAL_FINAL"
  | "TIME"
  | "TEMPLATE_PREVIEW";

type UiState = {
  activeModal: ActiveModal;
  actionsMenuOpen: boolean;
  tooltipOpen: boolean;
};

type UiAction =
  | { type: "OPEN_MODAL"; modal: ActiveModal }
  | { type: "CLOSE_MODAL" }
  | { type: "TOGGLE_ACTIONS_MENU" }
  | { type: "SET_TOOLTIP"; open: boolean };

function uiReducer(state: UiState, action: UiAction): UiState {
  switch (action.type) {
    case "OPEN_MODAL":
      return { ...state, activeModal: action.modal };
    case "CLOSE_MODAL":
      return { ...state, activeModal: null };
    case "TOGGLE_ACTIONS_MENU":
      return { ...state, actionsMenuOpen: !state.actionsMenuOpen };
    case "SET_TOOLTIP":
      return { ...state, tooltipOpen: action.open };
    default:
      return state;
  }
}

const initialUiState: UiState = {
  activeModal: null,
  actionsMenuOpen: false,
  tooltipOpen: false,
};

export function useCampaignEditController(campaign?: CampaignData) {
  const [ui, dispatch] = useReducer(uiReducer, initialUiState);

  const defaultValues: CampaignFormValues = {
    isRecurring: campaign?.recurring ?? false,
    dispatchDate: formatDateBR(campaign?.startDate),
    endDate: formatDateBR(campaign?.endDate),
    dispatchTime: campaign?.dispatchTime ?? "",
    note: "",
  };

  const form = useForm<CampaignFormValues>({
    resolver: zodResolver(campaignFormSchema),
    defaultValues,
    mode: "onChange",
  });

  const openEdit = () => {
    form.reset(defaultValues);
    dispatch({ type: "OPEN_MODAL", modal: "EDIT" });
  };

  const openCreate = () => {
    form.reset(defaultValues);
    dispatch({ type: "OPEN_MODAL", modal: "CREATE" });
    return true;
  };

  const editStatusCampaign = useCallback(
    async (campaignId: string, payload: CampaignUpdate) => {
      try {
        const result = await CampaignService.update(campaignId, payload);

        if (result.status >= 200 && result.status < 300) {
          toast.success("Status da campanha atualizado com sucesso!");
          return { success: true };
        }

        return { success: false };
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, "Erro ao atualizar campanha."));
        return { success: false };
      }
    },
    []
  );

  return {
    ui,
    dispatch,
    form,
    openEdit,
    openCreate,
    editStatusCampaign,
    openStatusModal: () => dispatch({ type: "OPEN_MODAL", modal: "STATUS" }),
    openCalendarDisparo: () =>
      dispatch({ type: "OPEN_MODAL", modal: "CAL_DISPARO" }),
    openCalendarFinal: () => dispatch({ type: "OPEN_MODAL", modal: "CAL_FINAL" }),
    openTimePicker: () => dispatch({ type: "OPEN_MODAL", modal: "TIME" }),
    openTemplatePreview: () =>
      dispatch({ type: "OPEN_MODAL", modal: "TEMPLATE_PREVIEW" }),
    closeModal: () => dispatch({ type: "CLOSE_MODAL" }),
    toggleActionsMenu: () => dispatch({ type: "TOGGLE_ACTIONS_MENU" }),
    setTooltip: (open: boolean) => dispatch({ type: "SET_TOOLTIP", open }),
  };
}

