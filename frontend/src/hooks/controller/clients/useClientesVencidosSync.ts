import { useEffect } from "react";
import type { Cliente } from "../../../types";

type Params = {
  diasRegua: number;
  clientesFiltrados: Cliente[];
  selectedClientes: Cliente[];
  clients: Cliente[];
  selectedPlans: Array<{ id: string; name: string; id_servico?: string }>;
  setSelectedClientes: (value: Cliente[]) => void;
};

export function useClientesVencidosSync({
  diasRegua,
  clientesFiltrados,
  selectedClientes,
  clients,
  selectedPlans,
  setSelectedClientes,
}: Params) {
  useEffect(() => {
    if (diasRegua > 0) {
      setSelectedClientes(clientesFiltrados);
    }
  }, [diasRegua, clientesFiltrados, setSelectedClientes]);

  useEffect(() => {
    if (selectedClientes.length === 0) return;
    const clientesAtualizados = selectedClientes.map((selectedClient) => {
      const clientAtualizado = clients.find((c) => c.id === selectedClient.id);
      return clientAtualizado || selectedClient;
    });
    setSelectedClientes(clientesAtualizados);
  }, [clients, selectedClientes, setSelectedClientes]);

  useEffect(() => {
    if (selectedPlans.length === 0) return;
    const filteredByPlans = clients.filter(
      (client) =>
        client.services &&
        client.services.some((s) =>
          selectedPlans.some(
            (p) => p.id === s.id || p.name === s.name || p.name === s.id_servico
          )
        )
    );

    setSelectedClientes(filteredByPlans);
  }, [clients, selectedPlans, setSelectedClientes]);
}
