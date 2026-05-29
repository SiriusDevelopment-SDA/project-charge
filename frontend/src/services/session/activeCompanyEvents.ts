/**
 * Evento custom de troca de empresa ativa — camada neutra (sem React).
 *
 * Mora em `services/` (e nao em `context/`) para que tanto a camada de service
 * (`auth.service.applyLoginSession`, `useSwitchCompanyMutation`) quanto o
 * `ActiveCompanyProvider` possam depender deste modulo sem inverter a direcao
 * de dependencia (service -> context) nem criar import circular.
 */

/**
 * Nome do evento custom disparado quando a empresa ativa muda (ex.: depois do
 * login externo/embed ou do switch-company do super_admin). O
 * `ActiveCompanyProvider` escuta este evento e re-le o `AppStorage`.
 */
export const ACTIVE_COMPANY_CHANGED_EVENT = "active-company-changed";

/**
 * Dispara o evento custom escutado pelo `ActiveCompanyProvider`.
 * Usar imediatamente apos gravar a nova empresa no `AppStorage`.
 *
 * Disparar mais de uma vez e inofensivo: o handler apenas re-le o storage.
 */
export function notifyActiveCompanyChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(ACTIVE_COMPANY_CHANGED_EVENT));
}
