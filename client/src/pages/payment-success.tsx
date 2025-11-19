import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { usePaymentStatus } from "@/hooks/use-payment-status";
import { GradientOrbs } from "@/components/gradient-orbs";
import { GlassmorphicCard } from "@/components/glassmorphic-card";
import { CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { paymentEvents } from "@/lib/gtm";

export default function PaymentSuccess() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { refetch } = usePaymentStatus();
  const [isVerifying, setIsVerifying] = useState(true);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session_id');
    
    if (sessionId) {
      // First, try to manually verify the payment (for when webhook fails)
      const verifyPayment = async () => {
        try {
          const { apiRequest } = await import('@/lib/queryClient');
          const res = await apiRequest("POST", "/api/payment/verify-session", {
            sessionId: sessionId
          });
          const result = await res.json();
          
          if (result.success) {
            // Payment verified, invalidate and refetch
            queryClient.invalidateQueries({ queryKey: ["/api/payment/status"] });
            // Also invalidate sector data cache so it can refetch with premium access
            queryClient.invalidateQueries({ queryKey: ["/api/sectors/aggregated"] });
            await refetch();
            
            // Track payment success
            const purchaseType = result.purchaseType || 'premium'; // 'premium' or 'credits'
            const option = result.option || 'premium_20'; // e.g., 'premium_20', 'credits_40'
            const priceMap: Record<string, number> = {
              'premium_20': 9.99,
              'premium_80': 14.99,
              'credits_40': 9.99,
              'credits_80': 14.99,
            };
            const value = result.amount || priceMap[option] || 0;
            paymentEvents.paymentSuccess(
              purchaseType as 'premium' | 'credits',
              option,
              value,
              sessionId
            );
            
            setIsVerifying(false);
            toast({
              title: "Payment Verified!",
              description: "Your premium features have been unlocked.",
            });
            
            setTimeout(() => {
              setLocation('/');
            }, 2000);
            return true;
          }
        } catch (error) {
          console.error("Manual verification failed, will poll for webhook:", error);
        }
        return false;
      };

      // Try manual verification first, then poll if it fails
      verifyPayment().then((verified) => {
        if (!verified) {
          // If manual verification failed, poll for webhook
          queryClient.invalidateQueries({ queryKey: ["/api/payment/status"] });
          
          const checkPaymentStatus = async () => {
            let attempts = 0;
            const maxAttempts = 10; // Check for up to 10 seconds
            
            const poll = async () => {
              attempts++;
              await refetch();
              
              const currentStatus = queryClient.getQueryData<{ hasPaid: boolean }>(["/api/payment/status"]);
              
              if (currentStatus?.hasPaid) {
                // Also invalidate sector data cache so it can refetch with premium access
                queryClient.invalidateQueries({ queryKey: ["/api/sectors/aggregated"] });
                
                // Track payment success (with default values if details not available)
                // Note: We may not have full purchase details from polling, so use defaults
                paymentEvents.paymentSuccess(
                  'premium',
                  'premium_20',
                  9.99,
                  sessionId
                );
                
                setIsVerifying(false);
                toast({
                  title: "Payment Verified!",
                  description: "Your premium features have been unlocked.",
                });
                
                setTimeout(() => {
                  setLocation('/');
                }, 2000);
              } else if (attempts < maxAttempts) {
                setTimeout(poll, 1000);
              } else {
                setIsVerifying(false);
                toast({
                  title: "Payment Processing",
                  description: "Your payment is being processed. Features will unlock shortly.",
                });
                setTimeout(() => {
                  setLocation('/');
                }, 3000);
              }
            };
            
            setTimeout(poll, 500);
          };
          
          checkPaymentStatus();
        }
      });
    } else {
      setLocation('/');
    }
  }, [setLocation, toast, refetch]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <GradientOrbs />
      <div className="relative z-10">
        <GlassmorphicCard className="p-8 text-center max-w-md">
          <div className="flex flex-col items-center gap-4">
            <div className="p-3 rounded-full bg-primary/10">
              <CheckCircle className="h-12 w-12 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-white">Payment Successful!</h1>
            {isVerifying ? (
              <>
                <p className="text-white/60">
                  Verifying your payment... This may take a moment.
                </p>
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </>
            ) : (
              <>
                <p className="text-white/60">
                  Your premium features have been unlocked! Redirecting you back...
                </p>
                <Button
                  onClick={() => setLocation('/')}
                  className="mt-4"
                >
                  Go to Dashboard
                </Button>
              </>
            )}
          </div>
        </GlassmorphicCard>
      </div>
    </div>
  );
}

