// import styles from "../../styles/Navbar.module.css";
import logo from "../../../assets/icons/coraxy.svg";
import { NavLink } from "react-router-dom";
import styles from "./StyleNavbar.module.css";
import { useLocation } from "react-router-dom";
import { AppStorage } from "../../../services/storage/storage.service";

export function Navbar() {
  const location = useLocation();
  const isEmbed = AppStorage.getAuthMode() === "embed";
  const currentSearchParams = new URLSearchParams(location.search);
  const scope = currentSearchParams.get("scope");
  currentSearchParams.delete("scope");
  const baseQuery = currentSearchParams.toString();
  const search = baseQuery ? `?${baseQuery}` : "";
  const isCampaignHistory = location.pathname.startsWith("/historico") && scope === "campaigns";
  const isManualHistory = location.pathname.startsWith("/historico") && scope !== "campaigns";

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
          Disparo Ativo
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
      </div>
    </div>
  );
}
