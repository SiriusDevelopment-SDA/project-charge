export function extractTemplateVars(content: string): string[] {
  const regex = /{{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*}}/g;
  const vars = new Set<string>();
  let match;
  while ((match = regex.exec(content)) !== null) {
    vars.add(match[1]);
  }
  return Array.from(vars);
}
