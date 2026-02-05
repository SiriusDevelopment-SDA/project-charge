import { Users } from "lucide-react"

export const Metricas = ({ chave, valor, classname }: { chave: string, valor: string, classname: string }) => {
  return (
    <div style={{ display: "flex", position: "relative" }}>
      <div className="imagLog" style={{ position: "absolute", top: "-40px", padding: "12px", background: "#eab308", borderRadius: "10px", boxShadow: "rgba(0, 0, 0, 0.35) 0px 5px 15px", display: "flex" }}>
        <Users size={22} />
      </div>
      <div className={classname}>
        <h3>{chave}</h3> <h1>{valor}</h1>
      </div>
    </div>
  )
}