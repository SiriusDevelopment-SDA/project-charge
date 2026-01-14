import styles from '../../styles/Navbar.module.css'
import logo from '../../assets/icons/coraxy fundo preto 4.svg'
import { Link } from "react-router-dom";

export default function Navbar() {
  return (
    <header className={styles.navbar}>
      <div className={styles.navbarContainer}>

        {/* Logo */}
        <div className={styles.navbarLogo}>
          <Link to="/" className="outline">

            <img src={logo} alt="Coraxy" />
          </Link>
        </div>

        {/* Menu 
        <nav className={styles.navbarMenu}>
          <a href="#">Home</a>
          <a href="#">Clientes Vencidos</a>
          <a href="#">Campanhas</a>
          <a href="#">Templates</a>
          <a href="#">Disparo Ativo</a>
        </nav>
        */}
      </div>

      {/* Linha inferior */}
      <div className={styles.navbarDivider} />
    </header>
  )
}
