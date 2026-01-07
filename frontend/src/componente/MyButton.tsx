"use client";

import { toast, Bounce } from "react-toastify";
import type { ButtonHTMLAttributes } from "react";

import "../styles/MyButtonGlobal.css";

interface MyButtonAlertProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "success" | "danger" | "secondary" | "outline";
  text: string;
}

export default function MyButtonAlert({
  variant = "success",
  text,
  onClick,
  ...rest
}: MyButtonAlertProps) {
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (variant === "danger") {
      toast.error("Ação cancelada", {
        theme: "dark",
        transition: Bounce,
      });
    }

    if (variant === "success") {
      toast.success("Enviado com sucesso", {
        theme: "dark",
        transition: Bounce,
      });
    }

    // 🔥 deixa o clique externo funcionar
    onClick?.(e);
  };

  return (
    <button
      {...rest}
      type="button"
      onClick={handleClick}
      className={`button ${variant}`}
    >
      {text}
    </button>
  );
}
