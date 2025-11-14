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
                        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
                            <p className="text-sm text-white/90">
                                Upgrade to premium to get 20 credits and unlock all premium features!
                            </p>
                        </div>
                    )}

                    {hasPaid && creditsAvailable < creditsRequired && (
                        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
                            <p className="text-sm text-white/90">
                                You've used all your credits. Please contact support to purchase more credits.
                            </p>
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
                                    "Upgrade to Premium"
                                )}
                            </Button>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

