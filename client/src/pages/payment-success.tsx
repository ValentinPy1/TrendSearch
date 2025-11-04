import { useEffect } from "react";
import { useLocation } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { GradientOrbs } from "@/components/gradient-orbs";
import { GlassmorphicCard } from "@/components/glassmorphic-card";
import { CheckCircle, Loader2 } from "lucide-react";

export default function PaymentSuccess() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session_id');
    
    if (sessionId) {
      // Invalidate payment status to refresh
      queryClient.invalidateQueries({ queryKey: ["/api/payment/status"] });
      toast({
        title: "Payment Successful!",
        description: "Your premium features have been unlocked.",
      });
      
      // Redirect to home after a short delay
      setTimeout(() => {
        setLocation('/');
      }, 2000);
    } else {
      // No session ID, redirect immediately
      setLocation('/');
    }
  }, [setLocation, toast]);

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
            <p className="text-white/60">
              Your premium features have been unlocked. Redirecting you back...
            </p>
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        </GlassmorphicCard>
      </div>
    </div>
  );
}

