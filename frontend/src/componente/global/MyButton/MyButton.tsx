import { type ButtonHTMLAttributes } from "react";
 import styles from "./StyleMyButton.module.css";

type MyButtonProps = {
  text: string;
  variant?: "primary" | "secondary";
} & ButtonHTMLAttributes<HTMLButtonElement>;

export function MyButton({
  text,
  variant = "primary",
  ...rest
}: MyButtonProps) {
  return (
    <button {...rest} className={`button button--${variant}`}>
      {text}
    </button>
  );
}
