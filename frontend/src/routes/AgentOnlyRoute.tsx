import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { AppStorage } from "../services/storage/storage.service";

interface AgentOnlyRouteProps {
  children: ReactNode;
}

export function AgentOnlyRoute({ children }: AgentOnlyRouteProps) {
  const location = useLocation();

  if (AppStorage.getAuthMode() !== "agent") {
    return <Navigate to={`/${location.search || ""}`} replace />;
  }

  return <>{children}</>;
}
