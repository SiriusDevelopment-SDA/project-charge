import { useState } from "react";
import { Api } from "../../services/api";
import { AppStorage } from "../../services/storage/storage.service";
import Style from "./TrocarSenhaInicial.module.css";

/**
 * Troca obrigatoria da senha inicial.
 *
 * Quem o embed cadastra do zero nasce com a senha `Vital@2026` e
 * `mustChangePassword = true`. Enquanto isso valer, o `JwtAuthGuard` do backend
 * recusa TODAS as rotas menos `/auth/me` — sem esta tela o agente entraria e
 * levaria 403 em qualquer lugar que clicasse, sem saber por que.
 *
 * NAO PEDE A SENHA ATUAL, e isso e deliberado: o caminho normal dessa pessoa e o
 * embed, onde ela nunca digitou senha nenhuma. Pedir a atual seria exigir um
 * dado que ela nao tem, e exibir a inicial na tela seria pior — ela e a MESMA
 * para todos os agentes criados pelo embed, entao mostra-la ensinaria a entrada
 * dos colegas. O backend aceita a troca sem a senha atual exatamente neste caso
 * (ver `podePularSenhaAtual` em `auth.service.ts`).
 *
 * Fica no `AccountLayout`, no lugar do app inteiro. Nao e um modal que se fecha:
 * enquanto a senha for a inicial, nao ha nada para operar por baixo.
 */
export function TrocarSenhaInicial() {
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const nome = AppStorage.getAgentName();

  const trocar = async (evento: React.FormEvent) => {
    evento.preventDefault();
    setErro(null);

    if (senha.length < 8) {
      setErro("A nova senha precisa ter ao menos 8 caracteres.");
      return;
    }
    if (senha !== confirmacao) {
      setErro("A confirmação não confere com a nova senha.");
      return;
    }

    setSalvando(true);
    try {
      const { data } = await Api.patch<{ accessToken?: string }>("/auth/me", {
        newPassword: senha,
      });

      // TROCAR O TOKEN E O PASSO QUE FALTAVA. O guard do backend le a marca de
      // senha inicial do TOKEN, nao do banco — entao trocar a senha nao basta: o
      // token em maos continua marcado, e a primeira chamada depois da troca
      // volta 403 pedindo para trocar a senha DE NOVO, logo apos a pessoa ter
      // trocado. O backend reemite o token justamente nesta resposta.
      if (data?.accessToken) {
        AppStorage.setAccessToken(data.accessToken);
      }
      AppStorage.setMustChangePassword(false);

      // Recarrega para o app montar do zero com a sessao ja liberada.
      window.location.reload();
    } catch (e: any) {
      setErro(
        e?.response?.data?.message ??
          "Não foi possível trocar a senha. Tente de novo.",
      );
      setSalvando(false);
    }
  };

  return (
    <main className={Style.tela}>
      <form className={Style.cartao} onSubmit={trocar}>
        <span className={Style.selo}>Primeiro acesso</span>
        <h1 className={Style.titulo}>Defina sua senha</h1>
        <p className={Style.texto}>
          {nome ? `${nome}, sua` : "Sua"} conta foi criada automaticamente a
          partir do Chatwoot e ainda está com a senha inicial. Escolha uma senha
          sua para continuar.
        </p>

        <label className={Style.campo}>
          <span>Nova senha</span>
          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            autoComplete="new-password"
            autoFocus
          />
        </label>

        <label className={Style.campo}>
          <span>Confirme a nova senha</span>
          <input
            type="password"
            value={confirmacao}
            onChange={(e) => setConfirmacao(e.target.value)}
            autoComplete="new-password"
          />
        </label>

        {erro && <p className={Style.erro}>{erro}</p>}

        <button type="submit" className={Style.botao} disabled={salvando}>
          {salvando ? "Salvando..." : "Salvar e continuar"}
        </button>
      </form>
    </main>
  );
}
