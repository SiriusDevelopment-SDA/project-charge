import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import { CriarCampanha } from "./CriarCampanha";

const mocks = vi.hoisted(() => ({
  useCampaign: vi.fn(),
  useClient: vi.fn(),
  useDispatchTemplate: vi.fn(),
  useTemplate: vi.fn(),
  useCategories: vi.fn(),
}));

vi.mock("../../hooks", () => ({
  useCampaign: mocks.useCampaign,
  useClient: mocks.useClient,
  useDispatchTemplate: mocks.useDispatchTemplate,
  useTemplate: mocks.useTemplate,
  useCategories: mocks.useCategories,
}));

describe("Tela CriarCampanha", () => {
  beforeEach(() => {
    mocks.useClient.mockReturnValue({
      clients: [],
    });

    mocks.useTemplate.mockReturnValue({
      templates: [],
    });

    mocks.useDispatchTemplate.mockReturnValue({
      selectedTemplate: null,
      setSelectedTemplate: vi.fn(),
    });

    mocks.useCategories.mockReturnValue({
      categories: [],
    });

    mocks.useCampaign.mockReturnValue({
      selectedClientes: [],
      setSelectedClientes: vi.fn(),
      nomeCampanha: "",
      setNomeCampanha: vi.fn(),
      horarioDisparoInicio: "",
      setHorarioDisparoInicio: vi.fn(),
      dateRange: undefined,
      setDateRange: vi.fn(),
      cobrancaRecorrente: false,
      setCobrancaRecorrente: vi.fn(),
      openProsseguirModal: false,
      setOpenProsseguirModal: vi.fn(),
      categoriaSelecionada: null,
      setCategoriaSelecionada: vi.fn(),
      openClientes: false,
      setOpenClientes: vi.fn(),
      openTemplate: false,
      setOpenTemplate: vi.fn(),
      openCategoria: false,
      setOpenCategoria: vi.fn(),
      modoPage: "clientes",
      isSubmitting: false,
      setIsSubmitting: vi.fn(),
    });
  });

  it("renderiza o formulario principal de criacao de campanha", () => {
    render(
      <MemoryRouter>
        <CriarCampanha />
      </MemoryRouter>
    );

    expect(screen.getByText("Criar Campanha")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enviar" })).toBeInTheDocument();
  });
});
