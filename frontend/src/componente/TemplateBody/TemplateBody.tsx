"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Dropdown } from "../Index";
import Style from "../../pages/TemplatesMeta/Styles/Create-template.module.css";

type VarOption = {
  id: string;
  name: string;
};

type Props = {
  containerClassName?: string;
  textareaClassName?: string;
  labelClassName?: string;
  corpo: string;
  setCorpo: React.Dispatch<React.SetStateAction<string>>;
  varsSelected: VarOption[];
  setVarsSelected: React.Dispatch<React.SetStateAction<VarOption[]>>;
  detectedValidCount: number;
  invalidVariables: string[];
  varOptions: VarOption[];
  varOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  setVariablesMap: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  bodyError?: string;
};

type AutocompleteState = {
  query: string;
  replaceStart: number;
  replaceEnd: number;
  suggestions: VarOption[];
};

type AutocompletePosition = {
  top: number;
  left: number;
  width: number;
};

const TEXTAREA_MIRROR_STYLE_PROPS = [
  "boxSizing",
  "width",
  "height",
  "overflowX",
  "overflowY",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderStyle",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "fontStyle",
  "fontVariant",
  "fontWeight",
  "fontStretch",
  "fontSize",
  "fontFamily",
  "lineHeight",
  "letterSpacing",
  "textTransform",
  "textIndent",
  "textDecoration",
  "wordSpacing",
  "tabSize",
  "textAlign",
] as const;

function normalizeVariableName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function getAutocompleteState(
  text: string,
  caretPosition: number,
  options: VarOption[],
): AutocompleteState | null {
  const textBeforeCaret = text.slice(0, caretPosition);
  const openIndex = textBeforeCaret.lastIndexOf("{{");

  if (openIndex === -1) {
    return null;
  }

  const closedIndex = textBeforeCaret.lastIndexOf("}}");

  if (closedIndex > openIndex) {
    return null;
  }

  const query = text.slice(openIndex + 2, caretPosition);

  if (!/^[a-zA-Z0-9_]*$/.test(query)) {
    return null;
  }

  let replaceEnd = caretPosition;

  while (replaceEnd < text.length && /[a-zA-Z0-9_]/.test(text[replaceEnd])) {
    replaceEnd += 1;
  }

  if (text.slice(replaceEnd, replaceEnd + 2) === "}}") {
    replaceEnd += 2;
  }

  const normalizedQuery = normalizeVariableName(query);
  const filteredOptions = options.filter((option) => {
    if (!normalizedQuery) {
      return true;
    }

    return normalizeVariableName(option.id).includes(normalizedQuery);
  });

  const suggestions = [...filteredOptions].sort((left, right) => {
    const leftId = normalizeVariableName(left.id);
    const rightId = normalizeVariableName(right.id);
    const leftStartsWith = normalizedQuery ? leftId.startsWith(normalizedQuery) : true;
    const rightStartsWith = normalizedQuery ? rightId.startsWith(normalizedQuery) : true;

    if (leftStartsWith !== rightStartsWith) {
      return leftStartsWith ? -1 : 1;
    }

    return left.id.localeCompare(right.id, "pt-BR", {
      sensitivity: "base",
    });
  });

  if (suggestions.length === 0) {
    return null;
  }

  return {
    query,
    replaceStart: openIndex,
    replaceEnd,
    suggestions,
  };
}

function getTextareaCaretCoordinates(
  textarea: HTMLTextAreaElement,
  position: number,
) {
  const computed = window.getComputedStyle(textarea);
  const mirror = document.createElement("div");

  mirror.setAttribute("aria-hidden", "true");
  mirror.className = Style.textareaMirror;

  TEXTAREA_MIRROR_STYLE_PROPS.forEach((property) => {
    mirror.style[property] = computed[property];
  });

  mirror.style.width = `${textarea.clientWidth}px`;
  mirror.style.height = `${textarea.clientHeight}px`;
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.overflowWrap = "break-word";

  const textBeforeCaret = textarea.value.slice(0, position);

  mirror.textContent = textBeforeCaret;

  if (textBeforeCaret.endsWith("\n")) {
    mirror.textContent += " ";
  }

  const marker = document.createElement("span");
  marker.textContent = textarea.value.slice(position) || ".";
  mirror.appendChild(marker);
  document.body.appendChild(mirror);

  const lineHeightValue = Number.parseFloat(computed.lineHeight);
  const fontSizeValue = Number.parseFloat(computed.fontSize);
  const lineHeight = Number.isNaN(lineHeightValue)
    ? fontSizeValue * 1.4
    : lineHeightValue;

  const coordinates = {
    top: marker.offsetTop - textarea.scrollTop,
    left: marker.offsetLeft - textarea.scrollLeft,
    lineHeight,
  };

  document.body.removeChild(mirror);

  return coordinates;
}

