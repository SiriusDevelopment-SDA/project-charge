import { render, screen } from "@testing-library/react";
import Dashboard from "./Dashboard";

vi.mock("../../componente/Index", () => ({
  PageContainer: ({ children }: { children: any }) => <div>{children}</div>,
  BaseCard: ({ children }: { children: any }) => <div>{children}</div>,
  Metricas: ({ chave, valor }: { chave: string; valor: string }) => (
    <div>
      {chave}: {valor}
    </div>
  ),
  GraficoCobranca: () => <div data-testid="grafico-cobranca" />,
  GraficoDisparo: () => <div data-testid="grafico-disparo" />,
  GraficoRelatorio: () => <div data-testid="grafico-relatorio" />,
  GraficoCampanhas: () => <div data-testid="grafico-campanhas" />,
}));

describe("Tela Dashboard", () => {
  it("renderiza metricas e graficos", () => {
    render(<Dashboard />);

    expect(screen.getByText(/Total de Clientes/)).toBeInTheDocument();
    expect(screen.getByTestId("grafico-cobranca")).toBeInTheDocument();
    expect(screen.getByTestId("grafico-campanhas")).toBeInTheDocument();
  });
});
