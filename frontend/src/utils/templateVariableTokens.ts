export type TemplateTextToken =
  | {
      type: "text";
      value: string;
    }
  | {
      type: "variable";
      value: string;
      variableName: string;
      isValid: boolean;
    };

function unique(values: string[]) {
  return Array.from(new Set(values));
}

export function parseTemplateTextTokens(
  text: string,
  allowedVariables: string[],
): TemplateTextToken[] {
  const tokens: TemplateTextToken[] = [];
  const allowedSet = new Set(allowedVariables);
  let cursor = 0;

  while (cursor < text.length) {
    const start = text.indexOf("{{", cursor);

    if (start === -1) {
      if (cursor < text.length) {
        tokens.push({ type: "text", value: text.slice(cursor) });
      }
      break;
    }

    if (start > cursor) {
      tokens.push({ type: "text", value: text.slice(cursor, start) });
    }

    const end = text.indexOf("}}", start + 2);

    if (end === -1) {
      const rawValue = text.slice(start);
      tokens.push({
        type: "variable",
        value: rawValue,
        variableName: rawValue.slice(2).trim(),
        isValid: false,
      });
      break;
    }

    const rawValue = text.slice(start, end + 2);
    const rawName = rawValue.slice(2, -2);
    const variableName = rawName.trim();
    const isWellFormed =
      rawName.length > 0 &&
      rawName === variableName &&
      !rawName.includes("{") &&
      !rawName.includes("}") &&
      /^[a-z0-9_]+$/i.test(rawName);

    tokens.push({
      type: "variable",
      value: rawValue,
      variableName,
      isValid: isWellFormed && allowedSet.has(variableName),
    });

    cursor = end + 2;
  }

  return tokens;
}

export function getValidTemplateVariableNames(
  text: string,
  allowedVariables: string[],
) {
  return unique(
    parseTemplateTextTokens(text, allowedVariables)
      .filter((token): token is Extract<TemplateTextToken, { type: "variable" }> =>
        token.type === "variable" && token.isValid,
      )
      .map((token) => token.variableName),
  );
}

export function getInvalidTemplateVariableLabels(
  text: string,
  allowedVariables: string[],
) {
  return unique(
    parseTemplateTextTokens(text, allowedVariables)
      .filter((token): token is Extract<TemplateTextToken, { type: "variable" }> =>
        token.type === "variable" && !token.isValid,
      )
      .map((token) => {
        const isUnknownName =
          token.value.startsWith("{{") &&
          token.value.endsWith("}}") &&
          token.variableName.length > 0 &&
          !token.value.slice(2, -2).includes("{") &&
          !token.value.slice(2, -2).includes("}");

        return isUnknownName ? token.variableName : token.value;
      }),
  );
}
