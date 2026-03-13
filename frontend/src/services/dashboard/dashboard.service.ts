import { Api } from "../api";
import { type ChargesData } from "../../types/dashboardApiTypes";

export class DashboardService{
    static async getCharges(companyId: string): Promise<ChargesData[]> {
        console.log(companyId)
        const { data } = await Api.post<{inadimplentes: number; pagamentos: number; months: ChargesData[]}>(`/graphics/charges/${companyId}`);
        return data.months
    }
}