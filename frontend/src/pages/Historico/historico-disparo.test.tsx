import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import { HistoricoDisparoPage } from "./historico-disparo";

const mocks = vi.hoisted(() => ({
  useHistorico: vi.fn(),
}));

vi.mock("../../hooks/useHistorico", () => ({
  useHistorico: mocks.useHistorico,
}));

vi.mock("../../componente/table/tableHistory", () => ({
  default: ({ data }: { data: Array<{ id: string }> }) => (
    <div data-testid="history-table">{data.length}</div>
  ),
}));

describe("Tela HistoricoDisparoPage", () => {
  beforeEach(() => {
    mocks.useHistorico.mockReturnValue({
      historico: [{ id: "h1" }, { id: "h2" }],
    });
  });

  it("renderiza titulo e tabela de historico", () => {
    render(
      <MemoryRouter>
        <HistoricoDisparoPage />
      </MemoryRouter>
    );

    expect(screen.getByText(/Hist/i)).toBeInTheDocument();
    expect(screen.getByTestId("history-table")).toHaveTextContent("2");
  });
});
