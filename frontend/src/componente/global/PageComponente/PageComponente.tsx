import Box from "@mui/material/Box";
import type { ReactNode } from "react";

export function PageContainer({ children, className }: { children: ReactNode, className?: string }) {
  return (
    <Box
      minHeight="calc(100vh - 14vh)"
      display="flex"
      flexDirection="column"
      overflow="visible"
      className={className}
      padding={"20px"}
    >
      {children}
    </Box>
  );
}
