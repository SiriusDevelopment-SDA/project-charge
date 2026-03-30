import { formatDateBR } from "../../utils/date";
import Style from "./CampaignDetails.module.css";

type CategoryRef = { id: string; name: string } | null | undefined;

type Props = {
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  dispatchTime?: string | null;
  recurring?: boolean;
  category?: CategoryRef;
};

export function CampaignDetails({
  startDate,
  endDate,
  dispatchTime,
  recurring,
  category,
}: Props) {
  const dispatchType = recurring ? "Disparo contínuo" : "Disparo único";

  return (
    <div className={Style.details}>
      <div>
        <strong>Início:</strong> {formatDateBR(startDate)}
      </div>
      <div>
        <strong>Fim:</strong> {formatDateBR(endDate)}
      </div>
      <div>
        <strong>Horário:</strong> {dispatchTime ?? "—"}
      </div>
      <div>
        <strong>Tipo:</strong> {dispatchType}
      </div>
      <div>
        <strong>Categoria:</strong> {category?.name ?? "—"}
      </div>
    </div>
  );
}
