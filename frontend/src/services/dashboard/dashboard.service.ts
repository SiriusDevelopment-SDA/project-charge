import { Api } from "../api";
import { type ChargesData } from "../../types/dashboardApiTypes";

export interface MonthlyDispatchData {
    month: string;
    value: number;
}

export class DashboardService{
    static async getCharges(companyId: string): Promise<ChargesData[]> {
        console.log(companyId)
        const { data } = await Api.post<{inadimplentes: number; pagamentos: number; months: ChargesData[]}>(`/graphics/charges/${companyId}`);
        return data.months
    }

    static async getMonthlyDispatches(companyId: string): Promise<MonthlyDispatchData[]> {
        const { data } = await Api.post<MonthlyDispatchData[]>(`/graphics/dispatches/${companyId}`);
        return data;
    }

    static async getMonthlyReturnRate(companyId: string): Promise<MonthlyReturnData[]> {
        const { data } = await Api.post<MonthlyReturnData[]>(`/graphics/return-rate/${companyId}`);
        return data;
    }

    static async getCampaignsStats(companyId: string): Promise<CampaignStatData[]> {
        const { data } = await Api.post<CampaignStatData[]>(`/graphics/campaigns/${companyId}`);
        return data;
    }
}

export interface MonthlyReturnData {
    month: string;
    disparo: number;
    retorno: number;
}

export interface CampaignStatData {
    id: string;
    name: string;
    usage: number;
    response: number;
}