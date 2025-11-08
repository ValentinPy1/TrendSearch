import { useState, useMemo, useEffect } from "react";
import { useSectorData, type IndustryAggregateResult, type CompanyMetricResult } from "@/hooks/use-sector-data";
import { usePaymentStatus } from "@/hooks/use-payment-status";
import { queryClient } from "@/lib/queryClient";
import { SectorCard } from "./sector-card";
import { GlassmorphicCard } from "./glassmorphic-card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { ArrowLeft, Loader2, Search, X, Lock } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { PaywallModal } from "./paywall-modal";

type SortOption = "name" | "volume" | "opportunityScore" | "growthYoy" | "cpc";

interface SectorBrowserProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSelectItem: (text: string) => void;
}

export function SectorBrowser({ open, onOpenChange, onSelectItem }: SectorBrowserProps) {
    const { data, isLoading, error } = useSectorData();
    const { data: paymentStatus } = usePaymentStatus();
    const [selectedSubIndustry, setSelectedSubIndustry] = useState<string | null>(null);
    const [filterQuery, setFilterQuery] = useState("");
    const [sortBy, setSortBy] = useState<SortOption>("opportunityScore");
    const [companyFilterQuery, setCompanyFilterQuery] = useState("");
    const [companySortBy, setCompanySortBy] = useState<SortOption>("opportunityScore");
    const [showPaywall, setShowPaywall] = useState(false);

    // Check if payment is required
    const hasPaid = paymentStatus?.hasPaid ?? false;
    const isPaymentRequired = !hasPaid && (error?.status === 402 || (error as any)?.requiresPayment);

    // Refetch payment status when component opens to ensure we have latest status
    useEffect(() => {
        if (open) {
            // Refetch payment status when opening the browser
            queryClient.invalidateQueries({ queryKey: ["/api/payment/status"] });
        }
    }, [open]);

    // Show paywall if payment is required
    useEffect(() => {
        if (isPaymentRequired && open) {
            setShowPaywall(true);
        }
    }, [isPaymentRequired, open]);

    const handleSubIndustryClick = (subIndustryName: string) => {
        setSelectedSubIndustry(subIndustryName);
        setFilterQuery("");
        setCompanyFilterQuery("");
    };

    const handleBack = () => {
        setSelectedSubIndustry(null);
        setFilterQuery("");
    };

    const handleItemClick = (text: string) => {
        onSelectItem(text);
        onOpenChange(false);
        // Reset state
        setSelectedSubIndustry(null);
        setFilterQuery("");
    };

    const industriesList = useMemo(() => {
        // Check if data exists and has industries (flattened: both main and sub)
        if (!data || !data.industries || Object.keys(data.industries).length === 0) {
            // Fallback to subIndustries for backwards compatibility
            if (data?.subIndustries && Object.keys(data.subIndustries).length > 0) {
                return Object.values(data.subIndustries).map(s => ({
                    industry: s.subIndustry,
                    industryType: 'sub' as const,
                    companyCount: s.companyCount,
                    aggregatedMetrics: s.aggregatedMetrics,
                    monthlyTrendData: s.monthlyTrendData,
                }));
            }
            return [];
        }

        let industries = Object.values(data.industries);

        // Filter only if there's a search query
        if (filterQuery && filterQuery.trim()) {
            const query = filterQuery.toLowerCase().trim();
            industries = industries.filter(s =>
                s.industry.toLowerCase().includes(query)
            );
        }

        // Sort
        industries = [...industries].sort((a, b) => {
            switch (sortBy) {
                case "name":
                    return a.industry.localeCompare(b.industry);
                case "volume":
                    return b.aggregatedMetrics.avgVolume - a.aggregatedMetrics.avgVolume;
                case "opportunityScore":
                    return b.aggregatedMetrics.opportunityScore - a.aggregatedMetrics.opportunityScore;
                case "growthYoy":
                    return b.aggregatedMetrics.avgGrowthYoy - a.aggregatedMetrics.avgGrowthYoy;
                case "cpc":
                    return a.aggregatedMetrics.avgCpc - b.aggregatedMetrics.avgCpc;
                default:
                    return 0;
            }
        });

        return industries;
    }, [data, filterQuery, sortBy]);

    const industryCompaniesRaw = useMemo(() => {
        if (!selectedSubIndustry || !data) return [];

        // Check if it's in the new flattened industries structure
        const industry = data.industries?.[selectedSubIndustry];
        if (industry) {
            // Find all companies that belong to this industry
            // For sub-industries: Company keys are in format: "Company Name (Sub Industry)"
            // For main industries: Need to find companies by their sub_industry that belongs to this main industry
            if (industry.industryType === 'sub') {
                return Object.entries(data.companies)
                    .filter(([name]) => name.includes(`(${selectedSubIndustry})`))
                    .map(([name, companyData]) => ({
                        name: name.split(' (')[0], // Extract company name without sub-industry
                        ...companyData
                    }));
            } else {
                // For main industries, we need to find all companies whose sub_industry belongs to this main industry
                // This requires checking the original company data structure
                // For now, we'll use the sub-industry pattern since companies are keyed by sub-industry
                return Object.entries(data.companies)
                    .filter(([name]) => {
                        // Extract sub-industry from company key and check if it belongs to this main industry
                        // This is a simplified approach - in practice, you'd need the full company data
                        return true; // Will filter more precisely if we have access to company main_industry
                    })
                    .map(([name, companyData]) => ({
                        name: name.split(' (')[0],
                        ...companyData
                    }));
            }
        }

        // Fallback to subIndustries for backwards compatibility
        const subIndustry = data.subIndustries?.[selectedSubIndustry];
        if (subIndustry) {
            return Object.entries(data.companies)
                .filter(([name]) => name.includes(`(${selectedSubIndustry})`))
                .map(([name, companyData]) => ({
                    name: name.split(' (')[0],
                    ...companyData
                }));
        }

        return [];
    }, [selectedSubIndustry, data]);

    const industryCompanies = useMemo(() => {
        if (!industryCompaniesRaw || industryCompaniesRaw.length === 0) return [];

        let companies = [...industryCompaniesRaw];

        // Filter companies
        if (companyFilterQuery && companyFilterQuery.trim()) {
            const query = companyFilterQuery.toLowerCase().trim();
            companies = companies.filter(c =>
                c.name.toLowerCase().includes(query) ||
                (c.description && c.description.toLowerCase().includes(query))
            );
        }

        // Sort companies
        companies = companies.sort((a, b) => {
            switch (companySortBy) {
                case "name":
                    return a.name.localeCompare(b.name);
                case "volume":
                    return b.aggregatedMetrics.avgVolume - a.aggregatedMetrics.avgVolume;
                case "opportunityScore":
                    return b.aggregatedMetrics.opportunityScore - a.aggregatedMetrics.opportunityScore;
                case "growthYoy":
                    return b.aggregatedMetrics.avgGrowthYoy - a.aggregatedMetrics.avgGrowthYoy;
                case "cpc":
                    return a.aggregatedMetrics.avgCpc - b.aggregatedMetrics.avgCpc;
                default:
                    return 0;
            }
        });

        return companies;
    }, [industryCompaniesRaw, companyFilterQuery, companySortBy]);

    if (isLoading) {
        return (
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
                    <DialogHeader>
                        <DialogTitle>Browse Sub-Industries</DialogTitle>
                    </DialogHeader>
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                </DialogContent>
            </Dialog>
        );
    }

    // Show paywall if payment is required
    if (isPaymentRequired) {
        return (
            <>
                <Dialog open={open} onOpenChange={onOpenChange}>
                    <DialogContent className="max-w-md">
                        <DialogHeader>
                            <div className="flex items-center justify-center mb-4">
                                <div className="p-3 rounded-full bg-primary/10">
                                    <Lock className="h-8 w-8 text-primary" />
                                </div>
                            </div>
                            <DialogTitle className="text-center text-2xl">
                                Premium Feature
                            </DialogTitle>
                        </DialogHeader>
                        <GlassmorphicCard className="p-8 text-center space-y-4">
                            <p className="text-white/90">
                                Sector browsing is a premium feature. Unlock it with a one-time payment.
                            </p>
                            <Button
                                onClick={() => setShowPaywall(true)}
                                className="w-full"
                                size="lg"
                            >
                                Unlock Premium Features
                            </Button>
                        </GlassmorphicCard>
                    </DialogContent>
                </Dialog>
                <PaywallModal
                    open={showPaywall}
                    onOpenChange={setShowPaywall}
                    feature="sector-browsing"
                />
            </>
        );
    }

    if (error || !data) {
        return (
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
                    <DialogHeader>
                        <DialogTitle>Browse Sub-Industries</DialogTitle>
                    </DialogHeader>
                    <GlassmorphicCard className="p-8 text-center">
                        <p className="text-white/60">
                            {error ? "Failed to load sector data" : "No sector data available"}
                        </p>
                    </GlassmorphicCard>
                </DialogContent>
            </Dialog>
        );
    }


    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col bg-background/95 backdrop-blur-xl">
                <DialogHeader className="border-b border-white/10 pb-4">
                    <div className="flex items-center justify-between">
                        {selectedSubIndustry ? (
                            <div className="flex items-center gap-3">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={handleBack}
                                    className="h-8 w-8"
                                >
                                    <ArrowLeft className="h-4 w-4" />
                                </Button>
                                <DialogTitle className="text-xl">{selectedSubIndustry}</DialogTitle>
                            </div>
                        ) : (
                            <DialogTitle className="text-xl">Browse Sub-Industries</DialogTitle>
                        )}
                    </div>
                </DialogHeader>

                <div className="flex-1 overflow-hidden flex flex-col">
                    {!selectedSubIndustry ? (
                        // Sub-industry list view
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            {/* Search and Sort Controls */}
                            <div className="flex gap-4 items-center">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                                    <Input
                                        placeholder="Search sub-industries..."
                                        value={filterQuery}
                                        onChange={(e) => setFilterQuery(e.target.value)}
                                        className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/40"
                                    />
                                    {filterQuery && (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                                            onClick={() => setFilterQuery("")}
                                        >
                                            <X className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>
                                <select
                                    value={sortBy}
                                    onChange={(e) => setSortBy(e.target.value as SortOption)}
                                    className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary appearance-none cursor-pointer"
                                    style={{
                                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='rgba(255,255,255,0.5)' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
                                        backgroundRepeat: 'no-repeat',
                                        backgroundPosition: 'right 0.75rem center',
                                        paddingRight: '2.5rem',
                                    }}
                                >
                                    <option value="opportunityScore" className="bg-background">Sort by Opportunity Score</option>
                                    <option value="volume" className="bg-background">Sort by Volume</option>
                                    <option value="growthYoy" className="bg-background">Sort by Growth YoY</option>
                                    <option value="cpc" className="bg-background">Sort by Avg CPC</option>
                                    <option value="name" className="bg-background">Sort by Name</option>
                                </select>
                            </div>

                            {/* Industries Grid (Main + Sub flattened) */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {industriesList.map((industry) => (
                                    <SectorCard
                                        key={industry.industry}
                                        name={`${industry.industry}${industry.industryType === 'main' ? ' (Main)' : ''}`}
                                        metrics={industry.aggregatedMetrics}
                                        type="sector"
                                        onClick={() => handleSubIndustryClick(industry.industry)}
                                        userTypeCount={industry.companyCount}
                                        productFitCount={0}
                                    />
                                ))}
                            </div>

                            {industriesList.length === 0 && (
                                <div className="text-center py-12 text-white/60">
                                    {filterQuery && filterQuery.trim()
                                        ? `No industries found matching "${filterQuery}"`
                                        : !data || (!data.industries && !data.subIndustries) || (data.industries && Object.keys(data.industries).length === 0 && (!data.subIndustries || Object.keys(data.subIndustries).length === 0))
                                            ? "No industries available. Please run the aggregation script first."
                                            : "Loading industries..."
                                    }
                                </div>
                            )}
                        </div>
                    ) : (
                        // Sub-industry detail view (showing YC startups)
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            {/* Industry Overview */}
                            {(data.industries?.[selectedSubIndustry] || data.subIndustries?.[selectedSubIndustry]) && (
                                <SectorCard
                                    name={data.industries?.[selectedSubIndustry]?.industry || data.subIndustries?.[selectedSubIndustry]?.subIndustry || selectedSubIndustry}
                                    metrics={(data.industries?.[selectedSubIndustry] || data.subIndustries?.[selectedSubIndustry])?.aggregatedMetrics}
                                    type="sector"
                                    compact
                                />
                            )}

                            {/* YC Startups in this Industry */}
                            <div>
                                <h3 className="text-lg font-semibold text-white mb-4">
                                    YC Companies ({industryCompanies.length})
                                </h3>

                                {/* Search and Sort Controls */}
                                <div className="flex gap-4 items-center mb-4">
                                    <div className="relative flex-1">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                                        <Input
                                            placeholder="Search companies..."
                                            value={companyFilterQuery}
                                            onChange={(e) => setCompanyFilterQuery(e.target.value)}
                                            className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/40"
                                        />
                                        {companyFilterQuery && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                                                onClick={() => setCompanyFilterQuery("")}
                                            >
                                                <X className="h-4 w-4" />
                                            </Button>
                                        )}
                                    </div>
                                    <select
                                        value={companySortBy}
                                        onChange={(e) => setCompanySortBy(e.target.value as SortOption)}
                                        className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary appearance-none cursor-pointer"
                                        style={{
                                            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='rgba(255,255,255,0.5)' d='M6 9L1 4h10z'/%3E%3C/svg%3E")`,
                                            backgroundRepeat: 'no-repeat',
                                            backgroundPosition: 'right 0.75rem center',
                                            paddingRight: '2.5rem',
                                        }}
                                    >
                                        <option value="opportunityScore" className="bg-background">Sort by Opportunity Score</option>
                                        <option value="volume" className="bg-background">Sort by Volume</option>
                                        <option value="growthYoy" className="bg-background">Sort by Growth YoY</option>
                                        <option value="cpc" className="bg-background">Sort by Avg CPC</option>
                                        <option value="name" className="bg-background">Sort by Name</option>
                                    </select>
                                </div>

                                {/* Companies Grid */}
                                {industryCompanies.length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {industryCompanies.map((company) => (
                                            <SectorCard
                                                key={company.name}
                                                name={company.name}
                                                metrics={company.aggregatedMetrics}
                                                description={company.description}
                                                url={company.url}
                                                type="user_type"
                                                onClick={() => handleItemClick(company.description || company.name)}
                                                compact
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-12 text-white/60">
                                        {companyFilterQuery && companyFilterQuery.trim() 
                                            ? `No companies found matching "${companyFilterQuery}"`
                                            : "No companies available"
                                        }
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

