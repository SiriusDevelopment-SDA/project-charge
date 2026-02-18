"use client";

import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
};

export function BaseCardCampanhas({ children, className }: Props) {
  return (
    <div className={className}>
      {children}
    </div>
  );
}
  