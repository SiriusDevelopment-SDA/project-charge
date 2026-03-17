export function normalizeDoc(doc?: string): string {
  return String(doc ?? "").replace(/\D/g, "");
}
