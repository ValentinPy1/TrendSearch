import { useState, useMemo, useEffect } from "react";
import { useSectorData, type IndustryAggregateResult, type CompanyMetricResult } from "@/hooks/use-sector-data";
import { usePaymentStatus } from "@/hooks/use-payment-status";
import { queryClient } from "@/lib/queryClient";
import { SectorCard } from "./sector-card";
import { GlassmorphicCard } from "./glassmorphic-card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
    ArrowLeft, Loader2, Search, X, Lock,
    Building2, Code, Heart, ShoppingBag, GraduationCap,
    Stethoscope, Car, Plane, Gamepad2, Music,
    Camera, Briefcase, UtensilsCrossed, Wrench,
    Smartphone, Laptop, Zap, Shield, Globe,
    TrendingUp, Users, Factory, Leaf, Dumbbell,
    Palette, BookOpen, Home, CreditCard, LucideIcon,
    BarChart3, Shirt, Wallet, Building, Rocket,
    Syringe, Truck, Scale, Target, MessageSquare,
    Package, Sparkles, HelpCircle, DollarSign
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { PaywallModal } from "./paywall-modal";

type SortOption = "name" | "volume" | "opportunityScore" | "growthYoy" | "cpc" | "startups";

interface SectorBrowserProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSelectItem: (text: string) => void;
}

