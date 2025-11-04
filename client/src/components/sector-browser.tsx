import { useState, useMemo, useEffect } from "react";
import { useSectorData, type SectorAggregateResult, type SectorMetricResult } from "@/hooks/use-sector-data";
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
    const [selectedSector, setSelectedSector] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<"user_types" | "product_fits">("user_types");
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

    const handleSectorClick = (sectorName: string) => {
        setSelectedSector(sectorName);
        setActiveTab("user_types");
        setFilterQuery("");
    };

    const handleBack = () => {
        setSelectedSector(null);
        setFilterQuery("");
    };

    const handleItemClick = (text: string) => {
        onSelectItem(text);
        onOpenChange(false);
        // Reset state
        setSelectedSector(null);
        setFilterQuery("");
    };

    const sectorsList = useMemo(() => {
        if (!data?.sectors) return [];
        
        let sectors = Object.values(data.sectors);
        
        // Filter
        if (filterQuery.trim()) {
            const query = filterQuery.toLowerCase();
            sectors = sectors.filter(s => 
                s.sector.toLowerCase().includes(query)
            );
        }
        
        // Sort
        sectors = [...sectors].sort((a, b) => {
            switch (sortBy) {
                case "name":
                    return a.sector.localeCompare(b.sector);
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
        
        return sectors;
    }, [data, filterQuery, sortBy]);

    const sectorUserTypes = useMemo(() => {
        if (!selectedSector || !data) return [];
        
        const sector = data.sectors[selectedSector];
        if (!sector) return [];
        
        // Find the sector in sectorsStructure to get its user_types
        const sectorStructure = data.sectorsStructure?.find(s => s.sector === selectedSector);
        if (!sectorStructure) return [];
        
        const userTypeNames = new Set(sectorStructure.user_types);
        return Object.entries(data.user_types)
            .filter(([name]) => userTypeNames.has(name))
            .map(([name, metrics]) => ({ name, metrics }));
    }, [selectedSector, data]);

    const sectorProductFits = useMemo(() => {
        if (!selectedSector || !data) return [];
        
        const sector = data.sectors[selectedSector];
        if (!sector) return [];
        
        // Find the sector in sectorsStructure to get its product_fits
        const sectorStructure = data.sectorsStructure?.find(s => s.sector === selectedSector);
        if (!sectorStructure) return [];
        
        const productFitNames = new Set(sectorStructure.product_fits);
        return Object.entries(data.product_fits)
            .filter(([name]) => productFitNames.has(name))
            .map(([name, metrics]) => ({ name, metrics }));
    }, [selectedSector, data]);

    if (isLoading) {
        return (
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
                    <DialogHeader>
                        <DialogTitle>Browse Sectors</DialogTitle>
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
                        <DialogTitle>Browse Sectors</DialogTitle>
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

    const currentSector = selectedSector ? data.sectors[selectedSector] : null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col bg-background/95 backdrop-blur-xl">
                <DialogHeader className="border-b border-white/10 pb-4">
                    <div className="flex items-center justify-between">
                        {selectedSector ? (
                            <div className="flex items-center gap-3">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={handleBack}
                                    className="h-8 w-8"
                                >
                                    <ArrowLeft className="h-4 w-4" />
                                </Button>
                                <DialogTitle className="text-xl">{selectedSector}</DialogTitle>
                            </div>
                        ) : (
                            <DialogTitle className="text-xl">Browse Sectors</DialogTitle>
                        )}
                    </div>
                </DialogHeader>

                <div className="flex-1 overflow-hidden flex flex-col">
                    {!selectedSector ? (
                        // Sector list view
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            {/* Search and Sort Controls */}
                            <div className="flex gap-4 items-center">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                                    <Input
                                        placeholder="Search sectors..."
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

                            {/* Sectors Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {sectorsList.map((sector) => (
                                    <SectorCard
                                        key={sector.sector}
                                        name={sector.sector}
                                        metrics={sector.aggregatedMetrics}
                                        type="sector"
                                        onClick={() => handleSectorClick(sector.sector)}
                                        userTypeCount={sector.userTypeCount}
                                        productFitCount={sector.productFitCount}
                                    />
                                ))}
                            </div>

                            {sectorsList.length === 0 && (
                                <div className="text-center py-12 text-white/60">
                                    No sectors found matching "{filterQuery}"
                                </div>
                            )}
                        </div>
                    ) : (
                        // Sector detail view
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            {/* Sector Overview */}
                            {currentSector && (
                                <SectorCard
                                    name={currentSector.sector}
                                    metrics={currentSector.aggregatedMetrics}
                                    type="sector"
                                    compact
                                />
                            )}

                            {/* Tabs */}
                            <div className="flex gap-2 border-b border-white/10">
                                <button
                                    onClick={() => setActiveTab("user_types")}
                                    className={`px-4 py-2 font-medium transition-colors ${
                                        activeTab === "user_types"
                                            ? "text-primary border-b-2 border-primary"
                                            : "text-white/60 hover:text-white/80"
                                    }`}
                                >
                                    User Types ({currentSector?.userTypeCount || 0})
                                </button>
                                <button
                                    onClick={() => setActiveTab("product_fits")}
                                    className={`px-4 py-2 font-medium transition-colors ${
                                        activeTab === "product_fits"
                                            ? "text-primary border-b-2 border-primary"
                                            : "text-white/60 hover:text-white/80"
                                    }`}
                                >
                                    Product Fits ({currentSector?.productFitCount || 0})
                                </button>
                            </div>

                            {/* Content Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {activeTab === "user_types"
                                    ? sectorUserTypes.map(({ name, metrics }) => (
                                          <SectorCard
                                              key={name}
                                              name={name}
                                              metrics={metrics.aggregatedMetrics}
                                              type="user_type"
                                              onClick={() => handleItemClick(name)}
                                              compact
                                          />
                                      ))
                                    : sectorProductFits.map(({ name, metrics }) => (
                                          <SectorCard
                                              key={name}
                                              name={name}
                                              metrics={metrics.aggregatedMetrics}
                                              type="product_fit"
                                              onClick={() => handleItemClick(name)}
                                              compact
                                          />
                                      ))}
                            </div>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

