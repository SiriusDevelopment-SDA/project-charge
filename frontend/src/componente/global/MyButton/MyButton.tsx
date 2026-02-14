import { type ButtonHTMLAttributes } from "react";
 import styles from "./StyleMyButton.module.css";

type MyButtonProps = {
  text: string;
  variant?: "primary" | "secondary" |  "btn-norm" | "btn-card" | "btn-vermais" | "btn-cancelar" | "btn-enviar";
} & ButtonHTMLAttributes<HTMLButtonElement>;

export function MyButton({
  text,
  variant = "primary",
  className = "",
  ...rest
}: MyButtonProps) {
  return (
    <button
      {...rest}
      className={`${styles.button} ${styles[variant]} ${className}`}
    >
      {text}
    </button>
  );
}
