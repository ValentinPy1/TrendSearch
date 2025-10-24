// Based on blueprint:javascript_log_in_with_replit - Landing page for logged-out users
import { Button } from "@/components/ui/button";
import { GlassmorphicCard } from "@/components/glassmorphic-card";
import { GradientOrbs } from "@/components/gradient-orbs";

export default function Landing() {
  const handleLogin = () => {
    window.location.href = "/api/login";
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 overflow-hidden">
      <GradientOrbs />
      
      <div className="relative z-10 w-full max-w-4xl space-y-8">
        <div className="text-center">
          <h1 className="text-6xl md:text-7xl font-bold bg-gradient-to-r from-secondary via-primary to-white bg-clip-text text-transparent mb-6">
            Trends Search
          </h1>
          <p className="text-xl text-white/80 mb-4 leading-relaxed max-w-2xl mx-auto">
            Validate your startup ideas with real market data from Google Ads. Get insights on search volume, competition, and growth trends.
          </p>
        </div>

        <GlassmorphicCard className="p-8 md:p-12">
          <div className="space-y-8">
            <div className="text-center">
              <h2 className="text-3xl font-semibold text-white mb-4">
                Start Validating Your Ideas
              </h2>
              <p className="text-base text-white/70 mb-6">
                Generate AI-powered startup ideas or validate your own with real keyword data, search trends, and market insights from 80,000+ keywords.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              <div className="text-center p-6 rounded-lg bg-white/5">
                <div className="text-4xl mb-4">🤖</div>
                <h3 className="text-lg font-semibold text-white mb-2">AI-Powered Ideas</h3>
                <p className="text-sm text-white/60">Generate focused microSaaS ideas with GPT-4o-mini</p>
              </div>
              
              <div className="text-center p-6 rounded-lg bg-white/5">
                <div className="text-4xl mb-4">📊</div>
                <h3 className="text-lg font-semibold text-white mb-2">Real Market Data</h3>
                <p className="text-sm text-white/60">80,157 keywords with actual search volume and trends</p>
              </div>
              
              <div className="text-center p-6 rounded-lg bg-white/5">
                <div className="text-4xl mb-4">📈</div>
                <h3 className="text-lg font-semibold text-white mb-2">Growth Insights</h3>
                <p className="text-sm text-white/60">12-month trends with sustained growth metrics</p>
              </div>
            </div>

            <div className="text-center pt-4">
              <Button
                size="lg"
                className="text-lg px-8 py-6 h-auto"
                onClick={handleLogin}
                data-testid="button-login"
              >
                Get Started
              </Button>
              <p className="text-sm text-white/50 mt-4">
                Sign in with your Replit account
              </p>
            </div>
          </div>
        </GlassmorphicCard>

        <div className="text-center text-white/60 text-sm">
          <p>Powered by real Google Ads keyword data and semantic search</p>
        </div>
      </div>
    </div>
  );
}
