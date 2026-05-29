// import styles from "../../styles/Navbar.module.css";
import { useRef, useState } from "react";
import logo from "../../../assets/icons/coraxy.svg";
import { NavLink } from "react-router-dom";
import styles from "./StyleNavbar.module.css";
import { useLocation } from "react-router-dom";
import { AppStorage } from "../../../services/storage/storage.service";
import { createNormalizedSearchParams } from "../../../utils/locationSearch";
import { useActiveCompany } from "../../../context/contextActiveCompany";
import { useCompaniesQuery } from "../../../hooks/queries/useCompaniesQuery";
import { useSwitchCompanyMutation } from "../../../hooks/mutations/useSwitchCompanyMutation";
import SuperAdminCompanyButton from "./SuperAdminCompanyButton";
import DropdownSwitchCompany from "./DropdownSwitchCompany";

export function Navbar() {
  const location = useLocation();
  const isEmbed = AppStorage.getAuthMode() === "embed";
  // `agentRole` so muda em login/logout — momentos em que a Navbar e desmontada,
  // entao leitura sincrona aqui e segura (Fase 1 confirmou).
  const isSuperAdmin = AppStorage.getAgentRole() === "super_admin";
  const currentSearchParams = createNormalizedSearchParams(location.search);
  const scope = currentSearchParams.get("scope");
  currentSearchParams.delete("scope");
  const baseQuery = currentSearchParams.toString();
  const search = baseQuery ? `?${baseQuery}` : "";
  const isCampaignHistory = location.pathname.startsWith("/historico") && scope === "campaigns";
  const isManualHistory = location.pathname.startsWith("/historico") && scope !== "campaigns";

  const { activeCompany } = useActiveCompany();
  const companiesQuery = useCompaniesQuery();
  const switchMutation = useSwitchCompanyMutation();
  const [isSwitchOpen, setIsSwitchOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  const handleSelectCompany = (id: string) => {
    switchMutation.mutate(id, {
      onSuccess: () => setIsSwitchOpen(false),
    });
  };

  return (
    <div className={styles.navbar}>
      <NavLink to={`/${search}`} className={styles.brand}>
        <img src={logo} alt="Coraxy" />
        <span className={styles.brandProduct}>VITAL</span>
      </NavLink>

      <div className={styles.navbarMenu}>
        <NavLink
          to={`/dashboard${search}`}
          className={({ isActive }) => (isActive ? styles.active : "")}
        >
          Dashboard
        </NavLink>

        <NavLink
          to={`/clientesVencidos${search}`}
          className={({ isActive }) => (isActive ? styles.active : "")}
        >
          Clientes Vencidos
        </NavLink>

        <NavLink
          to={`/campanhas${search}`}
          className={() =>
            location.pathname === "/campanhas" ||
            location.pathname.startsWith("/createCampanha") ||
            isCampaignHistory
              ? styles.active
              : ""
          }
        >
          Campanhas
        </NavLink>

        <NavLink
            to={`/templates${search}`}
          className={() =>
            location.pathname === "/templates" ||
            location.pathname.startsWith("/createTemplate")
              ? styles.active
              : ''
          }
        >
          Templates
        </NavLink>

        <NavLink
          to={`/${search}`}
          className={() =>
            location.pathname === "/" ||
            isManualHistory
              ? styles.active
              : ""
          }
        >
          Disparo Manual
        </NavLink>
        {!isEmbed && (
          <NavLink
            to={`/chat${search}`}
            className={({ isActive }) => (isActive ? styles.active : "")}
          >
            Chat
          </NavLink>
        )}
        {!isEmbed && (
          <NavLink
            to={`/perfil${search}`}
            className={({ isActive }) => (isActive ? styles.active : "")}
          >
            Perfil
          </NavLink>
        )}
        {isSuperAdmin && (
          <SuperAdminCompanyButton
            ref={anchorRef}
            companyName={activeCompany?.name ?? null}
            isOpen={isSwitchOpen}
            onClick={() => setIsSwitchOpen((prev) => !prev)}
            disabled={switchMutation.isPending}
          />
        )}
      </div>

      {isSuperAdmin && (
        <DropdownSwitchCompany
          isOpen={isSwitchOpen}
          onClose={() => setIsSwitchOpen(false)}
          anchorRef={anchorRef}
          companies={companiesQuery.data ?? []}
          activeCompanyId={activeCompany?.id ?? null}
          onSelect={handleSelectCompany}
          isLoading={companiesQuery.isLoading}
          isSwitching={switchMutation.isPending}
          switchingCompanyId={switchMutation.variables ?? null}
        />
      )}
    </div>
  );
}
