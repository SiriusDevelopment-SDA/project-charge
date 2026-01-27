import Box from "@mui/material/Box";
import type { ReactNode } from "react";

export function PageContainer({ children, className }: { children: ReactNode, className?: string }) {
  return (
    <Box height="calc(100vh - 14vh)" className={className} padding={"20px"}>
      {children}
    </Box>
  );
}