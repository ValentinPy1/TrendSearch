import { useState, useMemo, useEffect, Fragment } from "react";
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
    Package, Sparkles, HelpCircle, DollarSign,
    LayoutGrid, Table2, ArrowUp, ArrowDown, ExternalLink,
    ChevronLeft, ChevronRight, Calendar
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { PaywallModal } from "./paywall-modal";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "./ui/table";

type SortOption = "name" | "volume" | "opportunityScore" | "growthYoy" | "cpc" | "startups" | "batch";

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
    const [viewMode, setViewMode] = useState<"card" | "table">("table");
    const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
    const [companyViewMode, setCompanyViewMode] = useState<"card" | "table">("card");
    const [companySortDirection, setCompanySortDirection] = useState<"asc" | "desc">("desc");
    const [companyCurrentPage, setCompanyCurrentPage] = useState(1);
    const companiesPerPage = 100;
    const [showHelp, setShowHelp] = useState(false);

    // Check if payment is required
    const hasPaid = paymentStatus?.hasPaid ?? false;

    // Refetch payment status when component opens to ensure we have latest status
    useEffect(() => {
        if (open) {
            // Refetch payment status when opening the browser
            queryClient.invalidateQueries({ queryKey: ["/api/payment/status"] });
        }
    }, [open]);

    const handleSubIndustryClick = (subIndustryName: string) => {
        // Check payment status before allowing access to sector details
        if (!hasPaid) {
            setShowPaywall(true);
            return;
        }
        
        setSelectedSubIndustry(subIndustryName);
        setFilterQuery("");
        setCompanyFilterQuery("");
        setCompanyCurrentPage(1); // Reset to first page when changing sector
    };

    // Reset pagination when filter or sort changes
    useEffect(() => {
        setCompanyCurrentPage(1);
    }, [companyFilterQuery, companySortBy, companySortDirection]);

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

    // Convert batch string to numeric value for sorting
    // Format: "Summer 2025", "Winter 2024", "Fall 2024", "Spring 2025"
    const batchToNumeric = (batch: string | undefined): number => {
        if (!batch || batch.trim() === '') return 0;

        const parts = batch.trim().split(' ');
        if (parts.length < 2) return 0;

        const season = parts[0].toLowerCase();
        const year = parseInt(parts[1], 10);

        if (isNaN(year)) return 0;

        // Assign season values: Winter=0, Spring=0.25, Summer=0.5, Fall=0.75
        let seasonValue = 0;
        if (season === 'winter') seasonValue = 0;
        else if (season === 'spring') seasonValue = 0.25;
        else if (season === 'summer') seasonValue = 0.5;
        else if (season === 'fall' || season === 'autumn') seasonValue = 0.75;

        return year + seasonValue;
    };

    // Convert batch string from "Winter 2025" format to "Q1 2025" format
    const formatBatchToQuarter = (batch: string | undefined): string => {
        if (!batch || batch.trim() === '') return '';

        const parts = batch.trim().split(' ');
        if (parts.length < 2) return batch;

        const season = parts[0].toLowerCase();
        const year = parts.slice(1).join(' '); // Handle multi-word years if any

        let quarter = '';
        if (season === 'winter') quarter = 'Q1';
        else if (season === 'spring') quarter = 'Q2';
        else if (season === 'summer') quarter = 'Q3';
        else if (season === 'fall' || season === 'autumn') quarter = 'Q4';
        else return batch; // Return original if season not recognized

        return `${quarter} ${year}`;
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
                    medianBatch: (s as any).medianBatch,
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
            let comparison = 0;
            switch (sortBy) {
                case "name":
                    comparison = a.industry.localeCompare(b.industry);
                    break;
                case "volume":
                    comparison = b.aggregatedMetrics.avgVolume - a.aggregatedMetrics.avgVolume;
                    break;
                case "opportunityScore":
                    comparison = b.aggregatedMetrics.opportunityScore - a.aggregatedMetrics.opportunityScore;
                    break;
                case "growthYoy":
                    comparison = b.aggregatedMetrics.avgGrowthYoy - a.aggregatedMetrics.avgGrowthYoy;
                    break;
                case "cpc":
                    comparison = b.aggregatedMetrics.avgCpc - a.aggregatedMetrics.avgCpc;
                    break;
                case "startups":
                    comparison = (b.companyCount || 0) - (a.companyCount || 0);
                    break;
                case "batch":
                    const batchA = batchToNumeric(a.medianBatch);
                    const batchB = batchToNumeric(b.medianBatch);
                    comparison = batchB - batchA; // Newer batches first (descending by default)
                    break;
                default:
                    return 0;
            }
            return sortDirection === "asc" ? -comparison : comparison;
        });

        return industries;
    }, [data, filterQuery, sortBy, sortDirection]);

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
            let comparison = 0;
            switch (companySortBy) {
                case "name":
                    comparison = a.name.localeCompare(b.name);
                    break;
                case "volume":
                    comparison = b.aggregatedMetrics.avgVolume - a.aggregatedMetrics.avgVolume;
                    break;
                case "opportunityScore":
                    comparison = b.aggregatedMetrics.opportunityScore - a.aggregatedMetrics.opportunityScore;
                    break;
                case "growthYoy":
                    comparison = b.aggregatedMetrics.avgGrowthYoy - a.aggregatedMetrics.avgGrowthYoy;
                    break;
                case "cpc":
                    comparison = b.aggregatedMetrics.avgCpc - a.aggregatedMetrics.avgCpc;
                    break;
                case "batch":
                    const batchA = batchToNumeric(a.batch);
                    const batchB = batchToNumeric(b.batch);
                    comparison = batchB - batchA; // Newer batches first (descending by default)
                    break;
                default:
                    return 0;
            }
            return companySortDirection === "asc" ? -comparison : comparison;
        });

        return companies;
    }, [industryCompaniesRaw, companyFilterQuery, companySortBy, companySortDirection]);

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
        <>
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col bg-background/95 backdrop-blur-xl">
                <DialogHeader className="border-b border-white/10 pb-4 px-6">
                    <div className="flex items-center justify-between">
                        {selectedSubIndustry ? (
                            (() => {
                                const industry = data?.industries?.[selectedSubIndustry] || data?.subIndustries?.[selectedSubIndustry];
                                const industryName = industry?.industry || ('subIndustry' in (industry || {}) ? (industry as any).subIndustry : null) || selectedSubIndustry;
                                const metrics = industry?.aggregatedMetrics;
                                const SectorIcon = getSectorIcon(selectedSubIndustry);

                                // Calculate company count for header
                                let companyCount = 0;
                                if (data && selectedSubIndustry) {
                                    const headerIndustry = data.industries?.[selectedSubIndustry];
                                    if (headerIndustry) {
                                        if (headerIndustry.industryType === 'sub') {
                                            companyCount = Object.entries(data.companies || {})
                                                .filter(([name]) => name.includes(`(${selectedSubIndustry})`))
                                                .length;
                                        } else {
                                            companyCount = Object.entries(data.companies || {})
                                                .filter(([name]) => {
                                                    // For main industries, count all companies
                                                    return true;
                                                })
                                                .length;
                                        }
                                    } else {
                                        const headerSubIndustry = data.subIndustries?.[selectedSubIndustry];
                                        if (headerSubIndustry) {
                                            companyCount = Object.entries(data.companies || {})
                                                .filter(([name]) => name.includes(`(${selectedSubIndustry})`))
                                                .length;
                                        }
                                    }
                                }

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
                                    <div className="flex flex-col gap-3 w-full">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={handleBack}
                                                    className="h-8 w-8"
                                                >
                                                    <ArrowLeft className="h-4 w-4" />
                                                </Button>
                                                <SectorIcon className="h-6 w-6 text-primary shrink-0" />
                                                <DialogTitle className="text-xl">
                                                    {industryName}
                                                    {companyCount > 0 && (
                                                        <span className="ml-2 text-base font-normal text-white/60">
                                                            ({companyCount})
                                                        </span>
                                                    )}
                                                </DialogTitle>
                                            </div>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setShowHelp(true)}
                                                className="text-white/90 hover:text-white border-white/20 hover:border-white/40 bg-white/5 hover:bg-white/10"
                                            >
                                                <HelpCircle className="h-4 w-4 mr-2" />
                                                Help
                                            </Button>
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
                                                {industry.medianBatch && (
                                                    <div className="flex items-center gap-2 whitespace-nowrap">
                                                        <Calendar className="h-4 w-4 text-white/50" />
                                                        <span className="text-sm text-white/60">Median Batch:</span>
                                                        <span className="text-sm font-semibold text-white whitespace-nowrap">{formatBatchToQuarter(industry.medianBatch)}</span>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })()
                        ) : (
                            <div className="flex flex-col gap-3 w-full">
                                <div className="flex items-center justify-between">
                                    <DialogTitle className="text-xl">Explore YC Startups by Sectors</DialogTitle>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setShowHelp(true)}
                                        className="text-white/90 hover:text-white border-white/20 hover:border-white/40 bg-white/5 hover:bg-white/10"
                                    >
                                        <HelpCircle className="h-4 w-4 mr-2" />
                                        Help
                                    </Button>
                                </div>
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
                                    onChange={(e) => {
                                        setSortBy(e.target.value as SortOption);
                                        setSortDirection("desc"); // Reset to descending when changing sort column
                                    }}
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
                                    <option value="batch" className="bg-background">Sort by Batch Recency</option>
                                    <option value="opportunityScore" className="bg-background">Sort by Avg Opportunity Score</option>
                                    <option value="volume" className="bg-background">Sort by Avg Volume</option>
                                    <option value="growthYoy" className="bg-background">Sort by Avg Growth YoY</option>
                                    <option value="cpc" className="bg-background">Sort by Avg CPC</option>
                                </select>
                                <div className="flex gap-2 border border-white/10 rounded-lg p-1 bg-white/5">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className={`h-8 w-8 ${viewMode === "card" ? "bg-white/10" : ""}`}
                                        onClick={() => setViewMode("card")}
                                        title="Card view"
                                    >
                                        <LayoutGrid className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className={`h-8 w-8 ${viewMode === "table" ? "bg-white/10" : ""}`}
                                        onClick={() => setViewMode("table")}
                                        title="Table view"
                                    >
                                        <Table2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>

                            {/* Industries Grid (Main + Sub flattened) */}
                            {viewMode === "card" ? (
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
                                            medianBatch={industry.medianBatch}
                                        />
                                    ))}
                                </div>
                            ) : (
                                (() => {
                                    // Format volume to 3 significant digits
                                    const formatVolume = (volume: number): string => {
                                        if (volume === 0) return "0 k";
                                        const significantDigits = 3;
                                        const magnitude = Math.floor(Math.log10(Math.abs(volume)));
                                        const factor = Math.pow(10, significantDigits - 1 - magnitude);
                                        const rounded = Math.round(volume * factor) / factor;
                                        return rounded.toLocaleString() + " k";
                                    };

                                    // Gradient functions (same as in SectorMetricsMini)
                                    const getTrendGradientText = (value: number) => {
                                        if (value >= 0) {
                                            const normalizedValue = Math.min(1, Math.max(0, value / 50));
                                            const lightness = 100 - normalizedValue * 50;
                                            const finalLightness = Math.max(60, lightness);
                                            return { color: `hsl(142, 70%, ${finalLightness}%)` };
                                        } else {
                                            const normalizedValue = Math.min(1, Math.max(0, Math.abs(value) / 10));
                                            const lightness = 100 - normalizedValue * 50;
                                            const finalLightness = Math.max(60, lightness);
                                            return { color: `hsl(0, 80%, ${finalLightness}%)` };
                                        }
                                    };

                                    const getPurpleGradientText = (value: number) => {
                                        const minCpc = 3;
                                        const maxCpc = 10;
                                        const clampedValue = Math.max(minCpc, Math.min(maxCpc, value));
                                        const normalizedValue = (clampedValue - minCpc) / (maxCpc - minCpc);
                                        const lightness = 100 - normalizedValue * 40;
                                        return { color: `hsl(250, 80%, ${lightness}%)` };
                                    };

                                    const getOrangeGradientText = (value: number) => {
                                        const minOpportunity = 20;
                                        const maxOpportunity = 32;
                                        const clampedValue = Math.max(minOpportunity, Math.min(maxOpportunity, value));
                                        const normalizedValue = (clampedValue - minOpportunity) / (maxOpportunity - minOpportunity);
                                        if (normalizedValue === 0) {
                                            return { color: `hsl(0, 0%, 100%)` };
                                        }
                                        const hue = 142;
                                        const saturation = normalizedValue * 100;
                                        const lightness = 100 - (normalizedValue * 40);
                                        return { color: `hsl(${hue}, ${saturation}%, ${lightness}%)` };
                                    };

                                    const getBlueGradientText = (value: number) => {
                                        const maxVolume = 6000;
                                        const normalizedValue = Math.min(1, Math.max(0, value / maxVolume));
                                        // Vibrant blue gradient: light blue at 0, more vibrant blue at max
                                        const lightness = 100 - normalizedValue * 25; // 100% to 75% (slightly darker for vibrancy)
                                        const saturation = 70 + normalizedValue * 25; // 70% to 95% (high saturation for vibrancy)
                                        return { color: `hsl(200, ${saturation}%, ${lightness}%)` };
                                    };

                                    const handleColumnSort = (column: SortOption) => {
                                        if (sortBy === column) {
                                            // Toggle direction if clicking the same column
                                            setSortDirection(sortDirection === "asc" ? "desc" : "asc");
                                        } else {
                                            // Set new column and default to descending
                                            setSortBy(column);
                                            setSortDirection("desc");
                                        }
                                    };

                                    const SortIcon = ({ column }: { column: SortOption }) => {
                                        if (sortBy !== column) return null;
                                        return sortDirection === "asc" ? (
                                            <ArrowUp className="h-3 w-3 ml-1" />
                                        ) : (
                                            <ArrowDown className="h-3 w-3 ml-1" />
                                        );
                                    };

                                    return (
                                        <div className="border border-white/10 rounded-lg overflow-hidden">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow className="border-white/10 hover:bg-white/5">
                                                        <TableHead
                                                            className="text-white/90 cursor-pointer hover:text-white select-none"
                                                            onClick={() => handleColumnSort("name")}
                                                        >
                                                            <div className="flex items-center">
                                                                Sector
                                                                <SortIcon column="name" />
                                                            </div>
                                                        </TableHead>
                                                        <TableHead
                                                            className="text-white/90 text-right cursor-pointer hover:text-white select-none"
                                                            onClick={() => handleColumnSort("startups")}
                                                        >
                                                            <div className="flex items-center justify-end">
                                                                Startups
                                                                <SortIcon column="startups" />
                                                            </div>
                                                        </TableHead>
                                                        <TableHead
                                                            className="text-white/90 cursor-pointer hover:text-white select-none"
                                                            onClick={() => handleColumnSort("batch")}
                                                        >
                                                            <div className="flex items-center">
                                                                Median Batch
                                                                <SortIcon column="batch" />
                                                            </div>
                                                        </TableHead>
                                                        <TableHead
                                                            className="text-white/90 text-right cursor-pointer hover:text-white select-none"
                                                            onClick={() => handleColumnSort("volume")}
                                                        >
                                                            <div className="flex items-center justify-end">
                                                                Avg Volume
                                                                <SortIcon column="volume" />
                                                            </div>
                                                        </TableHead>
                                                        <TableHead
                                                            className="text-white/90 text-right cursor-pointer hover:text-white select-none"
                                                            onClick={() => handleColumnSort("cpc")}
                                                        >
                                                            <div className="flex items-center justify-end">
                                                                Avg CPC
                                                                <SortIcon column="cpc" />
                                                            </div>
                                                        </TableHead>
                                                        <TableHead
                                                            className="text-white/90 text-right cursor-pointer hover:text-white select-none"
                                                            onClick={() => handleColumnSort("growthYoy")}
                                                        >
                                                            <div className="flex items-center justify-end">
                                                                Avg YoY Growth
                                                                <SortIcon column="growthYoy" />
                                                            </div>
                                                        </TableHead>
                                                        <TableHead
                                                            className="text-white/90 text-right cursor-pointer hover:text-white select-none"
                                                            onClick={() => handleColumnSort("opportunityScore")}
                                                        >
                                                            <div className="flex items-center justify-end">
                                                                Avg Opportunity
                                                                <SortIcon column="opportunityScore" />
                                                            </div>
                                                        </TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {industriesList.map((industry, index) => {
                                                        const SectorIcon = getSectorIcon(industry.industry);
                                                        const metrics = industry.aggregatedMetrics;
                                                        const avgGrowthYoy = typeof metrics.avgGrowthYoy === 'number' && !isNaN(metrics.avgGrowthYoy)
                                                            ? metrics.avgGrowthYoy
                                                            : 0;

                                                        return (
                                                            <TableRow
                                                                key={`${industry.industry}-${industry.industryType || 'sub'}-${index}`}
                                                                className="border-white/10 hover:bg-white/5 cursor-pointer"
                                                                onClick={() => handleSubIndustryClick(industry.industry)}
                                                            >
                                                                <TableCell className="font-medium">
                                                                    <div className="flex items-center gap-2">
                                                                        <SectorIcon className="h-4 w-4 text-primary shrink-0" />
                                                                        <span className="text-white">
                                                                            {industry.industry}{industry.industryType === 'main' ? ' (Main)' : ''}
                                                                        </span>
                                                                    </div>
                                                                </TableCell>
                                                                <TableCell className="text-right text-white/90">
                                                                    {industry.companyCount || 0}
                                                                </TableCell>
                                                                <TableCell>
                                                                    {industry.medianBatch ? (
                                                                        <span className="text-white/90 whitespace-nowrap">{formatBatchToQuarter(industry.medianBatch)}</span>
                                                                    ) : (
                                                                        <span className="text-white/50">-</span>
                                                                    )}
                                                                </TableCell>
                                                                <TableCell className="text-right">
                                                                    <span style={getBlueGradientText(metrics.avgVolume)}>
                                                                        {formatVolume(metrics.avgVolume)}
                                                                    </span>
                                                                </TableCell>
                                                                <TableCell className="text-right">
                                                                    <span style={getPurpleGradientText(metrics.avgCpc)}>
                                                                        ${metrics.avgCpc.toFixed(2)}
                                                                    </span>
                                                                </TableCell>
                                                                <TableCell className="text-right">
                                                                    <span style={getTrendGradientText(avgGrowthYoy)}>
                                                                        {avgGrowthYoy >= 0 ? "+" : ""}{avgGrowthYoy.toFixed(1)}%
                                                                    </span>
                                                                </TableCell>
                                                                <TableCell className="text-right">
                                                                    <span style={getOrangeGradientText(metrics.opportunityScore)}>
                                                                        {Math.round(metrics.opportunityScore)}
                                                                    </span>
                                                                </TableCell>
                                                            </TableRow>
                                                        );
                                                    })}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    );
                                })()
                            )}

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
                                        onChange={(e) => {
                                            setCompanySortBy(e.target.value as SortOption);
                                            setCompanySortDirection("desc"); // Reset to descending when changing sort column
                                        }}
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
                                        <option value="batch" className="bg-background">Sort by Batch Recency</option>
                                        <option value="name" className="bg-background">Sort by Name</option>
                                    </select>
                                    <div className="flex gap-2 border border-white/10 rounded-lg p-1 bg-white/5">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className={`h-8 w-8 ${companyViewMode === "card" ? "bg-white/10" : ""}`}
                                            onClick={() => setCompanyViewMode("card")}
                                            title="Card view"
                                        >
                                            <LayoutGrid className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className={`h-8 w-8 ${companyViewMode === "table" ? "bg-white/10" : ""}`}
                                            onClick={() => setCompanyViewMode("table")}
                                            title="Table view"
                                        >
                                            <Table2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>

                                {/* Companies Grid or Table */}
                                {industryCompanies.length > 0 ? (
                                    (() => {
                                        // Calculate pagination
                                        const totalPages = Math.ceil(industryCompanies.length / companiesPerPage);
                                        const startIndex = (companyCurrentPage - 1) * companiesPerPage;
                                        const endIndex = startIndex + companiesPerPage;
                                        const paginatedCompanies = industryCompanies.slice(startIndex, endIndex);

                                        return (
                                            <>
                                                {companyViewMode === "card" ? (
                                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                                        {paginatedCompanies.map((company, index) => {
                                                            const actualIndex = startIndex + index;
                                                            return (
                                                                <SectorCard
                                                                    key={`${company.name}-${actualIndex}${company.url ? `-${company.url}` : ''}`}
                                                                    name={company.name}
                                                                    metrics={company.aggregatedMetrics}
                                                                    description={company.description}
                                                                    url={company.url}
                                                                    batch={company.batch}
                                                                    type="user_type"
                                                                    onClick={() => handleItemClick(company.description || company.name)}
                                                                    compact
                                                                />
                                                            );
                                                        })}
                                                    </div>
                                                ) : (
                                                    (() => {
                                                        // Format volume to 3 significant digits
                                                        const formatVolume = (volume: number): string => {
                                                            if (volume === 0) return "0 k";
                                                            const significantDigits = 3;
                                                            const magnitude = Math.floor(Math.log10(Math.abs(volume)));
                                                            const factor = Math.pow(10, significantDigits - 1 - magnitude);
                                                            const rounded = Math.round(volume * factor) / factor;
                                                            return rounded.toLocaleString() + " k";
                                                        };

                                                        // Gradient functions (same as in SectorMetricsMini)
                                                        const getTrendGradientText = (value: number) => {
                                                            if (value >= 0) {
                                                                const normalizedValue = Math.min(1, Math.max(0, value / 50));
                                                                const lightness = 100 - normalizedValue * 50;
                                                                const finalLightness = Math.max(60, lightness);
                                                                return { color: `hsl(142, 70%, ${finalLightness}%)` };
                                                            } else {
                                                                const normalizedValue = Math.min(1, Math.max(0, Math.abs(value) / 10));
                                                                const lightness = 100 - normalizedValue * 50;
                                                                const finalLightness = Math.max(60, lightness);
                                                                return { color: `hsl(0, 80%, ${finalLightness}%)` };
                                                            }
                                                        };

                                                        const getPurpleGradientText = (value: number) => {
                                                            const minCpc = 3;
                                                            const maxCpc = 10;
                                                            const clampedValue = Math.max(minCpc, Math.min(maxCpc, value));
                                                            const normalizedValue = (clampedValue - minCpc) / (maxCpc - minCpc);
                                                            const lightness = 100 - normalizedValue * 40;
                                                            return { color: `hsl(250, 80%, ${lightness}%)` };
                                                        };

                                                        const getOrangeGradientText = (value: number) => {
                                                            const minOpportunity = 20;
                                                            const maxOpportunity = 32;
                                                            const clampedValue = Math.max(minOpportunity, Math.min(maxOpportunity, value));
                                                            const normalizedValue = (clampedValue - minOpportunity) / (maxOpportunity - minOpportunity);
                                                            if (normalizedValue === 0) {
                                                                return { color: `hsl(0, 0%, 100%)` };
                                                            }
                                                            const hue = 142;
                                                            const saturation = normalizedValue * 100;
                                                            const lightness = 100 - (normalizedValue * 40);
                                                            return { color: `hsl(${hue}, ${saturation}%, ${lightness}%)` };
                                                        };

                                                        const getBlueGradientText = (value: number) => {
                                                            const maxVolume = 6000;
                                                            const normalizedValue = Math.min(1, Math.max(0, value / maxVolume));
                                                            // Vibrant blue gradient: light blue at 0, more vibrant blue at max
                                                            const lightness = 100 - normalizedValue * 25; // 100% to 75% (slightly darker for vibrancy)
                                                            const saturation = 70 + normalizedValue * 25; // 70% to 95% (high saturation for vibrancy)
                                                            return { color: `hsl(200, ${saturation}%, ${lightness}%)` };
                                                        };

                                                        const handleCompanyColumnSort = (column: SortOption) => {
                                                            if (companySortBy === column) {
                                                                // Toggle direction if clicking the same column
                                                                setCompanySortDirection(companySortDirection === "asc" ? "desc" : "asc");
                                                            } else {
                                                                // Set new column and default to descending
                                                                setCompanySortBy(column);
                                                                setCompanySortDirection("desc");
                                                            }
                                                        };

                                                        const CompanySortIcon = ({ column }: { column: SortOption }) => {
                                                            if (companySortBy !== column) return null;
                                                            return companySortDirection === "asc" ? (
                                                                <ArrowUp className="h-3 w-3 ml-1" />
                                                            ) : (
                                                                <ArrowDown className="h-3 w-3 ml-1" />
                                                            );
                                                        };

                                                        return (
                                                            <div className="border border-white/10 rounded-lg overflow-hidden">
                                                                <Table>
                                                                    <TableHeader>
                                                                        <TableRow className="border-white/10 hover:bg-white/5">
                                                                            <TableHead
                                                                                className="text-white/90 cursor-pointer hover:text-white select-none"
                                                                                onClick={() => handleCompanyColumnSort("name")}
                                                                            >
                                                                                <div className="flex items-center">
                                                                                    Company
                                                                                    <CompanySortIcon column="name" />
                                                                                </div>
                                                                            </TableHead>
                                                                            <TableHead
                                                                                className="text-white/90 cursor-pointer hover:text-white select-none"
                                                                                onClick={() => handleCompanyColumnSort("batch")}
                                                                            >
                                                                                <div className="flex items-center">
                                                                                    Batch
                                                                                    <CompanySortIcon column="batch" />
                                                                                </div>
                                                                            </TableHead>
                                                                            <TableHead className="text-white/90">Description</TableHead>
                                                                            <TableHead
                                                                                className="text-white/90 text-right cursor-pointer hover:text-white select-none"
                                                                                onClick={() => handleCompanyColumnSort("volume")}
                                                                            >
                                                                                <div className="flex items-center justify-end">
                                                                                    Avg Volume
                                                                                    <CompanySortIcon column="volume" />
                                                                                </div>
                                                                            </TableHead>
                                                                            <TableHead
                                                                                className="text-white/90 text-right cursor-pointer hover:text-white select-none"
                                                                                onClick={() => handleCompanyColumnSort("cpc")}
                                                                            >
                                                                                <div className="flex items-center justify-end">
                                                                                    Avg CPC
                                                                                    <CompanySortIcon column="cpc" />
                                                                                </div>
                                                                            </TableHead>
                                                                            <TableHead
                                                                                className="text-white/90 text-right cursor-pointer hover:text-white select-none"
                                                                                onClick={() => handleCompanyColumnSort("growthYoy")}
                                                                            >
                                                                                <div className="flex items-center justify-end">
                                                                                    Avg YoY Growth
                                                                                    <CompanySortIcon column="growthYoy" />
                                                                                </div>
                                                                            </TableHead>
                                                                            <TableHead
                                                                                className="text-white/90 text-right cursor-pointer hover:text-white select-none"
                                                                                onClick={() => handleCompanyColumnSort("opportunityScore")}
                                                                            >
                                                                                <div className="flex items-center justify-end">
                                                                                    Avg Opportunity
                                                                                    <CompanySortIcon column="opportunityScore" />
                                                                                </div>
                                                                            </TableHead>
                                                                        </TableRow>
                                                                    </TableHeader>
                                                                    <TableBody>
                                                                        {paginatedCompanies.map((company, index) => {
                                                                            const actualIndex = startIndex + index;
                                                                            const metrics = company.aggregatedMetrics;
                                                                            const avgGrowthYoy = typeof metrics.avgGrowthYoy === 'number' && !isNaN(metrics.avgGrowthYoy)
                                                                                ? metrics.avgGrowthYoy
                                                                                : 0;

                                                                            return (
                                                                                <TableRow
                                                                                    key={`${company.name}-${actualIndex}${company.url ? `-${company.url}` : ''}`}
                                                                                    className="border-white/10 hover:bg-white/5 cursor-pointer"
                                                                                    onClick={() => handleItemClick(company.description || company.name)}
                                                                                >
                                                                                    <TableCell className="font-medium">
                                                                                        <div className="flex items-center gap-2">
                                                                                            <span className="text-white">{company.name}</span>
                                                                                            {company.url && (
                                                                                                <Button
                                                                                                    variant="ghost"
                                                                                                    size="icon"
                                                                                                    className="h-5 w-5 text-white/60 hover:text-white/90"
                                                                                                    onClick={(e) => {
                                                                                                        e.stopPropagation();
                                                                                                        window.open(company.url, '_blank', 'noopener,noreferrer');
                                                                                                    }}
                                                                                                    title="View on YC"
                                                                                                >
                                                                                                    <ExternalLink className="h-3.5 w-3.5" />
                                                                                                </Button>
                                                                                            )}
                                                                                        </div>
                                                                                    </TableCell>
                                                                                    <TableCell>
                                                                                        {company.batch ? (
                                                                                            <span className="px-2 py-0.5 rounded bg-white/10 text-white/70 text-sm whitespace-nowrap">
                                                                                                {formatBatchToQuarter(company.batch)}
                                                                                            </span>
                                                                                        ) : (
                                                                                            <span className="text-white/50 text-sm">-</span>
                                                                                        )}
                                                                                    </TableCell>
                                                                                    <TableCell>
                                                                                        <span className="text-white/70 text-sm line-clamp-2 max-w-xs">
                                                                                            {company.description || "-"}
                                                                                        </span>
                                                                                    </TableCell>
                                                                                    <TableCell className="text-right">
                                                                                        <span style={getBlueGradientText(metrics.avgVolume)}>
                                                                                            {formatVolume(metrics.avgVolume)}
                                                                                        </span>
                                                                                    </TableCell>
                                                                                    <TableCell className="text-right">
                                                                                        <span style={getPurpleGradientText(metrics.avgCpc)}>
                                                                                            ${metrics.avgCpc.toFixed(2)}
                                                                                        </span>
                                                                                    </TableCell>
                                                                                    <TableCell className="text-right">
                                                                                        <span style={getTrendGradientText(avgGrowthYoy)}>
                                                                                            {avgGrowthYoy >= 0 ? "+" : ""}{avgGrowthYoy.toFixed(1)}%
                                                                                        </span>
                                                                                    </TableCell>
                                                                                    <TableCell className="text-right">
                                                                                        <span style={getOrangeGradientText(metrics.opportunityScore)}>
                                                                                            {Math.round(metrics.opportunityScore)}
                                                                                        </span>
                                                                                    </TableCell>
                                                                                </TableRow>
                                                                            );
                                                                        })}
                                                                    </TableBody>
                                                                </Table>
                                                            </div>
                                                        );
                                                    })()
                                                )}

                                                {/* Pagination Controls */}
                                                {totalPages > 1 && (
                                                    <div className="flex items-center justify-between mt-6 pt-4 border-t border-white/10">
                                                        <div className="text-sm text-white/60">
                                                            Showing {startIndex + 1} to {Math.min(endIndex, industryCompanies.length)} of {industryCompanies.length} companies
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => setCompanyCurrentPage(prev => Math.max(1, prev - 1))}
                                                                disabled={companyCurrentPage === 1}
                                                                className="text-white/90 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                                                            >
                                                                <ChevronLeft className="h-4 w-4 mr-1" />
                                                                Previous
                                                            </Button>
                                                            <div className="flex items-center gap-1">
                                                                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                                                    let pageNum;
                                                                    if (totalPages <= 5) {
                                                                        pageNum = i + 1;
                                                                    } else if (companyCurrentPage <= 3) {
                                                                        pageNum = i + 1;
                                                                    } else if (companyCurrentPage >= totalPages - 2) {
                                                                        pageNum = totalPages - 4 + i;
                                                                    } else {
                                                                        pageNum = companyCurrentPage - 2 + i;
                                                                    }
                                                                    return (
                                                                        <Button
                                                                            key={pageNum}
                                                                            variant={companyCurrentPage === pageNum ? "default" : "ghost"}
                                                                            size="sm"
                                                                            onClick={() => setCompanyCurrentPage(pageNum)}
                                                                            className={`min-w-[2.5rem] ${companyCurrentPage === pageNum
                                                                                ? "bg-primary text-primary-foreground"
                                                                                : "text-white/90 hover:text-white hover:bg-white/10"
                                                                                }`}
                                                                        >
                                                                            {pageNum}
                                                                        </Button>
                                                                    );
                                                                })}
                                                            </div>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => setCompanyCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                                                disabled={companyCurrentPage === totalPages}
                                                                className="text-white/90 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                                                            >
                                                                Next
                                                                <ChevronRight className="h-4 w-4 ml-1" />
                                                            </Button>
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        );
                                    })()
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

            {/* Help Dialog */}
            <Dialog open={showHelp} onOpenChange={setShowHelp}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col bg-background/95 backdrop-blur-xl">
                    <DialogHeader>
                        <DialogTitle className="text-2xl">Sector Browser Help</DialogTitle>
                    </DialogHeader>
                    <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                        {/* How to Use */}
                        <section>
                            <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                                <BookOpen className="h-5 w-5 text-primary" />
                                How to Use
                            </h3>
                            <div className="space-y-3 text-white/80 text-sm">
                                <div>
                                    <p className="font-semibold text-white mb-1">Browsing Sectors:</p>
                                    <ul className="list-disc list-inside space-y-1 ml-2">
                                        <li>View all sectors in card or table view using the toggle buttons</li>
                                        <li>Search sectors by name using the search bar</li>
                                        <li>Sort by name, number of startups, or any metric by clicking column headers (table view) or using the dropdown (card view)</li>
                                        <li>Click on any sector card or table row to view companies within that sector</li>
                                    </ul>
                                </div>
                                <div>
                                    <p className="font-semibold text-white mb-1">Viewing Companies:</p>
                                    <ul className="list-disc list-inside space-y-1 ml-2">
                                        <li>Browse companies in card or table view</li>
                                        <li>Search companies by name or description</li>
                                        <li>Sort companies by clicking column headers or using the dropdown</li>
                                        <li>Companies are paginated (100 per page) for better performance</li>
                                        <li>Click on a company to use its description as a search query</li>
                                    </ul>
                                </div>
                                <div>
                                    <p className="font-semibold text-white mb-1">Understanding Metrics:</p>
                                    <ul className="list-disc list-inside space-y-1 ml-2">
                                        <li>Metrics are aggregated from keywords related to each startup</li>
                                        <li>Color coding helps distinguish different metric types</li>
                                    </ul>
                                </div>
                            </div>
                        </section>

                        {/* Data Sources */}
                        <section>
                            <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                                <Globe className="h-5 w-5 text-primary" />
                                Where is the Data Coming From?
                            </h3>
                            <div className="space-y-3 text-white/80 text-sm">
                                <div>
                                    <p className="mb-2">
                                        The sector browser aggregates data from <strong className="text-white">Y Combinator (YC) startups</strong> and their associated keyword metrics:
                                    </p>
                                    <ul className="list-disc list-inside space-y-1 ml-2">
                                        <li><strong className="text-white">Company Data:</strong> Sourced from YC's public company database, including company names, descriptions, industries, batches, and URLs</li>
                                        <li><strong className="text-white">Keyword Metrics:</strong> Each startup is associated with relevant keywords based on semantic similarity to their description</li>
                                        <li><strong className="text-white">Search Volume Data:</strong> Keyword metrics come from search engine data including volume, competition, CPC, and growth trends</li>
                                        <li><strong className="text-white">Aggregation:</strong> Sector-level metrics are calculated by aggregating metrics from all companies within each sector</li>
                                    </ul>
                                </div>
                                <div className="bg-white/5 p-3 rounded-lg border border-white/10">
                                    <p className="text-white/90 font-semibold mb-1">⚠️ Important Note:</p>
                                    <p className="text-white/70">
                                        The metrics shown are aggregated from keywords related to startups in each sector, <strong>not actual industry performance data</strong>. They represent search interest and market signals around the keywords associated with companies in each sector.
                                    </p>
                                </div>
                            </div>
                        </section>

                        {/* Metric Calculations */}
                        <section>
                            <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                                <BarChart3 className="h-5 w-5 text-primary" />
                                How are Metrics Calculated?
                            </h3>
                            <div className="space-y-4 text-white/80 text-sm">
                                <div>
                                    <p className="font-semibold text-white mb-2">Company-Level Metrics:</p>
                                    <ul className="list-disc list-inside space-y-2 ml-2">
                                        <li>
                                            <strong className="text-white">Keyword Matching:</strong> For each company, keywords are found using semantic similarity to the company's description
                                        </li>
                                        <li>
                                            <strong className="text-white">Weighted Averages:</strong> Metrics are calculated using weighted averages, where weights are based on keyword match quality (similarity score squared) and search volume (square root of volume)
                                        </li>
                                    </ul>
                                </div>
                                <div>
                                    <p className="font-semibold text-white mb-2">Sector-Level Metrics:</p>
                                    <ul className="list-disc list-inside space-y-2 ml-2">
                                        <li>
                                            <strong className="text-white">Aggregation Method:</strong> Sector metrics aggregate all company metrics within that sector using weighted averages in the same way as company-level metrics
                                        </li>
                                    </ul>
                                </div>
                                <div>
                                    <p className="font-semibold text-white mb-2">Specific Metrics:</p>
                                    <ul className="list-disc list-inside space-y-1 ml-2">
                                        <li><strong className="text-white">Avg Volume:</strong> Average monthly search volume for keywords (in thousands)</li>
                                        <li><strong className="text-white">Avg Opportunity Score:</strong> Calculated from volume, competition, CPC, and growth trends (higher = better opportunity)</li>
                                        <li><strong className="text-white">Avg YoY Growth:</strong> Year-over-year percentage change in search volume</li>
                                        <li><strong className="text-white">Avg CPC:</strong> Average cost-per-click for keywords in that sector</li>
                                        <li><strong className="text-white">Median Batch:</strong> The median YC batch year/season of startups in the sector</li>
                                    </ul>
                                </div>
                            </div>
                        </section>

                        {/* How to Interpret */}
                        <section>
                            <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                                <Target className="h-5 w-5 text-primary" />
                                How to Interpret the Metrics
                            </h3>
                            <div className="space-y-4 text-white/80 text-sm">
                                <div>
                                    <p className="font-semibold text-white mb-2">What High/Low Values Mean:</p>
                                    <ul className="list-disc list-inside space-y-2 ml-2">
                                        <li>
                                            <strong className="text-white">High Volume:</strong> Indicates strong search interest in keywords related to this sector. Could mean high market demand or awareness.
                                        </li>
                                        <li>
                                            <strong className="text-white">High Opportunity Score:</strong> Suggests good market conditions - high volume, manageable competition, reasonable CPC, and positive growth trends.
                                        </li>
                                        <li>
                                            <strong className="text-white">Positive Growth:</strong> Growing search interest over time, indicating increasing market awareness or demand.
                                        </li>
                                        <li>
                                            <strong className="text-white">High CPC:</strong> Competitive market with advertisers willing to pay more for clicks, often indicating higher-value keywords.
                                        </li>
                                        <li>
                                            <strong className="text-white">Recent Median Batch:</strong> Sectors with more recent batches may indicate emerging trends or growing interest from YC.
                                        </li>
                                    </ul>
                                </div>
                                <div className="bg-primary/10 p-3 rounded-lg border border-primary/20">
                                    <p className="text-white/90 font-semibold mb-1">💡 Interpretation Tips:</p>
                                    <ul className="list-disc list-inside space-y-1 ml-2 text-white/70">
                                        <li>Compare metrics across sectors to identify opportunities</li>
                                        <li>Look for sectors with high opportunity scores and positive growth</li>
                                        <li>Consider the median batch to understand sector maturity</li>
                                        <li>Remember: these are keyword-based signals, not direct market data</li>
                                    </ul>
                                </div>
                            </div>
                        </section>
                    </div>
                </DialogContent>
            </Dialog>
        </Dialog>

        {/* Paywall Modal for sector details */}
        <PaywallModal
            open={showPaywall}
            onOpenChange={setShowPaywall}
            feature="sector-browsing"
        />
        </>
    );
}

