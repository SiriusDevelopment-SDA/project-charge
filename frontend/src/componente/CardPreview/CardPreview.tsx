import { Card, Typography } from "@mui/material";

export function PreviewBox({
  children,
  classname,
}: {
  children: React.ReactNode;
  classname: string;
}) {
  return (
    <section className={classname}>
      <Typography variant="h6">Conteúdo do template</Typography>
      <Card>
        <div>{children}</div>
      </Card>
    </section>
  );
}
