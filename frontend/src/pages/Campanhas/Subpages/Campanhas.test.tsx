import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import Campanhas from "./Campanhas";

const mocks = vi.hoisted(() => ({
  useCampaign: vi.fn(),
}));

vi.mock("../../../hooks/useCampaign", () => ({
  useCampaign: mocks.useCampaign,
}));

describe("Tela Campanhas", () => {
  beforeEach(() => {
    mocks.useCampaign.mockReturnValue({
      searchName: "",
      setSearchName: vi.fn(),
      navigate: vi.fn(),
      page: 1,
      setPage: vi.fn(),
      categoryFilter: null,
      setCategoryFilter: vi.fn(),
      openDeleteModal: false,
      setOpenDeleteModal: vi.fn(),
      loadingDelete: false,
      openCategoryDropdown: false,
      setOpenCategoryDropdown: vi.fn(),
      campaignToDelete: null,
      setCampaignToDelete: vi.fn(),
      loading: false,
      dropdownRef: { current: null },
      filterIconRef: { current: null },
      categories: [],
      totalPages: 1,
      paginated: [],
      handleDelete: vi.fn(),
    });
  });

  it("renderiza titulo e mensagem de lista vazia", () => {
    render(
      <MemoryRouter>
        <Campanhas />
      </MemoryRouter>
    );

    expect(screen.getByText("Campanhas")).toBeInTheDocument();
    expect(screen.getByText("Nenhuma campanha encontrada.")).toBeInTheDocument();
  });
});
