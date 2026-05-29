import { useId } from "react";
import type { NotificameChannel } from "../../types/authApiTypes";
import S from "./ChannelSelect.module.css";

export type ChannelSelectProps = {
  /** Id do canal selecionado, ou `null` quando nenhum foi escolhido. */
  value: string | null;
  /** Disparado com o `id` do canal escolhido. */
  onChange: (id: string) => void;
  /** Canais disponiveis (so { id, numero }). */
  channels: NotificameChannel[];
  disabled?: boolean;
  placeholder?: string;
  label?: string;
  className?: string;
};

/**
 * Resolve o rotulo de um canal: usa o `numero` quando existir; caso contrario
 * cai para um id encurtado (primeiros 8 caracteres) para nao exibir vazio.
 */
function getChannelLabel(channel: NotificameChannel): string {
  const numero = channel.numero?.trim();
  if (numero) return numero;
  return `Canal ${channel.id.slice(0, 8)}`;
}

/**
 * Dropdown PURO para escolher a caixa de disparo (canal NotificaMe).
 *
 * Renderiza o `numero` de cada canal como rotulo; o valor emitido e o `id`.
 * Reutilizavel no disparo manual (MC4) — toda a logica de dados fica no
 * `useNotificameChannels`, este componente apenas renderiza.
 */
export function ChannelSelect({
  value,
  onChange,
  channels,
  disabled = false,
  placeholder = "Selecione o canal de disparo",
  label = "Canal de disparo",
  className,
}: ChannelSelectProps) {
  const selectId = useId();
  const isDisabled = disabled || channels.length === 0;

  return (
    <div className={`${S.wrapper} ${className ?? ""}`}>
      <label className={S.label} htmlFor={selectId}>
        {label}
      </label>
      <select
        id={selectId}
        className={S.select}
        value={value ?? ""}
        disabled={isDisabled}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {channels.map((channel) => (
          <option key={channel.id} value={channel.id}>
            {getChannelLabel(channel)}
          </option>
        ))}
      </select>
    </div>
  );
}
