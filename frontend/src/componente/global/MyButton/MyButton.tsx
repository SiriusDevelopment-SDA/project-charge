import { type ButtonHTMLAttributes } from "react";

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
