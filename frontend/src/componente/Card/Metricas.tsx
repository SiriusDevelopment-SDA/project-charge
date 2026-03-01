import { Users } from "lucide-react";
import type { ReactNode } from "react";

interface MetricasProps {
  chave: string;
  valor: string;
  // allow both className and classname for backwards compatibility
  className?: string;
  classname?: string;
  icon?: ReactNode; 
}

export const Metricas = ({
  chave,
  valor,
  className,
  classname,
  icon,
}: MetricasProps) => {
  const classProp = className ?? classname ?? "";

  return (
    <div style={{ display: "flex", position: "relative" }}>
      <div
        style={{
          position: "absolute",
          top: "-40px",
          padding: "12px",
          background: "#eab308",
          borderRadius: "10px",
          boxShadow: "rgba(0, 0, 0, 0.35) 0px 5px 15px",
          display: "flex",
        }}
      >
        {icon ?? <Users size={22} />} 
      </div>

      <div className={classProp}>
        <h3>{chave}</h3>
        <h1>{valor}</h1>
      </div>
    </div>
  );
};
