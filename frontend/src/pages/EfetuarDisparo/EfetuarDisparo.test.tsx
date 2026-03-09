import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import EfetuarDisparo from "./EfetuarDisparo";

const mocks = vi.hoisted(() => ({
  useClient: vi.fn(),
  useTemplate: vi.fn(),
  useDispatchTemplate: vi.fn(),
  sendTemplate: vi.fn(),
}));

vi.mock("../../hooks", () => ({
  useClient: mocks.useClient,
  useTemplate: mocks.useTemplate,
}));

vi.mock("../../hooks/useDispatchTemplate", () => ({
  useDispatchTemplate: mocks.useDispatchTemplate,
}));

describe("Tela EfetuarDisparo", () => {
  beforeEach(() => {
    mocks.useClient.mockReturnValue({
      clients: [{ id: "c1", name: "Cliente 1", category: "A" }],
      setQuery: vi.fn(),
      setGroupInvoices: vi.fn(),
      fetchInvoices: vi.fn(),
    });

    mocks.useTemplate.mockReturnValue({
      templates: [
        { id: "t1", name: "Template cobranca", category: "Cobranca", message: "Oi" },
      ],
      setSearchTemplateName: vi.fn(),
      searchTemplateName: "",
      categoryTemplateFilter: null,
      setCategoryTemplateFilter: vi.fn(),
    });

    mocks.useDispatchTemplate.mockReturnValue({
      selectedClientes: [],
      setSelectedClientes: vi.fn(),
      setSelectedTemplate: vi.fn(),
      selectedTemplate: null,
      templateMapVars: [],
      sendTemplate: mocks.sendTemplate,
      isSending: false,
      modoPage: "clientes",
      setModoPage: vi.fn(),
      selectedLeads: [],
      setSelectedLeads: vi.fn(),
    });
  });

  it("renderiza os elementos principais da tela", () => {
    render(
      <MemoryRouter>
        <EfetuarDisparo />
      </MemoryRouter>
    );

    expect(screen.getByText("Disparo clientes ativos")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enviar disparo" })).toBeInTheDocument();
    expect(screen.getByText("Buscar template")).toBeInTheDocument();
  });
});
