import { useState, useMemo, useEffect } from "react";
import { useSectorData, type SubIndustryAggregateResult, type CompanyMetricResult } from "@/hooks/use-sector-data";
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

    const subIndustriesList = useMemo(() => {
        // Check if data exists and has subIndustries
        if (!data || !data.subIndustries || Object.keys(data.subIndustries).length === 0) {
            return [];
        }
        
        let subIndustries = Object.values(data.subIndustries);
        
        // Filter only if there's a search query
        if (filterQuery && filterQuery.trim()) {
            const query = filterQuery.toLowerCase().trim();
            subIndustries = subIndustries.filter(s => 
                s.subIndustry.toLowerCase().includes(query)
            );
        }
        
        // Sort
        subIndustries = [...subIndustries].sort((a, b) => {
            switch (sortBy) {
                case "name":
                    return a.subIndustry.localeCompare(b.subIndustry);
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
        
        return subIndustries;
    }, [data, filterQuery, sortBy]);

    const subIndustryCompanies = useMemo(() => {
        if (!selectedSubIndustry || !data) return [];
        
        const subIndustry = data.subIndustries[selectedSubIndustry];
        if (!subIndustry) return [];
        
        // Find all companies that belong to this sub-industry
        // Company keys are in format: "Company Name (Sub Industry)"
        return Object.entries(data.companies)
            .filter(([name]) => name.includes(`(${selectedSubIndustry})`))
            .map(([name, metrics]) => ({ 
                name: name.split(' (')[0], // Extract company name without sub-industry
                metrics 
            }));
    }, [selectedSubIndustry, data]);

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

                            {/* Sub-Industries Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {subIndustriesList.map((subIndustry) => (
                                    <SectorCard
                                        key={subIndustry.subIndustry}
                                        name={subIndustry.subIndustry}
                                        metrics={subIndustry.aggregatedMetrics}
                                        type="sector"
                                        onClick={() => handleSubIndustryClick(subIndustry.subIndustry)}
                                        userTypeCount={subIndustry.companyCount}
                                        productFitCount={0}
                                    />
                                ))}
                            </div>

                            {subIndustriesList.length === 0 && (
                                <div className="text-center py-12 text-white/60">
                                    {filterQuery && filterQuery.trim() 
                                        ? `No sub-industries found matching "${filterQuery}"`
                                        : !data || !data.subIndustries || Object.keys(data.subIndustries).length === 0
                                            ? "No sub-industries available. Please run the aggregation script first."
                                            : "Loading sub-industries..."
                                    }
                                </div>
                            )}
                        </div>
                    ) : (
                        // Sub-industry detail view (showing YC startups)
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            {/* Sub-Industry Overview */}
                            {data.subIndustries[selectedSubIndustry] && (
                                <SectorCard
                                    name={data.subIndustries[selectedSubIndustry].subIndustry}
                                    metrics={data.subIndustries[selectedSubIndustry].aggregatedMetrics}
                                    type="sector"
                                    compact
                                />
                            )}

                            {/* YC Startups in this Sub-Industry */}
                            <div>
                                <h3 className="text-lg font-semibold text-white mb-4">
                                    YC Companies ({subIndustryCompanies.length})
                                </h3>
                                
                                {/* Companies Grid */}
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {subIndustryCompanies.map(({ name, metrics }) => (
                                        <SectorCard
                                            key={name}
                                            name={name}
                                            metrics={metrics.aggregatedMetrics}
                                            type="user_type"
                                            onClick={() => handleItemClick(name)}
                                            compact
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

