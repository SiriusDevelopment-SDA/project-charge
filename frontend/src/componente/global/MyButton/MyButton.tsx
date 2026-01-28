import { type ButtonHTMLAttributes } from "react";
 import styles from "./StyleMyButton.module.css";

type MyButtonProps = {
  text: string;
  variant?: "primary" | "secondary";
} & ButtonHTMLAttributes<HTMLButtonElement>;

export function MyButton({
  text,
  variant = "primary",
  className,
  ...rest
}: MyButtonProps) {
  return (
    <button {...rest} className={`button button--${variant} ${className}`}>
      {text}
    </button>
  );
}
