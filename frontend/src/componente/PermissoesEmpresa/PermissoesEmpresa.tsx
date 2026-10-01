import { useCallback, useEffect, useState } from "react";
import { CompanyService } from "../../services/company/company.service";
import { AppStorage } from "../../services/storage/storage.service";
import type { PermissoesEmpresaResponse } from "../../types/companyApiTypes";
import Style from "./PermissoesEmpresa.module.css";

/**
 * Permissoes de pagina — da EMPRESA ATIVA na sessao.
 *
 * O mecanismo ja existia no backend (`planos.ts`): o PLANO define a base de
 * paginas e `paginasExtras` libera excecoes avulsas. O que nao existia era
 * qualquer forma de mexer nisso sem um PATCH na mao.
 *
 * POR QUE NAO HA SELETOR DE EMPRESA AQUI: uma versao anterior listava todas as
 * empresas e deixava escolher qual configurar. Isso permitia alterar o produto
 * de uma empresa enquanto se esta autenticado em outra — o que nao bate com o
 * resto do sistema, onde TUDO opera sobre a empresa da sessao. A troca de
 * empresa ja tem um lugar proprio (o seletor do topo, `/auth/switch-company`);
 * duplicar essa escolha aqui criava um segundo caminho, com o risco classico de
 * salvar na empresa errada por ter esquecido qual estava selecionada na lista.
 *
 * O QUE ESTA TELA NAO FAZ: nao ha como BLOQUEAR uma pagina que o plano inclui.
 * `paginasExtras` e aditivo por desenho — soma, nunca subtrai. Numa empresa de
 * plano `cobranca` todas as sete paginas ja vem do plano, entao a lista aparece
 * inteira travada e nao ha o que ajustar. Para isso existiria uma chave de
 * bloqueio no contrato de config, deliberadamente fora desta entrega.
 *
 * A lista de paginas e os rotulos vem do backend (`catalogo`), nao daqui. O
 * docblock de `planos.ts` registra que essa lista ja viveu em tres lugares e
 * divergiu; manter copia no frontend seria repetir o erro.
 */
