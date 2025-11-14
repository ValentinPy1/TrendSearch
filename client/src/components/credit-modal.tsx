import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Lock, Sparkles, Coins } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { usePaymentStatus } from "@/hooks/use-payment-status";

interface CreditModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    creditsRequired: number;
    featureName: string;
}

export function CreditModal({ open, onOpenChange, creditsRequired, featureName }: CreditModalProps) {
    const { toast } = useToast();
    const { data: paymentStatus } = usePaymentStatus();
    const creditsAvailable = paymentStatus?.credits ?? 0;
    const hasPaid = paymentStatus?.hasPaid ?? false;
    const [selectedCreditOption, setSelectedCreditOption] = useState<"credits_40" | "credits_100">("credits_40");
    const [selectedPremiumOption, setSelectedPremiumOption] = useState<"premium_20" | "premium_100">("premium_20");

    const createCheckoutMutation = useMutation({
        mutationFn: async (option: string) => {
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

    const handlePremiumCheckout = () => {
        createCheckoutMutation.mutate(selectedPremiumOption);
    };

    const handleCreditsCheckout = () => {
        createCheckoutMutation.mutate(selectedCreditOption);
    };

    const premiumOptions = [
        {
            option: "premium_20" as const,
            price: "€9.99",
            credits: 20,
        },
        {
            option: "premium_100" as const,
            price: "€14.99",
            credits: 100,
            popular: true,
        },
    ];

    const creditOptions = [
        {
            option: "credits_40" as const,
            price: "€9.99",
            credits: 40,
        },
        {
            option: "credits_100" as const,
            price: "€14.99",
            credits: 100,
            popular: true,
        },
    ];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Coins className="h-5 w-5 text-primary" />
                        Insufficient Credits
                    </DialogTitle>
                    <DialogDescription>
                        {featureName} requires {creditsRequired} credit{creditsRequired !== 1 ? 's' : ''}, but you only have {creditsAvailable} credit{creditsAvailable !== 1 ? 's' : ''} available.
                    </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4 py-4">
                    <div className="flex items-start gap-3">
                        <Sparkles className="h-5 w-5 text-primary mt-0.5" />
                        <div>
                            <h3 className="font-semibold text-white">{featureName}</h3>
                            <p className="text-sm text-white/60 mt-1">
                                This feature requires {creditsRequired} credit{creditsRequired !== 1 ? 's' : ''} to use.
                            </p>
                        </div>
                    </div>

                    <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-white/60">Your Credits:</span>
                            <span className="text-lg font-semibold text-white">{creditsAvailable}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-white/60">Required:</span>
                            <span className="text-lg font-semibold text-primary">{creditsRequired}</span>
                        </div>
                    </div>

                    {!hasPaid && (
                        <div className="space-y-3">
                            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
                                <p className="text-sm text-white/90 font-semibold mb-2">
                                    Upgrade to Premium + Get Credits
                                </p>
                                <p className="text-xs text-white/70 mb-3">
                                    Unlock all premium features and get credits included!
                                </p>
                                <div className="space-y-2">
                                    {premiumOptions.map((opt) => (
                                        <button
                                            key={opt.option}
                                            onClick={() => setSelectedPremiumOption(opt.option)}
                                            className={`w-full text-left rounded-lg border-2 p-2.5 transition-all ${
                                                selectedPremiumOption === opt.option
                                                    ? "border-primary bg-primary/10"
                                                    : "border-white/10 bg-white/5 hover:border-white/20"
                                            }`}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-medium text-white">
                                                        Premium + {opt.credits} Credits
                                                    </span>
                                                    {opt.popular && (
                                                        <span className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">
                                                            Popular
                                                        </span>
                                                    )}
                                                </div>
                                                <span className="text-sm font-bold text-white">{opt.price}</span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {hasPaid && creditsAvailable < creditsRequired && (
                        <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-sm text-white/80 font-semibold">Refuel Credits</span>
                            </div>
                            <p className="text-xs text-white/60 mb-3">
                                Purchase more credits to continue using premium features.
                            </p>
                            <div className="space-y-2 mb-3">
                                {creditOptions.map((opt) => (
                                    <button
                                        key={opt.option}
                                        onClick={() => setSelectedCreditOption(opt.option)}
                                        className={`w-full text-left rounded-lg border-2 p-2.5 transition-all ${
                                            selectedCreditOption === opt.option
                                                ? "border-primary bg-primary/10"
                                                : "border-white/10 bg-white/5 hover:border-white/20"
                                        }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-medium text-white">
                                                    {opt.credits} Credits
                                                </span>
                                                {opt.popular && (
                                                    <span className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">
                                                        Popular
                                                    </span>
                                                )}
                                            </div>
                                            <span className="text-sm font-bold text-white">{opt.price}</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                            <Button
                                onClick={handleCreditsCheckout}
                                disabled={createCheckoutMutation.isPending}
                                className="w-full bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
                                size="sm"
                            >
                                {createCheckoutMutation.isPending ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Processing...
                                    </>
                                ) : (
                                    <>
                                        <Coins className="mr-2 h-4 w-4" />
                                        Purchase Credits
                                    </>
                                )}
                            </Button>
                        </div>
                    )}

                    <div className="flex gap-3">
                        <Button
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            className="flex-1"
                        >
                            Cancel
                        </Button>
                        {!hasPaid && (
                            <Button
                                onClick={handlePremiumCheckout}
                                disabled={createCheckoutMutation.isPending}
                                className="flex-1 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
                            >
                                {createCheckoutMutation.isPending ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Processing...
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="mr-2 h-4 w-4" />
                                        Upgrade Premium
                                    </>
                                )}
                            </Button>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

