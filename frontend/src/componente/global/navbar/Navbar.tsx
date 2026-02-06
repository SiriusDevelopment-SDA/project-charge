// import styles from "../../styles/Navbar.module.css";
import logo from "../../../assets/icons/coraxy.svg";
import { NavLink } from "react-router-dom";
import styles from "./StyleNavbar.module.css";
import { useLocation } from "react-router-dom";


export function Navbar() {
  const location = useLocation();
  return (
    <div className={styles.navbar}>
      <NavLink to="/">
        <img src={logo} alt="Coraxy" />
      </NavLink>


      <div className={styles.navbarMenu}>
        <NavLink
          to="/dashboard"
          className={({ isActive }) => (isActive ? styles.active : styles.disabled)}
          onClick={(e) => e.preventDefault()}
        >
          Dashboard
        </NavLink>

        <NavLink
          to="/clientesVencidos"
          className={({ isActive }) => (isActive ? styles.active : '')}
          // onClick={(e) => e.preventDefault()}
        >
          Clientes Vencidos
        </NavLink>

        <NavLink
          to="/campanhas"
          className={({ isActive }) => (isActive ? styles.active : styles.disabled)}
          onClick={(e) => e.preventDefault()}
        >
          Campanhas
        </NavLink>

        <NavLink
          to="/templates"
          className={({ isActive }) => (isActive ? styles.active : '')}
          // onClick={(e) => e.preventDefault()}
        >
          Templates
        </NavLink>

        <NavLink
          to="/"
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
