"use client";

import { toast, Bounce } from "react-toastify";
import type {
  // ReactNode,
  ButtonHTMLAttributes,
} from "react";

import "../styles/MyButtonGlobal.css";

interface MyButtonAlertProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  // children: ReactNode;
  variant?: "success" | "danger" | "secondary" | "outline";
  text: string
}


export default function MyButtonAlert({
  variant = "success",
  text,
  ...rest
}: MyButtonAlertProps) {
  const handleClick = () => {
    if (variant === "danger") {
      toast.error("Ação cancelada", {
        theme: "dark",
        transition: Bounce,
        className: "toast-danger",
      });
      return;
    }

    toast.success("Enviado com sucesso", {
      theme: "dark",
      transition: Bounce,
      className: "toast-success",
    });
  }

  return (
    <button
      {...rest}
      onClick={handleClick}
      className={`button ${variant}`}
    >
    {text && text}
    </button>
  );
}
