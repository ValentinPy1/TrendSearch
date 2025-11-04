import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface AggregatedMetrics {
    avgVolume: number;
    avgGrowth3m: number;
    avgGrowthYoy: number;
    avgCompetition: number;
    avgCpc: number;
    avgTopPageBid: number;
    volatility: number;
    trendStrength: number;
    bidEfficiency: number;
    tac: number;
    sac: number;
    opportunityScore: number;
}

export interface SectorMetricResult {
    keywordCount: number;
    aggregatedMetrics: AggregatedMetrics;
    monthlyTrendData: Array<{ month: string; volume: number }>;
    topKeywords: Array<{
        keyword: string;
        similarityScore: number;
        volume: number;
        growth3m: number;
        growthYoy: number;
        opportunityScore?: number;
    }>;
}

export interface CompanyMetricResult {
    keywordCount: number;
    aggregatedMetrics: AggregatedMetrics;
    monthlyTrendData: Array<{ month: string; volume: number }>;
    topKeywords: Array<{
        keyword: string;
        similarityScore: number;
        volume: number;
        growth3m: number;
        growthYoy: number;
        opportunityScore?: number;
    }>;
}

export interface SubIndustryAggregateResult {
    subIndustry: string;
    companyCount: number;
    aggregatedMetrics: AggregatedMetrics;
    monthlyTrendData: Array<{ month: string; volume: number }>;
}

export interface SectorBrowserData {
    companies: Record<string, CompanyMetricResult>;
    subIndustries: Record<string, SubIndustryAggregateResult>;
    metadata: {
        totalCompanies: number;
        totalSubIndustries: number;
        generatedAt: string;
    };
}

export function useSectorData() {
    return useQuery<SectorBrowserData>({
        queryKey: ["/api/sectors/aggregated"],
        queryFn: async () => {
            try {
                const res = await apiRequest("GET", "/api/sectors/aggregated");
                return res.json();
            } catch (error: any) {
                // Check if it's a payment required error
                if (error?.message?.includes("402") || error?.status === 402) {
                    const paymentError = new Error("Payment required");
                    (paymentError as any).status = 402;
                    (paymentError as any).requiresPayment = true;
                    throw paymentError;
                }
                throw error;
            }
        },
        staleTime: 1000 * 60 * 60, // 1 hour - sector data doesn't change often
        retry: false,
    });
}

