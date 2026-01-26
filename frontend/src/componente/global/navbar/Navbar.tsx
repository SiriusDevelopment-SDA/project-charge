// import styles from "../../styles/Navbar.module.css";
import logo from "../../../assets/icons/coraxy fundo preto 4.svg";
import { NavLink } from "react-router-dom";
import styles from "./StyleNavbar.module.css";


export function Navbar() {
  return (
    <div className={styles.navbar}>
      <NavLink to="/" className="outline" style={{ padding: 0 }}>
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
          className={({ isActive }) => (isActive ? styles.active : styles.disabled)}
          onClick={(e) => e.preventDefault()}
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
          className={({ isActive }) => (isActive ? styles.active : styles.disabled)}
          onClick={(e) => e.preventDefault()}
        >
          Templates
        </NavLink>

        <NavLink
            to="/"
          className={({ isActive }) => (isActive || location.pathname.startsWith("/historico") ? styles.active : styles.disabled)}
        >
          Disparo Ativo
        </NavLink>
      </div>
    </div>
  );
}
