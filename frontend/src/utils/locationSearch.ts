export function createNormalizedSearchParams(search: string): URLSearchParams {
  const currentParams = new URLSearchParams(search);
  const normalizedParams = new URLSearchParams();
  const account = currentParams.get("account");

  if (account) {
    normalizedParams.set("account", account);
  }

  for (const [key, value] of currentParams.entries()) {
    if (key === "account") continue;
    normalizedParams.append(key, value);
  }

  return normalizedParams;
}

export function buildNormalizedSearch(search: string): string {
  const normalizedSearch = createNormalizedSearchParams(search).toString();
  return normalizedSearch ? `?${normalizedSearch}` : "";
}
