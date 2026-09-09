import { useState } from "react";
import { CompanyService } from "../../services/company/company.service";
import { AppStorage } from "../../services/storage/storage.service";
import Style from "./EmpresaInativaBanner.module.css";

/**
 * Faixa de alerta para o super_admin quando a empresa aberta esta INATIVA.
 *
 * Por que existe: empresa inativa bloqueia as telas (`BlockedRoute`), e ate
 * aqui religa-la exigia um PATCH reenviando credenciais ou um UPDATE no banco.
 * O super_admin abria o embed da empresa, batia no bloqueio e nao tinha o que
 * fazer dentro do produto.
 *
 * ONDE ELA MORA: no `AccountLayout`, logo abaixo do `Navbar` e fora do
 * `content` — NAO dentro do `BlockedRoute`. O `BlockedRoute` envolve apenas
 * algumas rotas (templates, clientes vencidos, dashboard, chat), entao a faixa
 * ali sumiria em todas as outras telas. O estado da empresa vale para o app
 * inteiro, e o aviso precisa acompanhar. Como o conteudo bloqueado fica borrado
 * e sem interacao, a faixa costuma ser o unico ponto clicavel da tela.
 *
 * Ela mesma decide se aparece — o layout so a monta. Isso mantem a regra
 * ("inativa E super_admin") num lugar so, em vez de espalhada por quem renderiza.
 *
 * O botao NAO forca `active = true`: chama `POST /companies/:id/reativar`, que
 * revalida as credenciais salvas no ERP. Se o ERP recusar, a empresa segue
 * inativa e o motivo aparece aqui mesmo — que e a informacao que o super_admin
 * precisa para agir, e que o banco nao daria.
 */
export function EmpresaInativaBanner() {
  const [reativando, setReativando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const empresaInativa = !AppStorage.getCompanyActive();
  const ehSuperAdmin = AppStorage.getAgentRole() === "super_admin";

  const companyId = AppStorage.getCompanyId();
  const companyName = AppStorage.getCompanyName();

  if (!empresaInativa || !ehSuperAdmin) return null;

  const reativar = async () => {
    if (!companyId || reativando) return;

    setReativando(true);
    setErro(null);

    try {
      const resultado = await CompanyService.reativarEmpresa(companyId);

      if (resultado.active) {
        AppStorage.setCompanyActive(true);
        // Recarrega para as rotas bloqueadas voltarem: `BlockedRoute` le o
        // storage na renderizacao, e varias telas ja montadas carregam estado
        // preso ao bloqueio.
        window.location.reload();
        return;
      }

      // Preflight recusou. A empresa continua inativa de proposito — mostrar o
      // motivo aqui evita a caça ao log.
      setErro(resultado.message);
    } catch (e: any) {
      setErro(
        e?.response?.data?.message ??
          "Nao foi possivel reativar a empresa. Tente de novo.",
      );
    } finally {
      setReativando(false);
    }
  };

  return (
    <div className={Style.faixa} role="alert" data-testid="faixa-empresa-inativa">
      <div className={Style.conteudo}>
        <span className={Style.selo}>Inativa</span>
        <div className={Style.texto}>
          <strong>{companyName || "Esta empresa"} esta inativa.</strong>{" "}
          <span className={Style.detalhe}>
            As telas ficam bloqueadas. Reativar revalida as credenciais no ERP.
          </span>
          {erro && <div className={Style.erro}>{erro}</div>}
        </div>
      </div>

      <button
        type="button"
        className={Style.botao}
        onClick={reativar}
        disabled={reativando || !companyId}
      >
        {reativando ? "Revalidando no ERP..." : "Ativar empresa"}
      </button>
    </div>
  );
}
