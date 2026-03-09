import { Users } from "lucide-react";
import type { ReactNode } from "react";

interface MetricasProps {
  chave: string;
  valor: string;
  // allow both className and classname for backwards compatibility
  className?: string;
  classname?: string;
  icon?: ReactNode; 
  showIconBadge?: boolean;
}

export const Metricas = ({
  chave,
  valor,
  className,
  classname,
  icon,
  showIconBadge = true,
}: MetricasProps) => {
  const classProp = className ?? classname ?? "";

  return (
    <div style={{ display: "flex", position: "relative" }}>
      {showIconBadge && (
        <div
          style={{
            position: "absolute",
            top: "-40px",
            padding: "12px",
            color: "#eab308",
            border: "1px solid rgba(212, 166, 0, 0.32)",
            background: "linear-gradient(145deg, rgba(28, 23, 9, 0.9) 0%, rgba(14, 12, 5, 0.95) 100%)",
            borderRadius: "10px",
            boxShadow: "rgba(0, 0, 0, 0.35) 0px 5px 15px",
            display: "flex",
          }}
        >
          {icon ?? <Users size={22} />}
        </div>
      )}

      <div className={classProp}>
        <h3>{chave}</h3>
        <h1>{valor}</h1>
      </div>
    </div>
  );
};