// Function to get icon for each sector based on industry name
function getSectorIcon(industryName: string): LucideIcon {
    const name = industryName.toLowerCase().trim();

    // Exact matches for main industries
    if (name === 'b2b') return Briefcase;
    if (name === 'consumer') return ShoppingBag;
    if (name === 'education') return GraduationCap;
    if (name === 'fintech') return CreditCard;
    if (name === 'government') return Shield;
    if (name === 'healthcare') return Stethoscope;
    if (name === 'industrials') return Factory;
    if (name === 'real estate and construction') return Home;
    if (name === 'unspecified') return HelpCircle;

    // Exact matches for sub industries
    if (name === 'agriculture') return Leaf;
    if (name === 'analytics') return BarChart3;
    if (name === 'apparel and cosmetics') return Shirt;
    if (name === 'asset management') return TrendingUp;
    if (name === 'automotive') return Car;
    if (name === 'aviation and space') return Rocket;
    if (name === 'banking and exchange') return Wallet;
    if (name === 'climate') return Leaf;
    if (name === 'construction') return Wrench;
    if (name === 'consumer electronics') return Smartphone;
    if (name === 'consumer finance') return CreditCard;
    if (name === 'consumer health and wellness') return Heart;
    if (name === 'content') return Palette;
    if (name === 'credit and lending') return CreditCard;
    if (name === 'diagnostics') return Stethoscope;
    if (name === 'drones') return Rocket;
    if (name === 'drug discovery and delivery') return Syringe;
    if (name === 'energy') return Zap;
    if (name === 'engineering, product and design') return Code;
    if (name === 'finance and accounting') return TrendingUp;
    if (name === 'food and beverage') return UtensilsCrossed;
    if (name === 'gaming') return Gamepad2;
    if (name === 'healthcare it') return Laptop;
    if (name === 'healthcare services') return Stethoscope;
    if (name === 'home and personal') return Home;
    if (name === 'housing and real estate') return Home;
    if (name === 'human resources') return Users;
    if (name === 'industrial bio') return Leaf;
    if (name === 'infrastructure') return Building2;
    if (name === 'insurance') return Shield;
    if (name === 'job and career services') return Briefcase;
    if (name === 'legal') return Scale;
    if (name === 'manufacturing and robotics') return Factory;
    if (name === 'marketing') return Target;
    if (name === 'medical devices') return Stethoscope;
    if (name === 'office management') return Building;
    if (name === 'operations') return Package;
    if (name === 'payments') return CreditCard;
    if (name === 'productivity') return Sparkles;
    if (name === 'recruiting and talent') return Users;
    if (name === 'retail') return ShoppingBag;
    if (name === 'sales') return Target;
    if (name === 'security') return Shield;
    if (name === 'social') return MessageSquare;
    if (name === 'supply chain and logistics') return Truck;
    if (name === 'therapeutics') return Syringe;
    if (name === 'transportation services') return Car;
    if (name === 'travel, leisure and tourism') return Plane;
    if (name === 'virtual and augmented reality') return Smartphone;

    // Keyword-based fallbacks (for variations)
    if (name.includes('software') || name.includes('saas') || name.includes('platform')) return Code;
    if (name.includes('ai') || name.includes('artificial intelligence') || name.includes('machine learning')) return Zap;
    if (name.includes('cyber') || name.includes('security') || name.includes('privacy')) return Shield;
    if (name.includes('mobile') || name.includes('app')) return Smartphone;
    if (name.includes('web') || name.includes('internet') || name.includes('online')) return Globe;
    if (name.includes('cloud') || name.includes('infrastructure')) return Building2;
    if (name.includes('health') || name.includes('medical') || name.includes('healthcare')) return Stethoscope;
    if (name.includes('fitness') || name.includes('wellness') || name.includes('workout')) return Dumbbell;
    if (name.includes('mental health') || name.includes('therapy')) return Heart;
    if (name.includes('education') || name.includes('learning') || name.includes('school') || name.includes('university')) return GraduationCap;
    if (name.includes('course') || name.includes('training')) return BookOpen;
    if (name.includes('ecommerce') || name.includes('retail') || name.includes('shopping') || name.includes('marketplace')) return ShoppingBag;
    if (name.includes('payment') || name.includes('fintech') || name.includes('banking')) return CreditCard;
    if (name.includes('transport') || name.includes('logistics') || name.includes('delivery')) return Car;
    if (name.includes('travel') || name.includes('tourism') || name.includes('hotel')) return Plane;
    if (name.includes('gaming') || name.includes('game')) return Gamepad2;
    if (name.includes('music') || name.includes('audio')) return Music;
    if (name.includes('video') || name.includes('streaming') || name.includes('media')) return Camera;
    if (name.includes('content') || name.includes('publishing')) return Palette;
    if (name.includes('enterprise') || name.includes('b2b') || name.includes('business')) return Briefcase;
    if (name.includes('hr') || name.includes('recruiting') || name.includes('talent')) return Users;
    if (name.includes('real estate') || name.includes('property')) return Home;
    if (name.includes('food') || name.includes('restaurant') || name.includes('dining')) return UtensilsCrossed;
    if (name.includes('manufacturing') || name.includes('industrial') || name.includes('production')) return Factory;
    if (name.includes('construction') || name.includes('tools')) return Wrench;
    if (name.includes('energy') || name.includes('solar') || name.includes('renewable') || name.includes('sustainability')) return Leaf;
    if (name.includes('finance') || name.includes('investment') || name.includes('trading')) return TrendingUp;
    if (name.includes('hardware') || name.includes('device') || name.includes('computer')) return Laptop;
    if (name.includes('analytics') || name.includes('data')) return BarChart3;
    if (name.includes('legal') || name.includes('law')) return Scale;
    if (name.includes('marketing') || name.includes('advertising')) return Target;
    if (name.includes('sales')) return Target;
    if (name.includes('social') || name.includes('community')) return MessageSquare;
    if (name.includes('gaming') || name.includes('game')) return Gamepad2;
    if (name.includes('aviation') || name.includes('space') || name.includes('aerospace')) return Rocket;
    if (name.includes('agriculture') || name.includes('farming')) return Leaf;
    if (name.includes('apparel') || name.includes('fashion') || name.includes('cosmetics')) return Shirt;
    if (name.includes('asset') || name.includes('investment')) return TrendingUp;
    if (name.includes('automotive') || name.includes('vehicle')) return Car;
    if (name.includes('banking') || name.includes('exchange')) return Wallet;
    if (name.includes('climate') || name.includes('environment')) return Leaf;
    if (name.includes('consumer electronics')) return Smartphone;
    if (name.includes('consumer finance')) return CreditCard;
    if (name.includes('consumer health') || name.includes('wellness')) return Heart;
    if (name.includes('credit') || name.includes('lending')) return CreditCard;
    if (name.includes('diagnostics') || name.includes('diagnosis')) return Stethoscope;
    if (name.includes('drone')) return Rocket;
    if (name.includes('drug') || name.includes('pharma') || name.includes('therapeutics')) return Syringe;
    if (name.includes('engineering') || name.includes('product') || name.includes('design')) return Code;
    if (name.includes('accounting')) return TrendingUp;
    if (name.includes('food') || name.includes('beverage')) return UtensilsCrossed;
    if (name.includes('healthcare it') || name.includes('health it')) return Laptop;
    if (name.includes('healthcare services')) return Stethoscope;
    if (name.includes('home') || name.includes('personal')) return Home;
    if (name.includes('housing') || name.includes('real estate')) return Home;
    if (name.includes('human resources') || name.includes('hr')) return Users;
    if (name.includes('industrial bio') || name.includes('bio')) return Leaf;
    if (name.includes('infrastructure')) return Building2;
    if (name.includes('insurance')) return Shield;
    if (name.includes('job') || name.includes('career')) return Briefcase;
    if (name.includes('medical device')) return Stethoscope;
    if (name.includes('office') || name.includes('management')) return Building;
    if (name.includes('operations')) return Package;
    if (name.includes('productivity')) return Sparkles;
    if (name.includes('supply chain') || name.includes('logistics')) return Truck;
    if (name.includes('transportation')) return Car;
    if (name.includes('travel') || name.includes('leisure') || name.includes('tourism')) return Plane;
    if (name.includes('virtual reality') || name.includes('augmented reality') || name.includes('vr') || name.includes('ar')) return Smartphone;

    // Default icon
    return Building2;
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
    const isPaymentRequired = !hasPaid && ((error as any)?.status === 402 || (error as any)?.requiresPayment);

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
                    return b.aggregatedMetrics.avgCpc - a.aggregatedMetrics.avgCpc;
                case "startups":
                    return (b.companyCount || 0) - (a.companyCount || 0);
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
                    return b.aggregatedMetrics.avgCpc - a.aggregatedMetrics.avgCpc;
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
                        <DialogTitle>Explore YC Startups by Sectors</DialogTitle>
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
                <DialogHeader className="border-b border-white/10 pb-4 px-6 relative">
                    <div className="flex items-center justify-between">
                        {selectedSubIndustry ? (
                            (() => {
                                const industry = data?.industries?.[selectedSubIndustry] || data?.subIndustries?.[selectedSubIndustry];
                                const industryName = industry?.industry || ('subIndustry' in (industry || {}) ? (industry as any).subIndustry : null) || selectedSubIndustry;
                                const metrics = industry?.aggregatedMetrics;
                                const SectorIcon = getSectorIcon(selectedSubIndustry);

                                // Format metrics for inline display
                                const formatVolume = (volume: number): string => {
                                    if (volume === 0) return "0 k";
                                    const significantDigits = 3;
                                    const magnitude = Math.floor(Math.log10(Math.abs(volume)));
                                    const factor = Math.pow(10, significantDigits - 1 - magnitude);
                                    const rounded = Math.round(volume * factor) / factor;
                                    return rounded.toLocaleString() + " k";
                                };

                                const avgGrowthYoy = metrics && typeof metrics.avgGrowthYoy === 'number' && !isNaN(metrics.avgGrowthYoy)
                                    ? metrics.avgGrowthYoy
                                    : 0;

                                return (
                                    <>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={handleBack}
                                            className="h-8 w-8 absolute left-0"
                                        >
                                            <ArrowLeft className="h-4 w-4" />
                                        </Button>
                                        <div className="flex items-center gap-6 flex-wrap w-full">
                                            <div className="flex items-center gap-3">
                                                <SectorIcon className="h-6 w-6 text-primary shrink-0" />
                                                <DialogTitle className="text-xl">{industryName}</DialogTitle>
                                            </div>
                                            {metrics && (
                                                <div className="flex items-center gap-6 flex-wrap">
                                                    <div className="flex items-center gap-2">
                                                        <BarChart3 className="h-4 w-4 text-white/50" />
                                                        <span className="text-sm text-white/60">Avg Volume:</span>
                                                        <span className="text-sm font-semibold text-white">{formatVolume(metrics.avgVolume)}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <Zap className="h-4 w-4 text-white/50" />
                                                        <span className="text-sm text-white/60">Avg Opportunity:</span>
                                                        <span className="text-sm font-semibold text-white">{Math.round(metrics.opportunityScore)}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <TrendingUp className="h-4 w-4 text-white/50" />
                                                        <span className="text-sm text-white/60">Avg YoY Growth:</span>
                                                        <span className={`text-sm font-semibold ${avgGrowthYoy >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                            {avgGrowthYoy >= 0 ? "+" : ""}{avgGrowthYoy.toFixed(1)}%
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <DollarSign className="h-4 w-4 text-white/50" />
                                                        <span className="text-sm text-white/60">Avg CPC:</span>
                                                        <span className="text-sm font-semibold text-white">${metrics.avgCpc.toFixed(2)}</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </>
                                );
                            })()
                        ) : (
                            <div className="flex flex-col gap-3 w-full">
                                <DialogTitle className="text-xl">Explore YC Startups by Sectors</DialogTitle>
                                <p className="text-sm text-white/60">
                                    The metrics shown are aggregated from keywords related to startups in each sector, not actual industry performance data.
                                </p>
                                {(() => {
                                    // Calculate overall aggregated metrics from all industries
                                    if (!data || !data.industries || Object.keys(data.industries).length === 0) {
                                        return null;
                                    }

                                    const allIndustries = Object.values(data.industries);
                                    if (allIndustries.length === 0) return null;

                                    // Calculate weighted averages (weighted by company count)
                                    let totalVolume = 0;
                                    let totalOpportunity = 0;
                                    let totalGrowthYoy = 0;
                                    let totalCpc = 0;
                                    let totalWeight = 0;

                                    for (const industry of allIndustries) {
                                        const weight = industry.companyCount || 1;
                                        const metrics = industry.aggregatedMetrics;

                                        if (metrics) {
                                            totalVolume += (metrics.avgVolume || 0) * weight;
                                            totalOpportunity += (metrics.opportunityScore || 0) * weight;
                                            totalGrowthYoy += (metrics.avgGrowthYoy || 0) * weight;
                                            totalCpc += (metrics.avgCpc || 0) * weight;
                                            totalWeight += weight;
                                        }
                                    }

                                    if (totalWeight === 0) return null;

                                    const avgVolume = totalVolume / totalWeight;
                                    const avgOpportunity = totalOpportunity / totalWeight;
                                    const avgGrowthYoy = totalGrowthYoy / totalWeight;
                                    const avgCpc = totalCpc / totalWeight;

                                    // Format volume to 3 significant digits
                                    const formatVolume = (volume: number): string => {
                                        if (volume === 0) return "0 k";
                                        const significantDigits = 3;
                                        const magnitude = Math.floor(Math.log10(Math.abs(volume)));
                                        const factor = Math.pow(10, significantDigits - 1 - magnitude);
                                        const rounded = Math.round(volume * factor) / factor;
                                        return rounded.toLocaleString() + " k";
                                    };

                                    return (
                                        <div className="flex items-center gap-6 flex-wrap">
                                            <div className="flex items-center gap-2">
                                                <BarChart3 className="h-4 w-4 text-white/50" />
                                                <span className="text-sm text-white/60">Avg Volume:</span>
                                                <span className="text-sm font-semibold text-white">{formatVolume(avgVolume)}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Zap className="h-4 w-4 text-white/50" />
                                                <span className="text-sm text-white/60">Avg Opportunity:</span>
                                                <span className="text-sm font-semibold text-white">{Math.round(avgOpportunity)}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <TrendingUp className="h-4 w-4 text-white/50" />
                                                <span className="text-sm text-white/60">Avg YoY Growth:</span>
                                                <span className={`text-sm font-semibold ${avgGrowthYoy >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                    {avgGrowthYoy >= 0 ? "+" : ""}{avgGrowthYoy.toFixed(1)}%
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <DollarSign className="h-4 w-4 text-white/50" />
                                                <span className="text-sm text-white/60">Avg CPC:</span>
                                                <span className="text-sm font-semibold text-white">${avgCpc.toFixed(2)}</span>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                        )}
                    </div>
                </DialogHeader>

                <div className="flex-1 overflow-hidden flex flex-col">
                    {!selectedSubIndustry ? (
                        // Sub-industry list view
                        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
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
                                    <option value="name" className="bg-background">Sort by Name</option>
                                    <option value="startups" className="bg-background">Sort by Number of Startups</option>
                                    <option value="opportunityScore" className="bg-background">Sort by Avg Opportunity Score</option>
                                    <option value="volume" className="bg-background">Sort by Avg Volume</option>
                                    <option value="growthYoy" className="bg-background">Sort by Avg Growth YoY</option>
                                    <option value="cpc" className="bg-background">Sort by Avg CPC</option>
                                </select>
                            </div>

                            {/* Industries Grid (Main + Sub flattened) */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {industriesList.map((industry, index) => (
                                    <SectorCard
                                        key={`${industry.industry}-${industry.industryType || 'sub'}-${index}`}
                                        name={`${industry.industry}${industry.industryType === 'main' ? ' (Main)' : ''}`}
                                        metrics={industry.aggregatedMetrics}
                                        type="sector"
                                        onClick={() => handleSubIndustryClick(industry.industry)}
                                        userTypeCount={industry.companyCount}
                                        productFitCount={0}
                                        icon={getSectorIcon(industry.industry)}
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
                        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
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
                                        <option value="opportunityScore" className="bg-background">Sort by Avg Opportunity Score</option>
                                        <option value="volume" className="bg-background">Sort by Avg Volume</option>
                                        <option value="growthYoy" className="bg-background">Sort by Avg Growth YoY</option>
                                        <option value="cpc" className="bg-background">Sort by Avg CPC</option>
                                        <option value="name" className="bg-background">Sort by Name</option>
                                    </select>
                                </div>

                                {/* Companies Grid */}
                                {industryCompanies.length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {industryCompanies.map((company, index) => (
                                            <SectorCard
                                                key={`${company.name}-${index}${company.url ? `-${company.url}` : ''}`}
                                                name={company.name}
                                                metrics={company.aggregatedMetrics}
                                                description={company.description}
                                                url={company.url}
                                                batch={company.batch}
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

