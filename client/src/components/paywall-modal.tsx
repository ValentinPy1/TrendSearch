import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Lock, Sparkles } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface PaywallModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    feature: "sector-browsing" | "advanced-filters" | "custom-search";
}

export function PaywallModal({ open, onOpenChange, feature }: PaywallModalProps) {
    const { toast } = useToast();

    const createCheckoutMutation = useMutation({
        mutationFn: async () => {
            const res = await apiRequest("POST", "/api/stripe/create-checkout");
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
        createCheckoutMutation.mutate();
    };

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

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Lock className="h-5 w-5 text-primary" />
                        Premium Feature
                    </DialogTitle>
                    <DialogDescription>
                        {featureName} is a premium feature that requires a one-time payment to unlock.
                    </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4 py-4">
                    <div className="flex items-start gap-3">
                        <Sparkles className="h-5 w-5 text-primary mt-0.5" />
                        <div>
                            <h3 className="font-semibold text-white">{featureName}</h3>
                            <p className="text-sm text-white/60 mt-1">
                                {featureDescription}
                            </p>
                        </div>
                    </div>

                    <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
                        <p className="text-sm text-white/90">
                            Unlock {featureName} and all premium features with a one-time payment.
                        </p>
                    </div>

                    <div className="flex gap-3">
                        <Button
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            className="flex-1"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleCheckout}
                            disabled={createCheckoutMutation.isPending}
                            className="flex-1"
                        >
                            {createCheckoutMutation.isPending ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Processing...
                                </>
                            ) : (
                                "Unlock Premium"
                            )}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
