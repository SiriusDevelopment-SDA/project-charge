import { Card, Typography } from "@mui/material";

export function PreviewBox({ children, classname }: { children: React.ReactNode, classname: string }) {
    return (
        <>
            <Typography variant="h6" sx={{
                color: "#ffff",
                marginTop: 3,
                paddingLeft: 2
            }}>Conteúdo do template</Typography>
            <Card sx={{ p: 3, borderRadius: 3 }} className={classname}>
                <Typography variant="body1">{children}</Typography>
            </Card>
        </>);
}