export function TemplateBody({
  containerClassName,
  textareaClassName,
  labelClassName,
  corpo,
  setCorpo,
  varsSelected,
  setVarsSelected,
  detectedValidCount,
  invalidVariables,
  varOptions,
  varOpen,
  onOpen,
  onClose,
  setVariablesMap,
  bodyError,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const autocompletePanelRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef({ start: 0, end: 0 });
  const [caretPosition, setCaretPosition] = useState(0);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const [autocompletePosition, setAutocompletePosition] = useState<AutocompletePosition>({
    top: 8,
    left: 8,
    width: 280,
  });

  const autocompleteState = useMemo(
    () => getAutocompleteState(corpo, caretPosition, varOptions),
    [corpo, caretPosition, varOptions],
  );

  useEffect(() => {
    setActiveSuggestionIndex(0);
  }, [autocompleteState?.query, autocompleteState?.replaceStart]);

  useLayoutEffect(() => {
    if (!autocompleteState) {
      return;
    }

    const textarea = textareaRef.current;
    const panel = autocompletePanelRef.current;

    if (!textarea || !panel) {
      return;
    }

    const repositionPanel = () => {
      const caretCoordinates = getTextareaCaretCoordinates(textarea, caretPosition);
      const panelWidth = Math.min(320, Math.max(0, textarea.clientWidth - 16));
      const panelHeight = panel.offsetHeight;
      const horizontalPadding = 8;
      const verticalOffset = 10;
      const maxLeft = Math.max(
        horizontalPadding,
        textarea.clientWidth - panelWidth - horizontalPadding,
      );
      const maxTop = Math.max(
        horizontalPadding,
        textarea.clientHeight - panelHeight - horizontalPadding,
      );
      const left = Math.min(
        Math.max(caretCoordinates.left, horizontalPadding),
        maxLeft,
      );
      const preferredTop = caretCoordinates.top - panelHeight - verticalOffset;
      const fallbackTop = caretCoordinates.top + caretCoordinates.lineHeight + verticalOffset;
      const top =
        preferredTop >= horizontalPadding
          ? preferredTop
          : Math.min(Math.max(fallbackTop, horizontalPadding), maxTop);

      setAutocompletePosition({
        top,
        left,
        width: panelWidth,
      });
    };

    repositionPanel();

    window.addEventListener("resize", repositionPanel);
    textarea.addEventListener("scroll", repositionPanel);

    return () => {
      window.removeEventListener("resize", repositionPanel);
      textarea.removeEventListener("scroll", repositionPanel);
    };
  }, [autocompleteState, caretPosition, corpo]);

  function syncSelection() {
    const textarea = textareaRef.current;
    if (!textarea) return;

    selectionRef.current = {
      start: textarea.selectionStart ?? 0,
      end: textarea.selectionEnd ?? 0,
    };
    setCaretPosition(textarea.selectionStart ?? 0);
  }

  function updateBodyAtCursor(nextText: string, caretPosition: number) {
    setCorpo(nextText);

    window.requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      textarea.focus();
      textarea.setSelectionRange(caretPosition, caretPosition);
      syncSelection();
    });
  }

  function insertVariable(varName: string) {
    const currentText = corpo;
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? selectionRef.current.start ?? currentText.length;
    const end = textarea?.selectionEnd ?? selectionRef.current.end ?? start;
    const previousChar = currentText[start - 1] ?? "";
    const nextChar = currentText[end] ?? "";
    const leadingSpace = start > 0 && !/\s/.test(previousChar) ? " " : "";
    const trailingSpace =
      nextChar.length > 0 && !/\s|[.,!?;:)\]}]/.test(nextChar) ? " " : "";
    const token = `${leadingSpace}{{${varName}}}${trailingSpace}`;
    const nextText =
      currentText.slice(0, start) + token + currentText.slice(end);

    updateBodyAtCursor(nextText, start + token.length);

    setVariablesMap((prev) => {
      if (prev[varName] !== undefined) return prev;
      return { ...prev, [varName]: "" };
    });
  }

  function applyAutocompleteSuggestion(option: VarOption) {
    if (!autocompleteState) {
      return;
    }

    const token = `{{${option.id}}}`;
    const nextText =
      corpo.slice(0, autocompleteState.replaceStart) +
      token +
      corpo.slice(autocompleteState.replaceEnd);

    updateBodyAtCursor(nextText, autocompleteState.replaceStart + token.length);

    setVariablesMap((prev) => {
      if (prev[option.id] !== undefined) return prev;
      return { ...prev, [option.id]: "" };
    });
  }

  return (
    <div className={containerClassName}>
      <div>
        <label className={labelClassName}>Corpo*</label>

        <div className={Style.textareaField}>
          <textarea
            ref={textareaRef}
            className={textareaClassName}
            value={corpo}
            onChange={(event) => {
              setCorpo(event.target.value);
              selectionRef.current = {
                start: event.target.selectionStart ?? 0,
                end: event.target.selectionEnd ?? 0,
              };
              setCaretPosition(event.target.selectionStart ?? 0);
            }}
            onKeyDown={(event) => {
              if (!autocompleteState) {
                return;
              }

              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveSuggestionIndex((current) =>
                  (current + 1) % autocompleteState.suggestions.length,
                );
                return;
              }

              if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveSuggestionIndex((current) =>
                  current === 0
                    ? autocompleteState.suggestions.length - 1
                    : current - 1,
                );
                return;
              }

              if (event.key === "Enter" || event.key === "Tab") {
                event.preventDefault();
                applyAutocompleteSuggestion(
                  autocompleteState.suggestions[activeSuggestionIndex],
                );
              }
            }}
            onClick={syncSelection}
            onKeyUp={syncSelection}
            onSelect={syncSelection}
            maxLength={1024}
            placeholder="Digite o corpo do template e insira variáveis onde quiser."
          />

          {autocompleteState && (
            <div
              ref={autocompletePanelRef}
              className={Style.autocompleteFloatingPanel}
              style={{
                top: autocompletePosition.top,
                left: autocompletePosition.left,
                width: autocompletePosition.width,
              }}
            >
              <div className={Style.autocompleteFloatingList}>
                {autocompleteState.suggestions.map((option, index) => (
                  <button
                    key={option.id}
                    type="button"
                    className={
                      index === activeSuggestionIndex
                        ? Style.autocompleteFloatingItemActive
                        : Style.autocompleteFloatingItem
                    }
                    onMouseDown={(event) => {
                      event.preventDefault();
                      applyAutocompleteSuggestion(option);
                    }}
                  >
                    {`{{${option.id}}} — ${option.name}`}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {bodyError && <span className={Style.errorText}>{bodyError}</span>}
      </div>

      <div className={Style.variablesBlock}>
        <div className={Style.variablesHeader}>
          <label className={labelClassName}>Variáveis</label>

          <div className={Style.detectedSummary}>
            <span className={Style.detectedSummaryLabel}>Detectadas no corpo</span>
            <span className={Style.detectedSummaryValid}>
              {detectedValidCount} válidas
            </span>
            {invalidVariables.length > 0 && (
              <span className={Style.detectedSummaryInvalid}>
                {invalidVariables.length} inválidas
              </span>
            )}
          </div>
        </div>

        <Dropdown
          label="Variáveis"
          placeholder="Selecione as variáveis"
          showFloatingLabel={false}
          options={varOptions}
          selected={varsSelected}
          multiple
          open={varOpen}
          onOpen={onOpen}
          onClose={onClose}
          onChange={(vals) => {
            const next = vals as VarOption[];

            const removed = varsSelected.filter(
              (old) => !next.some((item) => item.id === old.id),
            );

            if (removed.length > 0) {
              setCorpo((prev) => {
                let text = prev;

                removed.forEach((removedVariable) => {
                  text = text.replace(
                    new RegExp(`\\{\\{${removedVariable.id}\\}\\}`, "g"),
                    "",
                  );
                });

                return text.replace(/\s{2,}/g, " ").trim();
              });

              setVariablesMap((prev) => {
                const copy = { ...prev };
                removed.forEach((removedVariable) => delete copy[removedVariable.id]);
                return copy;
              });
            } else {
              const last = next[next.length - 1];

              if (last?.id) {
                insertVariable(last.id);
              }
            }

            setVarsSelected(next);
          }}
        />

        <span className={Style.variablesHelper}>
          As variáveis do corpo entram automaticamente, mas você pode selecionar
          outras para botões e amostras.
        </span>

        {invalidVariables.length > 0 && (
          <div className={Style.invalidVariablesBox}>
            <div className={Style.invalidVariablesTitle}>
              Variáveis inválidas encontradas no corpo
            </div>
            <div className={Style.detectedVariables}>
              {invalidVariables.map((variable) => (
                <span
                  key={variable}
                  className={Style.detectedVariableInvalid}
                >
                  {variable.startsWith("{{") ? variable : `{{${variable}}}`}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
