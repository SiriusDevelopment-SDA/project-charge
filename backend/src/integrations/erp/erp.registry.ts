import { ErpDefinition, normalizeErpCode } from './erp.types';
import { IXC_ERP } from '../../invoices/services/ixcInvoicesService';
import { SGP_ERP } from '../../invoices/services/sgpInvoicesService';
import { MK_ERP } from '../../invoices/services/mkInvoicesService';
import { HUBSOFT_ERP } from '../../invoices/services/hubsoftInvoicesService';

/**
 * ERPs que aparecem no banco mas nao tem service — nao ha arquivo de
 * implementacao onde a declaracao pudesse morar, entao ficam aqui. Ao construir
 * o service de um deles, mova a declaracao para la e remova a linha desta lista.
 */
const SEM_INTEGRACAO: ErpDefinition[] = [
  {
    code: 'RADIUSNET',
    label: 'Radius Net',
    syncClients: false,
    syncInvoices: false,
    pix: false,
    dispatch: false,
    preflight: 'none',
    ressalva:
      'Nao ha integracao implementada. A empresa pode ser cadastrada, mas nenhuma rotina automatica vai atende-la.',
    credenciais: [],
  },
];

const DEFINICOES: ErpDefinition[] = [
  IXC_ERP,
  SGP_ERP,
  MK_ERP,
  HUBSOFT_ERP,
  ...SEM_INTEGRACAO,
];

const POR_CODIGO = new Map<string, ErpDefinition>(
  DEFINICOES.map((erp) => [normalizeErpCode(erp.code), erp]),
);

/** Todos os ERPs conhecidos, para a API e para o dropdown do cadastro. */
export function listErps(): ErpDefinition[] {
  return [...DEFINICOES];
}

/**
 * Capacidades do ERP, ou `null` quando o valor nao corresponde a nenhum
 * conhecido. Aceita qualquer grafia — "radiusnet", "RADIUS NET" e "Radius Net"
 * resolvem para a mesma definicao.
 */
export function getErpDefinition(
  erp: string | null | undefined,
): ErpDefinition | null {
  return POR_CODIGO.get(normalizeErpCode(erp)) ?? null;
}

/** Codigos canonicos aceitos — use para montar o enum de validacao do DTO. */
export function erpCodes(): string[] {
  return DEFINICOES.map((erp) => erp.code);
}
