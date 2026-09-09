import type { ReactNode } from "react";
import { AppStorage } from "../services/storage/storage.service";
import Style from "./BlockedRoute.module.css";

interface BlockedRouteProps {
  children: ReactNode;
}

export function BlockedRoute({ children }: BlockedRouteProps) {
  const isActive = AppStorage.getCompanyActive();

  if (isActive) return <>{children}</>;

  // O conteudo fica borrado para todo mundo — inclusive super_admin. O que muda
  // para ele e o CARD: "Em desenvolvimento / Sistema de cobranca" e a mensagem
  // pensada para o cliente final, e nao diz nada a quem administra. No lugar
  // dele, quem administra tem a faixa do `AccountLayout`, que nomeia a empresa,
  // explica o estado e oferece a reativacao — e, com a tela borrada e sem
  // interacao, e o unico ponto clicavel.
  const ehSuperAdmin = AppStorage.getAgentRole() === "super_admin";

  return (
    <div className={Style.wrapper}>
      <div
        className={Style.blurred}
        aria-hidden="true"
        data-testid="conteudo-bloqueado"
      >
        {children}
      </div>
      {!ehSuperAdmin && (
        <div className={Style.overlay}>
          <div className={Style.card}>
            <span className={Style.badge}>Em breve</span>
            <h2 className={Style.title}>Em desenvolvimento</h2>
            <p className={Style.description}>Sistema de cobrança</p>
          </div>
        </div>
      )}
    </div>
  );
}
