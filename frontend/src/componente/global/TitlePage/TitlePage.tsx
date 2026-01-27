import Typography from "@mui/material/Typography";
import { MyButton } from "../../Index";
import S from "./StylesTitlePage.module.css"
import { useNavigate } from "react-router-dom";

export const TitlePage = ({
  title,
  className,
  setModoPage,
  text
}: {
  title: string;
  className: string;
  setModoPage?: React.Dispatch<React.SetStateAction<"clientes" | "leads">>;
  text?: string;
}) => {
  const navigate = useNavigate();
  return (
    <div className={className}>
      <Typography variant="h5">
        {title}
      </Typography>
      <div className={S.buttons_container_title}>
        {setModoPage && text && <MyButton text={text} onClick={() => setModoPage(prev => prev === "clientes" ? "leads" : "clientes")} />}
        {setModoPage && <MyButton text="Histórico" onClick={() => navigate("/historico")}/>}
      </div>
    </div>
  );
};
