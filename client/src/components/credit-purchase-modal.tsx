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

    const createCheckoutMutation = useMutation({
        mutationFn: async () => {
            const res = await apiRequest("POST", "/api/stripe/create-checkout", {
                type: "credits"
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
        createCheckoutMutation.mutate();
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Coins className="h-5 w-5 text-primary" />
                        Refuel Credits
                    </DialogTitle>
                    <DialogDescription>
                        Purchase 20 more credits to continue using premium features
                    </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4 py-4">
                    <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-sm text-white/60">Current Credits:</span>
                            <span className="text-lg font-semibold text-white">{credits}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-white/60">After Purchase:</span>
                            <span className="text-lg font-semibold text-primary">{credits + 20}</span>
                        </div>
                    </div>

                    <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <Zap className="h-4 w-4 text-primary" />
                                <span className="text-sm font-semibold text-white">20 Credits</span>
                            </div>
                            <span className="text-lg font-bold text-white">$4.99</span>
                        </div>
                        <p className="text-xs text-white/60 mt-2">
                            Credits can be used for competitor generation (1 credit) and keyword extraction (2 credits).
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

