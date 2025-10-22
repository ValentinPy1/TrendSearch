import { Button } from "@/components/ui/button";
import { GlassmorphicCard } from "@/components/glassmorphic-card";
import logoImage from "@assets/image_1761146000585.png";

export default function Landing() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-4">
          <a
            href="https://www.pioneerslab.ai/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block"
          >
            <img src={logoImage} alt="Pioneers AI Lab" className="h-8 mx-auto mb-4" />
          </a>
          <h1 className="text-6xl font-bold bg-gradient-to-r from-secondary via-primary to-white bg-clip-text text-transparent mb-4">
            Idea Watcher
          </h1>
          <p className="text-lg text-white/80 leading-relaxed">
            Validate your startup ideas with AI-powered insights and real market data from 80,000+ keywords
          </p>
        </div>

        <GlassmorphicCard className="p-8">
          <div className="space-y-6">
            <div className="space-y-2 text-center">
              <h2 className="text-2xl font-semibold text-white">
                Welcome to Idea Watcher
              </h2>
              <p className="text-sm text-white/60">
                Sign in to start validating your startup ideas
              </p>
            </div>

            <div className="space-y-4">
              <Button
                asChild
                className="w-full h-12 text-base font-semibold"
                data-testid="button-login"
              >
                <a href="/api/login">
                  Continue with Replit
                </a>
              </Button>

              <p className="text-xs text-white/50 text-center">
                Supports Google, GitHub, X, Apple, and email login
              </p>
            </div>

            <div className="pt-4 border-t border-white/10">
              <div className="space-y-2 text-sm text-white/60">
                <p className="font-medium text-white/80">What you'll get:</p>
                <ul className="space-y-1 list-disc list-inside">
                  <li>AI-powered idea generation with GPT-4o-mini</li>
                  <li>Market validation with real keyword data</li>
                  <li>Search trends and competition analysis</li>
                  <li>12-month growth visualization</li>
                </ul>
              </div>
            </div>
          </div>
        </GlassmorphicCard>

        <p className="text-center text-sm text-white/40">
          By continuing, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  );
}
