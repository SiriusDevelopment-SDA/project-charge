import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import TemplatesMeta from "./TemplatesMeta";

const mocks = vi.hoisted(() => ({
  useTemplate: vi.fn(),
  deleteTemplate: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("../../hooks", () => ({
  useTemplate: mocks.useTemplate,
}));

vi.mock("../../context/contextTemplates", async () => {
  const React = await import("react");
  return {
    TemplateContext: React.createContext({
      deleteTemplate: mocks.deleteTemplate,
    }),
  };
});

vi.mock("../../componente/global/Graficos/GraficoTemplates", () => ({
  TemplatesUsageCard: () => <div data-testid="templates-usage-card" />,
}));

vi.mock("../../componente/Card/CardTemplates", () => ({
  CardTemplates: ({ template }: { template: { name: string } }) => <div>{template.name}</div>,
}));

vi.mock("../../componente/global/Pagination/Pagination", () => ({
  Pagination: () => <div data-testid="pagination" />,
}));

vi.mock("../../componente/modal/modalAlertTemplate", () => ({
  default: () => null,
}));

describe("Tela TemplatesMeta", () => {
  beforeEach(() => {
    mocks.useTemplate.mockReturnValue({
      templates: [
        { id: "t1", name: "Template A", category: "Cobranca", message: "msg", isEnabled: true },
        { id: "t2", name: "Template B", category: "Aviso", message: "msg", isEnabled: true },
      ],
    });
  });

  it("renderiza titulo e lista de templates", () => {
    render(
      <MemoryRouter>
        <TemplatesMeta />
      </MemoryRouter>
    );

    expect(screen.getByText("Templates META")).toBeInTheDocument();
    expect(screen.getByText("Template A")).toBeInTheDocument();
    expect(screen.getByText("Template B")).toBeInTheDocument();
  });
});
