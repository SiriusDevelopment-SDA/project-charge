import Typography from "@mui/material/Typography";
import { MyButton } from "../../Index";
import S from "./StylesTitlePage.module.css"

export const TitlePage = ({
  title,
  className,
  setModoPage,
  text
}: {
  title: string;
  className: string;
  setModoPage: React.Dispatch<React.SetStateAction<"clientes" | "leads">>;
  text: string;
}) => {
  return (
    <div className={className}>
      <Typography variant="h5">
        {title}
      </Typography>
      <div className={S.buttons_container_title}>
        <MyButton text={text} onClick={() => setModoPage(prev => prev === "clientes" ? "leads" : "clientes")} />
        <MyButton text="Histórico" />
      </div>
    </div>
  );
};
