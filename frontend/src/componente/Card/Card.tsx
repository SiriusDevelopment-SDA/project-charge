import { Card } from "@mui/material";

export function BaseCard({ children, classname }: { children: React.ReactNode, classname: string }) {
    return (
        <Card sx={{ p: 4, borderRadius: 3, overflow: 'visible' }} className={classname}>
            {children}
        </Card>
    );
}