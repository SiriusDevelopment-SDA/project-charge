import type { ReactNode } from "react";
import { AppStorage } from "../services/storage/storage.service";
import type { PagePermissions } from "../services/auth/auth.service";
import Style from "./BlockedRoute.module.css";

interface PermissionRouteProps {
  children: ReactNode;
  page: keyof PagePermissions;
}

export function PermissionRoute({ children, page }: PermissionRouteProps) {
  const permissions = AppStorage.getPagePermissions();
  const allowed = permissions[page] !== false;

  if (allowed) return <>{children}</>;

  return (
    <div className={Style.wrapper}>
      <div className={Style.blurred} aria-hidden="true">
        {children}
      </div>
      <div className={Style.overlay}>
        <div className={Style.card}>
          <span className={Style.badge}>Acesso restrito</span>
          <h2 className={Style.title}>Pagina exclusiva Coraxy | Vital</h2>
          <p className={Style.description}>
            Para ter acesso entre em contato com um de nossos vendedores para liberacao do produto de cobranca.
          </p>
        </div>
      </div>
    </div>
  );
}
