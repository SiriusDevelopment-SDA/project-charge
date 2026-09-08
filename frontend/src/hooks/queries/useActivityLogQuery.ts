import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ActivityLogService } from "../../services/activity/activityLog.service";
import type { ActivityLogSearchParams } from "../../services/activity/activityLog.service";

export type {
  ActivityCategory,
  ActivityLogRow,
} from "../../services/activity/activityLog.service";

/** Mantido pelo nome antigo: as telas ja importam `ActivityLogQueryParams`. */
export type ActivityLogQueryParams = ActivityLogSearchParams;

export function useActivityLogQuery(params: ActivityLogQueryParams) {
  return useQuery({
    queryKey: ["activity-log", params],
    queryFn: () => ActivityLogService.search(params),
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
  });
}
