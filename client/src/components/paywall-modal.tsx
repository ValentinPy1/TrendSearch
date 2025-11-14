import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, Building2, Filter, Search, TrendingUp, BarChart3, Zap, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface PaywallModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    feature: "sector-browsing" | "advanced-filters" | "custom-search";
}

export function PaywallModal({ open, onOpenChange, feature }: PaywallModalProps) {
    const { toast } = useToast();
    const [expandedFeatures, setExpandedFeatures] = useState<Set<number>>(new Set());
    const [selectedOption, setSelectedOption] = useState<"premium_20" | "premium_100">("premium_20");

    const createCheckoutMutation = useMutation({
        mutationFn: async (option: "premium_20" | "premium_100") => {
            const res = await apiRequest("POST", "/api/stripe/create-checkout", {
                option: option
            });
            return res.json();
        },
        onSuccess: (data) => {
            if (data.checkoutUrl) {
                // Redirect to Stripe Checkout
                window.location.href = data.checkoutUrl;
            } else {
                toast({
                    title: "Error",
                    description: "Failed to create checkout session",
                    variant: "destructive",
                });
            }
        },
        onError: (error) => {
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "Failed to start checkout",
                variant: "destructive",
            });
        },
    });

    const handleCheckout = () => {
        createCheckoutMutation.mutate(selectedOption);
    };

    const premiumOptions = [
        {
            option: "premium_20" as const,
            price: "€9.99",
            credits: 20,
            popular: false,
        },
        {
            option: "premium_100" as const,
            price: "€14.99",
            credits: 100,
            popular: true,
        },
    ];

    const featureName = feature === "sector-browsing" 
        ? "Sector Browsing" 
        : feature === "advanced-filters"
        ? "Advanced Filters"
        : "Custom Search";

    const featureDescription = feature === "sector-browsing"
        ? "Browse and explore sectors to discover trending opportunities across different markets and industries."
        : feature === "advanced-filters"
        ? "Use advanced filters to refine your keyword search with metrics like volume, competition, growth rates, and opportunity scores."
        : "Create detailed custom searches with idea pitch, topics, personas, pain points, and features. Generate targeted keywords and competitor analysis automatically.";

    const premiumFeatures = [
        {
            icon: Building2,
            title: "Sector Browsing",
            description: "Explore detailed sector metrics, company data, and keyword insights across industries. Browse YC startup sectors with aggregated metrics, company listings, and keyword trends."
        },
        {
            icon: Filter,
            title: "Advanced Filters",
            description: "Filter keywords by volume, competition, growth rates, opportunity scores, CPC, and more. Create complex filter combinations to find exactly what you're looking for."
        },
        {
            icon: Search,
            title: "Custom Search",
            description: "Generate competitors, extract keywords from websites, and create detailed custom searches. Build comprehensive keyword strategies with AI-powered competitor analysis."
        },
        {
            icon: TrendingUp,
            title: "4-Year Trend Data",
            description: "Access extended 4-year keyword trend analysis (vs 12-month for free users). See long-term patterns and make better strategic decisions with historical data."
        },
        {
            icon: Zap,
            title: "Credits Included",
            description: "Get credits to use for competitor generation (1 credit) and keyword extraction (2 credits). Credits are deducted only when operations complete successfully. Choose between 20 or 100 credits."
        },
        {
            icon: BarChart3,
            title: "Advanced Analytics",
            description: "Deep dive into opportunity scores, bid efficiency, TAC/SAC metrics, and growth patterns. Get comprehensive insights to optimize your keyword strategy."
        }
    ];

    const toggleFeature = (index: number) => {
        setExpandedFeatures(prev => {
            const newSet = new Set(prev);
            if (newSet.has(index)) {
                newSet.delete(index);
            } else {
                newSet.add(index);
            }
            return newSet;
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader className="text-center pb-2">
                    <div className="flex items-center justify-center mb-2">
                        <div className="p-3 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 border-2 border-primary/30">
                            <Sparkles className="h-6 w-6 text-primary" />
                        </div>
                    </div>
                    <DialogTitle className="text-xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                        Unlock Premium Features
                    </DialogTitle>
                    <DialogDescription className="text-sm pt-1">
                        One-time payment • Unlimited access • Credits included
                    </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4 py-2">
                    {/* Current Feature Highlight */}
                    <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20 rounded-lg p-3">
                        <div className="flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-primary shrink-0" />
                            <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-white text-sm">{featureName}</h3>
                                <p className="text-xs text-white/60 mt-0.5 line-clamp-2">
                                    {featureDescription}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Premium Features List */}
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                            <h3 className="text-sm font-semibold text-white">All Premium Features:</h3>
                        </div>
                        <div className="space-y-2">
                            {premiumFeatures.map((featureItem, index) => {
                                const Icon = featureItem.icon;
                                const isExpanded = expandedFeatures.has(index);
                                return (
                                    <div
                                        key={index}
                                        className="rounded-md bg-white/5 border border-white/10 overflow-hidden transition-all"
                                    >
                                        <button
                                            onClick={() => toggleFeature(index)}
                                            className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/10 transition-colors"
                                        >
                                            <div className="flex items-center gap-2.5 flex-1 min-w-0">
                                                <Icon className="h-4 w-4 text-primary shrink-0" />
                                                <span className="text-sm text-white font-medium text-left">
                                                    {featureItem.title}
                                                </span>
                                            </div>
                                            {isExpanded ? (
                                                <ChevronUp className="h-4 w-4 text-white/60 shrink-0" />
                                            ) : (
                                                <ChevronDown className="h-4 w-4 text-white/60 shrink-0" />
                                            )}
                                        </button>
                                        {isExpanded && (
                                            <div className="px-3 pb-3 pt-0">
                                                <p className="text-xs text-white/60 leading-relaxed pl-6">
                                                    {featureItem.description}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Premium Options */}
                    <div className="space-y-2 pt-2">
                        <h3 className="text-sm font-semibold text-white mb-2">Choose Your Plan:</h3>
                        {premiumOptions.map((opt) => (
                            <button
                                key={opt.option}
                                onClick={() => setSelectedOption(opt.option)}
                                className={`w-full text-left rounded-lg border-2 p-3 transition-all ${
                                    selectedOption === opt.option
                                        ? "border-primary bg-primary/10"
                                        : "border-white/10 bg-white/5 hover:border-white/20"
                                }`}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold text-white">
                                                Premium + {opt.credits} Credits
                                            </span>
                                            {opt.popular && (
                                                <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">
                                                    Popular
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-white/60 mt-0.5">
                                            Unlimited access to all premium features
                                        </p>
                                    </div>
                                    <div className="text-right ml-4">
                                        <div className="text-lg font-bold text-white">{opt.price}</div>
                                        <div className="text-xs text-white/60">EUR</div>
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>

                    {/* CTA Buttons */}
                    <div className="flex gap-3 pt-2">
                        <Button
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            className="flex-1"
                            size="sm"
                        >
                            Maybe Later
                        </Button>
                        <Button
                            onClick={handleCheckout}
                            disabled={createCheckoutMutation.isPending}
                            className="flex-1 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
                            size="sm"
                        >
                            {createCheckoutMutation.isPending ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Processing...
                                </>
                            ) : (
                                <>
                                    <Sparkles className="mr-2 h-4 w-4" />
                                    Unlock Premium
                                </>
                            )}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
