import { Card } from "@mui/material";

export function BaseCard({
  children,
  className,
  classname,
}: {
  children: React.ReactNode;
  className?: string;
  classname?: string;
}) {
  // support both props for backwards compatibility
  const classProp = className ?? classname ?? "";

  return (
    <Card
      sx={{ p: 4, borderRadius: 3, overflow: "visible" }}
      className={classProp}
    >
      {children}
    </Card>
  );
}