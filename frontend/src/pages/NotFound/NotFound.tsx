import { useNavigate } from "react-router-dom";
import { MyButton, PageContainer } from "../../componente/Index";
import Style from "./NotFound.module.css";

export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <PageContainer className={Style.notFoundPage}>
      <section className={Style.card}>
        <span className={Style.eyebrow}>Erro 404</span>
        <h1 className={Style.title}>Página não encontrada</h1>
        <p className={Style.description}>
          O caminho acessado não existe ou não está disponível para esta conta.
        </p>

        <div className={Style.actions}>
          <MyButton
            text="Voltar ao inicio"
            variant="btn-enviar"
            onClick={() => navigate("/")}
          />
          <MyButton
            text="Ir para campanhas"
            variant="secondary"
            onClick={() => navigate("/campanhas")}
          />
        </div>
      </section>
    </PageContainer>
  );
}
