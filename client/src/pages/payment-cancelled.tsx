import { useEffect } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { GradientOrbs } from "@/components/gradient-orbs";
import { GlassmorphicCard } from "@/components/glassmorphic-card";
import { XCircle, Loader2 } from "lucide-react";
import { paymentEvents } from "@/lib/gtm";

export default function PaymentCancelled() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    // Track payment cancellation
    // Try to get purchase type from URL params or localStorage if available
    const urlParams = new URLSearchParams(window.location.search);
    const purchaseType = urlParams.get('type') || 'premium';
    const option = urlParams.get('option') || 'premium_20';
    
    paymentEvents.paymentCancelled(
      purchaseType as 'premium' | 'credits',
      option
    );
    
    toast({
      title: "Payment Cancelled",
      description: "You can try again anytime.",
      variant: "default",
    });
    
    // Redirect to home after a short delay
    setTimeout(() => {
      setLocation('/');
    }, 2000);
  }, [setLocation, toast]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <GradientOrbs />
      <div className="relative z-10">
        <GlassmorphicCard className="p-8 text-center max-w-md">
          <div className="flex flex-col items-center gap-4">
            <div className="p-3 rounded-full bg-white/10">
              <XCircle className="h-12 w-12 text-white/60" />
            </div>
            <h1 className="text-2xl font-bold text-white">Payment Cancelled</h1>
            <p className="text-white/60">
              Your payment was cancelled. You can try again anytime. Redirecting you back...
            </p>
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        </GlassmorphicCard>
      </div>
    </div>
  );
}