export function PermissoesEmpresa() {
  const companyId = AppStorage.getCompanyId();
  const companyName = AppStorage.getCompanyName();
  const account = AppStorage.getAccount();

  const [dados, setDados] = useState<PermissoesEmpresaResponse | null>(null);
  const [plano, setPlano] = useState<string>("");
  const [extras, setExtras] = useState<string[]>([]);

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregarPermissoes = useCallback(() => {
    if (!companyId) return;
    setErro(null);
    setAviso(null);
    setDados(null);
    CompanyService.getPermissoesEmpresa(companyId)
      .then((r) => {
        setDados(r);
        // Empresa legada (`plano: null`) abre sem plano escolhido: selecionar um
        // e migracao, e a tela avisa disso antes de deixar salvar.
        setPlano(r.plano ?? "");
        setExtras(r.paginasExtras);
      })
      .catch(() => setErro("Não foi possível carregar as permissões."));
  }, [companyId]);

  useEffect(() => {
    carregarPermissoes();
  }, [carregarPermissoes]);

  const noPlano = (pagina: { planos: string[] }) =>
    Boolean(plano) && pagina.planos.includes(plano);

  /**
   * Empresa legada que ainda nao teve plano escolhido NESTA sessao. Enquanto
   * isso for verdade, plano+extras nao descreve a empresa e a tela mostra o
   * estado real vindo do backend. Assim que um plano e escolhido, o modelo novo
   * passa a valer e a previa mostra o que sera gravado.
   */
  const legadoSemEscolha = Boolean(dados) && dados?.plano === null && !plano;

  const alternarExtra = (id: string) => {
    setExtras((atual) =>
      atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id],
    );
    setAviso(null);
  };

  const trocarPlano = (novo: string) => {
    setPlano(novo);
    // Extra que passou a fazer parte do plano deixa de ser extra: manter os dois
    // gravaria redundancia que ninguem consegue interpretar depois.
    setExtras((atual) =>
      atual.filter((id) => {
        const pagina = dados?.catalogo.paginas.find((p) => p.id === id);
        return pagina ? !pagina.planos.includes(novo) : false;
      }),
    );
    setAviso(null);
  };

  const salvar = async () => {
    if (!companyId || !plano || salvando) return;
    setSalvando(true);
    setErro(null);
    setAviso(null);
    try {
      await CompanyService.salvarPermissoesEmpresa(companyId, {
        plano,
        paginasExtras: extras,
      });
      setAviso("Permissões salvas.");
      carregarPermissoes();
    } catch (e: any) {
      setErro(
        e?.response?.data?.message ?? "Não foi possível salvar as permissões.",
      );
    } finally {
      setSalvando(false);
    }
  };

  if (!companyId) {
    return (
      <p className={Style.estado}>
        Nenhuma empresa ativa na sessão. Selecione uma empresa no topo da tela.
      </p>
    );
  }

  const alterado =
    Boolean(dados) &&
    (plano !== (dados?.plano ?? "") ||
      extras.slice().sort().join(",") !==
        (dados?.paginasExtras ?? []).slice().sort().join(","));

  return (
    <div className={Style.painel}>
      {/* Nomear a empresa e obrigatorio, nao decorativo: sem isso o super_admin
          nao tem como saber em qual esta gravando, e ele transita entre varias. */}
      <div className={Style.alvo}>
        <span className={Style.alvoRotulo}>Empresa ativa</span>
        <strong className={Style.alvoNome}>
          {companyName || "Empresa sem nome"}
        </strong>
        {account && <span className={Style.alvoMeta}>account {account}</span>}
        <p className={Style.alvoDica}>
          Para configurar outra empresa, troque pelo seletor no topo da tela.
        </p>
      </div>

      {erro && <p className={Style.erro}>{erro}</p>}
      {aviso && <p className={Style.aviso}>{aviso}</p>}

      {!dados && !erro && <p className={Style.estado}>Carregando...</p>}

      {dados && (
        <>
          <div className={Style.planoLinha}>
            <div>
              <strong>Plano contratado</strong>
              <p className={Style.dica}>
                Define a base de páginas. Trocar o plano reescreve a lista.
              </p>
            </div>
            <div className={Style.seg} role="group" aria-label="Plano">
              {dados.catalogo.planos.map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={p === plano}
                  onClick={() => trocarPlano(p)}
                >
                  {p === "disparo" ? "Disparo" : "Cobrança"}
                </button>
              ))}
            </div>
          </div>

          {!dados.plano && (
            <p className={Style.legado}>
              Empresa ainda sem plano definido. Hoje as páginas dela seguem as
              flags antigas — escolher um plano aqui é uma migração, e pode
              remover acesso que hoje está liberado.
            </p>
          )}

          <div className={Style.paginas}>
            {dados.catalogo.paginas.map((pagina) => {
              // Empresa LEGADA e ainda sem plano escolhido nesta sessao: o
              // modelo plano+extras nao se aplica, e usa-lo aqui MENTIRIA. Sem
              // plano, `noPlano` e falso para tudo e a tela mostraria as sete
              // paginas como "fora do plano" e desligadas — quando o legado
              // libera tudo que nao tem flag `false`. Enquanto nao ha escolha,
              // mostramos o estado REAL, que so o backend sabe resolver.
              if (legadoSemEscolha) {
                const liberada = dados.permissoes[pagina.id];
                return (
                  <div
                    key={pagina.id}
                    className={`${Style.pagina} ${liberada ? "" : Style.off}`}
                  >
                    <span className={Style.paginaNome}>{pagina.label}</span>
                    <span className={`${Style.origem} ${Style.legadoTag}`}>
                      {liberada ? "liberada" : "bloqueada"}
                    </span>
                    <span
                      className={Style.travada}
                      title="Vem das flags antigas — escolha um plano para poder ajustar"
                    >
                      flag antiga
                    </span>
                  </div>
                );
              }

              const doPlano = noPlano(pagina);
              const extra = extras.includes(pagina.id);
              return (
                <div
                  key={pagina.id}
                  className={`${Style.pagina} ${doPlano || extra ? "" : Style.off}`}
                >
                  <span className={Style.paginaNome}>{pagina.label}</span>
                  <span
                    className={`${Style.origem} ${
                      doPlano ? Style.doPlano : extra ? Style.oExtra : Style.fora
                    }`}
                  >
                    {doPlano ? "do plano" : extra ? "extra" : "fora do plano"}
                  </span>
                  {doPlano ? (
                    <span
                      className={Style.travada}
                      title="Incluída no plano — não há como bloquear"
                    >
                      travada
                    </span>
                  ) : (
                    <button
                      type="button"
                      role="switch"
                      aria-checked={extra}
                      aria-label={`Liberar ${pagina.label} como extra`}
                      className={Style.switch}
                      onClick={() => alternarExtra(pagina.id)}
                    />
                  )}
                </div>
              );
            })}
          </div>

          <div className={Style.rodape}>
            <button
              type="button"
              className={Style.btn}
              disabled={!alterado || salvando}
              onClick={() => {
                setPlano(dados.plano ?? "");
                setExtras(dados.paginasExtras);
                setAviso(null);
              }}
            >
              Descartar
            </button>
            <button
              type="button"
              className={`${Style.btn} ${Style.primario}`}
              disabled={!alterado || !plano || salvando}
              onClick={salvar}
            >
              {salvando ? "Salvando..." : "Salvar permissões"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
