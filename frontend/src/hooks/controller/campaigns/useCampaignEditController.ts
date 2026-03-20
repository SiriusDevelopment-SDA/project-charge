import { useCallback, useReducer } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { campaignFormSchema } from "../../../schemas/campaign.schema";
import type { CampaignFormValues } from "../../../schemas/campaign.schema";
import type { CampaignData } from "../../../types";
import { queryKeys } from "../../../lib/queryKeys";
import { formatDateBR } from "../../../utils/date";
import { CampaignService } from "../../../services/campaign/campaign.service";
import { toast } from "react-toastify";
import type { CampaignUpdate } from "../../../types/champaignApiTypes";
import { getErrorMessage } from "../../../utils/error";
import { useAccountParam } from "../../useAccountParam";

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

function toCampaignDateIso(value: string) {
  const [day, month, year] = value.split("/").map(Number);
  const parsedDate = new Date(year, (month ?? 1) - 1, day ?? 1);

  if (
    !day ||
    !month ||
    !year ||
    Number.isNaN(parsedDate.getTime())
  ) {
    return null;
  }

  parsedDate.setHours(12, 0, 0, 0);
  return parsedDate.toISOString();
}

export function useCampaignEditController(campaign?: CampaignData) {
  const [ui, dispatch] = useReducer(uiReducer, initialUiState);
  const account = useAccountParam() ?? "";
  const queryClient = useQueryClient();

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

  const saveCampaignEdits = useCallback(async () => {
    if (!campaign?.id) {
      toast.error("Campanha nao encontrada para edicao.");
      return { success: false };
    }

    const values = form.getValues();
    const startDate = toCampaignDateIso(values.dispatchDate);
    const endDate = toCampaignDateIso(
      values.isRecurring ? values.endDate : values.dispatchDate,
    );

    if (!startDate || !endDate) {
      toast.error("Preencha datas validas para salvar a campanha.");
      return { success: false };
    }

    const payload: CampaignUpdate = {
      startDate,
      endDate,
      dispatchTime: values.dispatchTime,
      recurring: values.isRecurring,
      timezone:
        campaign.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    };

    try {
      const response = await CampaignService.update(campaign.id, payload);
      const updatedCampaign = (response.data ?? payload) as Partial<CampaignData>;

      queryClient.setQueryData<CampaignData[]>(
        queryKeys.campaigns.all(account),
        (previous) =>
          (previous ?? []).map((item) =>
            item.id === campaign.id ? { ...item, ...updatedCampaign } : item,
          ),
      );

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.campaigns.metricsBase(account),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.campaigns.collectionsMetrics(account),
          exact: true,
        }),
      ]);

      toast.success("Campanha atualizada com sucesso!");
      dispatch({ type: "CLOSE_MODAL" });
      return { success: true };
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Erro ao atualizar campanha."));
      return { success: false };
    }
  }, [account, campaign?.id, campaign?.timezone, form, queryClient]);

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
    returnToEdit: () => dispatch({ type: "OPEN_MODAL", modal: "EDIT" }),
    saveCampaignEdits,
    closeModal: () => dispatch({ type: "CLOSE_MODAL" }),
    toggleActionsMenu: () => dispatch({ type: "TOGGLE_ACTIONS_MENU" }),
    setTooltip: (open: boolean) => dispatch({ type: "SET_TOOLTIP", open }),
  };
}

