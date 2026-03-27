import { ReactNode } from "react";
import { AppStorage } from "../services/storage/storage.service";
import Style from "./BlockedRoute.module.css";

interface BlockedRouteProps {
  children: ReactNode;
}

export function BlockedRoute({ children }: BlockedRouteProps) {
  const isActive = AppStorage.getCompanyActive();

  if (isActive) return <>{children}</>;

  return (
    <div className={Style.wrapper}>
      <div className={Style.blurred} aria-hidden="true">
        {children}
      </div>
      <div className={Style.overlay}>
        <div className={Style.card}>
          <span className={Style.badge}>Em breve</span>
          <h2 className={Style.title}>Em desenvolvimento</h2>
          <p className={Style.description}>Sistema de cobrança</p>
        </div>
      </div>
    </div>
  );
}
