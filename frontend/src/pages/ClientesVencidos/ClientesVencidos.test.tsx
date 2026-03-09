import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import { ClientesVencidos } from "./ClientesVencidos";

const mocks = vi.hoisted(() => ({
  useClient: vi.fn(),
  useTemplate: vi.fn(),
  useCampaign: vi.fn(),
  useDispatchTemplate: vi.fn(),
}));

vi.mock("../../hooks", () => ({
  useClient: mocks.useClient,
  useTemplate: mocks.useTemplate,
  useCampaign: mocks.useCampaign,
}));

vi.mock("../../hooks/useDispatchTemplate", () => ({
  useDispatchTemplate: mocks.useDispatchTemplate,
}));

vi.mock("../../componente/ClientesCard/ClientesCard", () => ({
  ClientesCard: ({ cliente }: { cliente: { name: string } }) => <div>{cliente.name}</div>,
}));

vi.mock("../../componente/Slider/RangeSlider", () => ({
  default: ({ value }: { value: number }) => <div data-testid="slider">{value}</div>,
}));

vi.mock("../../componente/ModalCardCampanhas/ModalCardCampanhas", () => ({
  default: () => null,
}));

vi.mock("../../componente/TemplateCard/TemplateCard", () => ({
  TemplateBalloonCard: ({ title }: { title: string }) => <div>{title}</div>,
}));

describe("Tela ClientesVencidos", () => {
  beforeEach(() => {
    mocks.useDispatchTemplate.mockReturnValue({
      selectedClientes: [],
      setSelectedClientes: vi.fn(),
      selectedTemplate: null,
      setSelectedTemplate: vi.fn(),
      modoPage: "clientes",
    });

    mocks.useCampaign.mockReturnValue({
      setSelectedClientes: vi.fn(),
    });

    mocks.useClient.mockReturnValue({
      clients: [],
      services: [],
      setGroupInvoices: vi.fn(),
    });

    mocks.useTemplate.mockReturnValue({
      page: 1,
      setPage: vi.fn(),
      templates: [],
    });
  });

  it("renderiza titulo e estado vazio", () => {
    render(
      <MemoryRouter>
        <ClientesVencidos />
      </MemoryRouter>
    );

    expect(
      screen.getByRole("heading", { level: 5, name: "Clientes Vencidos" })
    ).toBeInTheDocument();
    expect(screen.getByText("Nenhum cliente selecionado")).toBeInTheDocument();
  });
});
