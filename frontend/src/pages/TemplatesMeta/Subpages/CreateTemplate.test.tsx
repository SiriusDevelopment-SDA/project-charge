import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import CreateTemplate from "./CreateTemplate";

describe("Tela CreateTemplate", () => {
  it("renderiza campos principais do formulario", () => {
    render(
      <MemoryRouter>
        <CreateTemplate />
      </MemoryRouter>
    );

    expect(screen.getByText("Criar templates")).toBeInTheDocument();
    expect(screen.getByText("Dados do Template")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salvar" })).toBeInTheDocument();
  });
});
