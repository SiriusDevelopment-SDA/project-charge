"use client";

import { useEffect, useRef, useState } from "react";
import "../styles/DropdownCategoria.css";

/* ===============================
   HELPERS
================================ */
const capitalize = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);

/* ===============================
   OPTIONS
================================ */
const CATEGORIAS = [
  { value: "", label: "Nenhuma categoria", italic: true },
  { value: "marketing", label: "Marketing" },
  { value: "aviso", label: "Aviso" },
  { value: "cobranca", label: "Cobrança" },
  { value: "outros", label: "Outros" },
];

/* ===============================
   COMPONENT
================================ */
export default function DropdownCategoria() {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);

  const wrapperRef = useRef<HTMLDivElement>(null);

  /* ===============================
     CLOSE ON OUTSIDE CLICK
  =============================== */
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () =>
      document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={wrapperRef} className="custom-dropdown-wrapper">
      {/* LABEL */}
      <label
        className={`custom-dropdown-label ${
          open || value !== "" ? "custom-dropdown-label--shrink" : ""
        }`}
      >
        Categoria
      </label>

      {/* CONTROL */}
      <div
        className="custom-dropdown-control"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span
          className={`custom-dropdown-value ${
            value === "" ? "custom-dropdown-value--placeholder" : ""
          }`}
        >
          {value === "" ? "" : capitalize(value)}
        </span>

        <span className={`arrow ${open ? "open" : ""}`} />
      </div>

      {/* MENU */}
      {open && (
        <div className="custom-dropdown-menu">
          {CATEGORIAS.map((categoria) => (
            <div
              key={categoria.value}
              className={`custom-dropdown-item
                ${
                  value === categoria.value
                    ? "custom-dropdown-item--selected"
                    : ""
                }
                ${
                  categoria.italic
                    ? "custom-dropdown-item--italic"
                    : ""
                }
              `}
              onClick={() => {
                setValue(categoria.value);
                setOpen(false);
              }}
            >
              {categoria.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
