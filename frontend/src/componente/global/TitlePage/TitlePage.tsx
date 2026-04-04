import Typography from "@mui/material/Typography";
import { useLocation, useNavigate } from "react-router-dom";
import { MyButton } from "../../Index";
import { createNormalizedSearchParams } from "../../../utils/locationSearch";
import S from "./StylesTitlePage.module.css";

export const TitlePage = ({
  title,
  subtitle,
  className,
  setModoPage,
  text,
  children,
}: {
  title: string;
  subtitle?: string;
  className?: string;
  setModoPage?: React.Dispatch<React.SetStateAction<"clientes" | "leads">>;
  text?: string;
  children?: React.ReactNode;
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const buildHistorySearch = () => {
    const searchParams = createNormalizedSearchParams(location.search);
    searchParams.set("scope", "manual");
    const nextSearch = searchParams.toString();
    return nextSearch ? `?${nextSearch}` : "";
  };

  return (
    <div className={`${className} ${S.container_title}`}>
      <div className={S.heading}>
        <Typography variant="h5" className={S.title}>
          {title}
        </Typography>
        {subtitle && <p className={S.subtitle}>{subtitle}</p>}
      </div>

      <div className={S.buttons_container_title}>
        {setModoPage && text && (
          <MyButton
            text={text}
            onClick={() =>
              setModoPage((prev) => (prev === "clientes" ? "leads" : "clientes"))
            }
          />
        )}

        {setModoPage && (
          <MyButton
            text="Historico"
            onClick={() => navigate(`/historico${buildHistorySearch()}`)}
          />
        )}
        {children}
      </div>
    </div>
  );
};
