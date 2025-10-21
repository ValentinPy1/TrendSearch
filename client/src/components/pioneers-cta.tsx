import { GlassmorphicCard } from "./glassmorphic-card";
import { Button } from "./ui/button";
import { Sparkles, ArrowRight, Trophy, Users } from "lucide-react";

export function PioneersCTA() {
  return (
    <GlassmorphicCard className="relative overflow-hidden">
      {/* Gradient Orbs Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-secondary/20 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
      </div>

      <div className="relative p-8 md:p-12">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-start gap-6 flex-col md:flex-row">
            {/* Icon Section */}
            <div className="flex-shrink-0">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-secondary via-primary to-white/80 flex items-center justify-center">
                <Sparkles className="w-8 h-8 text-white" />
              </div>
            </div>

            {/* Content Section */}
            <div className="flex-1 space-y-4">
              <div>
                <h3 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-secondary via-primary to-white bg-clip-text text-transparent mb-2">
                  Ready to Build Your Idea?
                </h3>
                <p className="text-base text-white/80 leading-relaxed">
                  Join <span className="font-semibold text-white">Pioneers AI Lab</span> — a 3-month AI studio program at Station F in Paris. 
                  Build your validated startup idea with weekly mentorship, shared tech infrastructure, and a shot at <span className="text-primary font-semibold">€100k funding</span> at Demo Day.
                </p>
              </div>

              {/* Features */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-start gap-3">
                  <Trophy className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-white">€100k Prize</p>
                    <p className="text-xs text-white/60">Win funding at Demo Day</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Users className="w-5 h-5 text-secondary flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-white">Elite Cohort</p>
                    <p className="text-xs text-white/60">Top 8 AI builders in Europe</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Sparkles className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-white">Solo Friendly</p>
                    <p className="text-xs text-white/60">No co-founder required</p>
                  </div>
                </div>
              </div>

              {/* CTA Button */}
              <div className="pt-2">
                <a 
                  href="https://www.pioneerslab.ai/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  data-testid="link-pioneers-cta"
                >
                  <Button 
                    size="lg"
                    className="bg-gradient-to-r from-secondary to-primary hover:from-secondary/90 hover:to-primary/90 text-white border-0 group"
                  >
                    <span>Join Pioneers AI Lab</span>
                    <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </GlassmorphicCard>
  );
}
