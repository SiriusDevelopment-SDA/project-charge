import { Api } from "../api";
import { type ChargesData } from "../../types/dashboardApiTypes";

export interface MonthlyDispatchData {
    month: string;
    value: number;
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

export interface PromisesMonthlyEntry {
    month: string;
    total: number;
    kept: number;
}

export interface PromisesStatsData {
    total: number;
    kept: number;
    broken: number;
    pending: number;
    cancelled: number;
    keptAmount: number;
    keptRate: number;
    monthly: PromisesMonthlyEntry[];
}

export interface AgingBucket {
    label: string;
    count: number;
    totalValue: number;
}

export interface AgingData {
    buckets: AgingBucket[];
}

export interface ForecastWeek {
    label: string;
    amount: number;
    count: number;
}

export interface ForecastData {
    weeks: ForecastWeek[];
    total: number;
}

export interface DebtConversionBracket {
    label: string;
    total: number;
    kept: number;
    keptRate: number;
}

export interface DebtConversionData {
    brackets: DebtConversionBracket[];
}

export class DashboardService{
    static async getCharges(companyId: string): Promise<ChargesData[]> {
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

    static async getPaymentPromisesStats(companyId: string): Promise<PromisesStatsData> {
        const { data } = await Api.post<PromisesStatsData>(`/graphics/promises/${companyId}`);
        return data;
    }

    static async getDelinquencyAging(companyId: string): Promise<AgingData> {
        const { data } = await Api.post<AgingData>(`/graphics/aging/${companyId}`);
        return data;
    }

    static async getPaymentForecast(companyId: string): Promise<ForecastData> {
        const { data } = await Api.post<ForecastData>(`/graphics/forecast/${companyId}`);
        return data;
    }

    static async getDebtConversion(companyId: string): Promise<DebtConversionData> {
        const { data } = await Api.post<DebtConversionData>(`/graphics/debt-conversion/${companyId}`);
        return data;
    }
}