import { useMemo, useState } from "react";
import type { NotificameChannel } from "../../types/authApiTypes";
import { Dropdown } from "../Dropdown/Dropdown";
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

/** Formato que o `Dropdown<T>` generico espera (`T extends { id, name }`). */
type ChannelOption = { id: string; name: string };

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
 * Reaproveita o `Dropdown<T>` generico do projeto (mesmo visual dos demais
 * dropdowns: tema escuro + hover dourado), apenas mapeando `{ id, numero }`
 * para o formato `{ id, name }` esperado. A API publica e mantida intacta:
 * renderiza o `numero` de cada canal como rotulo e o valor emitido e o `id`.
 * Toda a logica de dados continua no `useNotificameChannels`.
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
  const [open, setOpen] = useState(false);
  const isDisabled = disabled || channels.length === 0;

  const options = useMemo<ChannelOption[]>(
    () =>
      channels.map((channel) => ({
        id: channel.id,
        name: getChannelLabel(channel),
      })),
    [channels],
  );

  const selectedOption = useMemo<ChannelOption | null>(
    () => options.find((option) => option.id === value) ?? null,
    [options, value],
  );

  return (
    <div
      className={`${S.wrapper} ${isDisabled ? S.disabled : ""} ${className ?? ""}`}
      aria-disabled={isDisabled || undefined}
    >
      <Dropdown<ChannelOption>
        label={isDisabled ? (placeholder ?? label) : label}
        options={options}
        value={selectedOption}
        onChange={(option) => {
          const next = option as ChannelOption;
          onChange(next.id);
        }}
        open={open && !isDisabled}
        onOpen={() => {
          if (isDisabled) return;
          setOpen(true);
        }}
        onClose={() => setOpen(false)}
        searchable={false}
      />
    </div>
  );
}
