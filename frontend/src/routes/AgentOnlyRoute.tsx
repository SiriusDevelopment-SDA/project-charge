import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { AppStorage } from "../services/storage/storage.service";
import { buildNormalizedSearch } from "../utils/locationSearch";

interface AgentOnlyRouteProps {
  children: ReactNode;
}

export function AgentOnlyRoute({ children }: AgentOnlyRouteProps) {
  const location = useLocation();
  const normalizedSearch = buildNormalizedSearch(location.search);

  if (AppStorage.getAuthMode() !== "agent") {
    return <Navigate to={`/${normalizedSearch}`} replace />;
  }

  return <>{children}</>;
}
