import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Coins, Zap } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { usePaymentStatus } from "@/hooks/use-payment-status";

interface CreditPurchaseModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function CreditPurchaseModal({ open, onOpenChange }: CreditPurchaseModalProps) {
    const { toast } = useToast();
    const { data: paymentStatus } = usePaymentStatus();
    const credits = paymentStatus?.credits ?? 0;
    const [selectedOption, setSelectedOption] = useState<"credits_40" | "credits_80">("credits_40");

    const createCheckoutMutation = useMutation({
        mutationFn: async (option: "credits_40" | "credits_80") => {
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

    const handlePurchase = () => {
        createCheckoutMutation.mutate(selectedOption);
    };

    const creditOptions = [
        {
            option: "credits_40" as const,
            price: "€9.99",
            credits: 40,
        },
        {
            option: "credits_80" as const,
            price: "€14.99",
            credits: 80,
            popular: true,
        },
    ];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Coins className="h-5 w-5 text-primary" />
                        Refuel Credits
                    </DialogTitle>
                    <DialogDescription>
                        Purchase more credits to continue using premium features
                    </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4 py-4">
                    <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 mb-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-white/60">Current Credits:</span>
                            <span className="text-lg font-semibold text-white">{credits}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-white/60">After Purchase:</span>
                            <span className="text-lg font-semibold text-primary">
                                {credits + creditOptions.find(opt => opt.option === selectedOption)?.credits || 0}
                            </span>
                        </div>
                    </div>

                    <div className="space-y-2 mb-4">
                        <h3 className="text-sm font-semibold text-white mb-2">Choose Credit Package:</h3>
                        {creditOptions.map((opt) => (
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
                                    <div className="flex items-center gap-2">
                                        <Zap className="h-4 w-4 text-primary" />
                                        <span className="text-sm font-semibold text-white">
                                            {opt.credits} Credits
                                        </span>
                                        {opt.popular && (
                                            <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">
                                                Popular
                                            </span>
                                        )}
                                    </div>
                                    <span className="text-lg font-bold text-white">{opt.price}</span>
                                </div>
                                <p className="text-xs text-white/60 mt-1.5 ml-6">
                                    Credits can be used for competitor generation (1 credit) and keyword extraction (2 credits).
                                </p>
                            </button>
                        ))}
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
                            onClick={handlePurchase}
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
                                    <Coins className="mr-2 h-4 w-4" />
                                    Purchase Credits
                                </>
                            )}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

