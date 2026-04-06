import Box from "@mui/material/Box";
import type { ReactNode } from "react";

export function PageContainer({ children, className }: { children: ReactNode, className?: string }) {
  return (
    <Box
      data-app-scrollable="true"
      height="100%"
      minHeight={0}
      display="flex"
      flexDirection="column"
      overflow="auto"
      className={className}
      padding={"20px"}
      sx={{
        scrollbarGutter: "stable",
        background: "transparent",
      }}
    >
      {children}
    </Box>
  );
}
