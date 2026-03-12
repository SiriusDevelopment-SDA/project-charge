import { useCallback, useReducer } from "react";
import { toast } from "react-toastify";
import type { CampaignData, CampaignMetrics, Category } from "../../../types";
import { CampaignService } from "../../../services/campaign/campaign.service";
import { isCampaignActive } from "../../../utils/campaign";
import { getErrorMessage } from "../../../utils/error";

type LoadingReq = "" | "FINDALL" | "DELETE";
type LoadingType = "CATEGORIES" | "CAMPAIGN";

export type LoadingState = {
  status: boolean;
  req: LoadingReq;
  type: LoadingType;
};

type State = {
  campaigns: CampaignData[];
  categories: Category[];
  metrics: CampaignMetrics;
  loading: LoadingState;
};

type Action =
  | { type: "SET_CAMPAIGNS"; payload: CampaignData[] }
  | { type: "SET_CATEGORIES"; payload: Category[] }
  | { type: "SET_METRICS"; payload: CampaignMetrics }
  | { type: "SET_LOADING"; payload: LoadingState }
  | { type: "REMOVE_CAMPAIGN"; payload: string }
  | { type: "UPDATE_CAMPAIGN_STATUS"; payload: { id: string; isEnabled: boolean } };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SET_CAMPAIGNS":
      return { ...state, campaigns: action.payload };
    case "SET_CATEGORIES":
      return { ...state, categories: action.payload };
    case "SET_METRICS":
      return { ...state, metrics: action.payload };
    case "SET_LOADING":
      return { ...state, loading: action.payload };
    case "REMOVE_CAMPAIGN":
      return {
        ...state,
        campaigns: state.campaigns.filter((campaign) => campaign.id !== action.payload),
      };
    case "UPDATE_CAMPAIGN_STATUS":
      {
        const updatedCampaigns = state.campaigns.map((campaign) =>
          campaign.id === action.payload.id
            ? { ...campaign, isEnabled: action.payload.isEnabled }
            : campaign
        );

        const activeCampaigns = updatedCampaigns.filter((campaign) =>
          isCampaignActive(campaign)
        ).length;

        return {
          ...state,
          campaigns: updatedCampaigns,
          metrics: {
            ...state.metrics,
            activeCampaigns,
            totalCampaigns: updatedCampaigns.length,
          },
        };
      }
    default:
      return state;
  }
}

const initialState: State = {
  campaigns: [],
  categories: [],
  metrics: {
    totalCampaigns: 0,
    activeCampaigns: 0,
    dispatchesToday: 0,
    totalDispatch: 0,
    totalDispatchSuccess: 0,
    totalDispatch24h: 0,
    totalDispatchSuccess24h: 0,
    deliveryRateTotal: 0,
    deliveryRate24h: 0,
    nextDispatchTime: null,
    nextDispatchLabel: "Sem disparos agendados",
  },
  loading: { status: false, req: "", type: "CAMPAIGN" },
};

export function useCampaignsController() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const getAccount = useCallback(
    () => new URLSearchParams(window.location.search).get("account"),
    []
  );

  const loadInitialData = useCallback(async () => {
    dispatch({
      type: "SET_LOADING",
      payload: { status: true, req: "FINDALL", type: "CAMPAIGN" },
    });
    try {
      const account = getAccount();

      const [campaigns, categories, metrics] = await Promise.all([
        CampaignService.list(account),
        CampaignService.listCategories(),
        CampaignService.metrics(account),
      ]);
      dispatch({ type: "SET_CAMPAIGNS", payload: campaigns });
      dispatch({ type: "SET_CATEGORIES", payload: categories });
      dispatch({ type: "SET_METRICS", payload: metrics });
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Erro ao carregar campanhas e categorias."));
    } finally {
      dispatch({
        type: "SET_LOADING",
        payload: { status: false, req: "", type: "CAMPAIGN" },
      });
    }
  }, [getAccount]);

  const refreshRealtime = useCallback(async () => {
    try {
      const account = getAccount();
      const [campaigns, metrics] = await Promise.all([
        CampaignService.list(account),
        CampaignService.metrics(account),
      ]);

      dispatch({ type: "SET_CAMPAIGNS", payload: campaigns });
      dispatch({ type: "SET_METRICS", payload: metrics });
    } catch {
      // Silent fail for realtime refresh to avoid noisy UX.
    }
  }, [getAccount]);

  const deleteCampaign = useCallback(async (id: string) => {
    dispatch({
      type: "SET_LOADING",
      payload: { status: true, req: "DELETE", type: "CAMPAIGN" },
    });

    try {
      const result = await CampaignService.remove(id);

      if (result?.success) {
        dispatch({ type: "REMOVE_CAMPAIGN", payload: id });
        toast.success("Campanha deletada com sucesso!");
        return { success: true };
      }

      return { success: false };
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Erro ao deletar campanha."));
      return { success: false };
    } finally {
      dispatch({
        type: "SET_LOADING",
        payload: { status: false, req: "", type: "CAMPAIGN" },
      });
    }
  }, []);

  const updateCampaignStatus = useCallback((id: string, isEnabled: boolean) => {
    dispatch({ type: "UPDATE_CAMPAIGN_STATUS", payload: { id, isEnabled } });
  }, []);

  return {
    state,
    dispatch,
    loadInitialData,
    refreshRealtime,
    deleteCampaign,
    updateCampaignStatus,
  };
}
