// import styles from "../../styles/Navbar.module.css";
import logo from "../../../assets/icons/coraxy.svg";
import { NavLink } from "react-router-dom";
import styles from "./StyleNavbar.module.css";
import { useLocation } from "react-router-dom";


export function Navbar() {
  const location = useLocation();
  const search = location.search;
  return (
    <div className={styles.navbar}>
      <NavLink to={`/${search}`}>
        <img src={logo} alt="Coraxy" />
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
          className={({ isActive }) => (isActive ? styles.active : "")}
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
          to={`/chat${search}`}
          className={({ isActive }) => (isActive ? styles.active : "")}
        >
          Chat
        </NavLink>

        <NavLink
          to={`/${search}`}
          className={() =>
            location.pathname === "/" ||
            location.pathname.startsWith("/historico")
              ? styles.active
              : ''
          }
        >
          Disparo Ativo
        </NavLink>
      </div>
    </div>
  );
}
