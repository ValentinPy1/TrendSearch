import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { GlassmorphicCard } from "@/components/glassmorphic-card";
import { 
  Sparkles, 
  TrendingUp, 
  Zap, 
  BarChart3, 
  Target, 
  CheckCircle2,
  ArrowRight,
  Search,
  Lightbulb,
  Shield,
  Clock
} from "lucide-react";

export default function LandingPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen">
      {/* Navigation Header */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <span className="text-2xl font-bold bg-gradient-to-r from-primary via-secondary to-primary bg-clip-text text-transparent">
                Trends Search
              </span>
            </div>
            <div className="flex items-center gap-4">
              <Button 
                variant="ghost" 
                onClick={() => setLocation("/auth")}
                className="text-white/80 hover:text-white"
              >
                Sign In
              </Button>
              <Button 
                onClick={() => setLocation("/auth?signup=true")}
                className="bg-primary hover:bg-primary/90"
              >
                Get Started
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-20 pb-32 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center space-y-8">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium">
              <Sparkles className="h-4 w-4" />
              <span>AI-Powered Market Validation</span>
            </div>

            {/* Headline */}
            <h1 className="text-6xl md:text-7xl font-bold text-white leading-tight">
              Stop Building Products
              <br />
              <span className="bg-gradient-to-r from-primary via-secondary to-primary bg-clip-text text-transparent">
                Nobody Searches For
              </span>
            </h1>

            {/* Subheadline */}
            <p className="text-xl md:text-2xl text-white/70 max-w-3xl mx-auto leading-relaxed">
              Validate your startup ideas in <strong className="text-white">seconds</strong> with real Google Ads data. 
              Discover trending opportunities, analyze market demand, and build products people actually want.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <Button 
                size="lg" 
                className="text-lg px-8 py-6 h-auto group"
                onClick={() => setLocation("/auth?signup=true")}
              >
                Start Validating Ideas Free
                <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Button>
              <Button 
                size="lg" 
                variant="outline"
                className="text-lg px-8 py-6 h-auto border-white/20 hover:bg-white/5"
                onClick={() => setLocation("/auth")}
              >
                Sign In
              </Button>
            </div>

            {/* Trust Signal */}
            <p className="text-sm text-white/50 pt-4">
              No credit card required • Instant access • 80,000+ keywords analyzed
            </p>
          </div>
        </div>
      </section>

      {/* Problem Section */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <GlassmorphicCard className="p-8 md:p-12">
            <div className="text-center space-y-6">
              <h2 className="text-4xl font-bold text-white">
                The Hidden Cost of Building Blind
              </h2>
              <p className="text-lg text-white/70 max-w-2xl mx-auto">
                Most entrepreneurs waste <strong className="text-white">weeks or months</strong> building products 
                that solve problems nobody is actively searching for. By the time they realize there's no market demand, 
                it's too late.
              </p>
              <div className="grid md:grid-cols-3 gap-6 pt-8">
                <div className="space-y-2">
                  <div className="text-3xl font-bold text-destructive">90%</div>
                  <div className="text-white/60">of startups fail</div>
                </div>
                <div className="space-y-2">
                  <div className="text-3xl font-bold text-warning">$50K+</div>
                  <div className="text-white/60">wasted on failed ideas</div>
                </div>
                <div className="space-y-2">
                  <div className="text-3xl font-bold text-primary">Hours</div>
                  <div className="text-white/60">spent on manual research</div>
                </div>
              </div>
            </div>
          </GlassmorphicCard>
        </div>
      </section>

      {/* Solution Section */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-white">
              Validate Ideas in <span className="text-primary">Seconds</span>, Not Weeks
            </h2>
            <p className="text-xl text-white/70 max-w-2xl mx-auto">
              Get instant market insights using real Google Ads keyword data—no expensive tools or manual research required.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Feature 1 */}
            <GlassmorphicCard className="p-6 space-y-4">
              <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
                <Lightbulb className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold text-white">AI Idea Generation</h3>
              <p className="text-white/60">
                Stuck for ideas? Our AI generates focused microSaaS concepts based on proven principles—perfect for when you're facing blank page syndrome.
              </p>
            </GlassmorphicCard>

            {/* Feature 2 */}
            <GlassmorphicCard className="p-6 space-y-4">
              <div className="w-12 h-12 rounded-xl bg-secondary/20 flex items-center justify-center">
                <Search className="h-6 w-6 text-secondary" />
              </div>
              <h3 className="text-xl font-semibold text-white">Semantic Keyword Search</h3>
              <p className="text-white/60">
                Find relevant keywords even without exact matches. Our vector-based search understands context and intent, not just keywords.
              </p>
            </GlassmorphicCard>

            {/* Feature 3 */}
            <GlassmorphicCard className="p-6 space-y-4">
              <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold text-white">Real Trend Data</h3>
              <p className="text-white/60">
                See 12 months of search volume trends. Understand if markets are growing, stable, or declining before you commit.
              </p>
            </GlassmorphicCard>

            {/* Feature 4 */}
            <GlassmorphicCard className="p-6 space-y-4">
              <div className="w-12 h-12 rounded-xl bg-secondary/20 flex items-center justify-center">
                <Target className="h-6 w-6 text-secondary" />
              </div>
              <h3 className="text-xl font-semibold text-white">Opportunity Scoring</h3>
              <p className="text-white/60">
                Our proprietary algorithm combines market size, growth trends, competition, and ad economics into one clear opportunity score.
              </p>
            </GlassmorphicCard>

            {/* Feature 5 */}
            <GlassmorphicCard className="p-6 space-y-4">
              <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
                <BarChart3 className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold text-white">80,000+ Keywords</h3>
              <p className="text-white/60">
                Access pre-analyzed Google Ads keyword data. No account setup, no expensive subscriptions—just instant insights.
              </p>
            </GlassmorphicCard>

            {/* Feature 6 */}
            <GlassmorphicCard className="p-6 space-y-4">
              <div className="w-12 h-12 rounded-xl bg-secondary/20 flex items-center justify-center">
                <Zap className="h-6 w-6 text-secondary" />
              </div>
              <h3 className="text-xl font-semibold text-white">Instant Results</h3>
              <p className="text-white/60">
                Get comprehensive market reports in seconds. What used to take days of research now happens at the click of a button.
              </p>
            </GlassmorphicCard>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-20 px-4 bg-white/5">
        <div className="max-w-6xl mx-auto">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-white">
              Why Entrepreneurs Choose Trends Search
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div className="flex gap-4">
                <CheckCircle2 className="h-6 w-6 text-primary flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-lg font-semibold text-white mb-2">Save Time & Money</h3>
                  <p className="text-white/60">
                    Validate ideas before you build. Avoid wasting weeks on products with no market demand.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <CheckCircle2 className="h-6 w-6 text-primary flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-lg font-semibold text-white mb-2">Data-Driven Decisions</h3>
                  <p className="text-white/60">
                    Make decisions based on real search data, not gut feelings or assumptions.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <CheckCircle2 className="h-6 w-6 text-primary flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-lg font-semibold text-white mb-2">No Expensive Tools</h3>
                  <p className="text-white/60">
                    Access Google Ads keyword data without needing a Google Ads account or paying for premium research tools.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="flex gap-4">
                <CheckCircle2 className="h-6 w-6 text-primary flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-lg font-semibold text-white mb-2">Prioritize Opportunities</h3>
                  <p className="text-white/60">
                    Compare multiple ideas objectively using our opportunity scoring system.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <CheckCircle2 className="h-6 w-6 text-primary flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-lg font-semibold text-white mb-2">Understand Market Timing</h3>
                  <p className="text-white/60">
                    See if markets are growing or declining. Enter at the right time with trend analysis.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <CheckCircle2 className="h-6 w-6 text-primary flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-lg font-semibold text-white mb-2">Track Your Ideas</h3>
                  <p className="text-white/60">
                    Save and compare ideas over time. Build a library of validated opportunities.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof Section */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <GlassmorphicCard className="p-8 md:p-12">
            <div className="text-center space-y-8">
              <div className="grid md:grid-cols-3 gap-8">
                <div className="space-y-2">
                  <div className="text-4xl font-bold text-primary">80K+</div>
                  <div className="text-white/60">Keywords Analyzed</div>
                </div>
                <div className="space-y-2">
                  <div className="text-4xl font-bold text-primary">Instant</div>
                  <div className="text-white/60">Market Validation</div>
                </div>
                <div className="space-y-2">
                  <div className="text-4xl font-bold text-primary">$0</div>
                  <div className="text-white/60">To Get Started</div>
                </div>
              </div>
            </div>
          </GlassmorphicCard>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-white">
              How It Works
            </h2>
            <p className="text-xl text-white/70 max-w-2xl mx-auto">
              Three simple steps to validate any startup idea
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto text-2xl font-bold text-primary">
                1
              </div>
              <h3 className="text-xl font-semibold text-white">Enter Your Idea</h3>
              <p className="text-white/60">
                Type in your startup idea or use our AI to generate one. No need for perfect wording—we understand context.
              </p>
            </div>

            <div className="text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-secondary/20 flex items-center justify-center mx-auto text-2xl font-bold text-secondary">
                2
              </div>
              <h3 className="text-xl font-semibold text-white">Get Instant Analysis</h3>
              <p className="text-white/60">
                Our AI finds relevant keywords, analyzes trends, calculates opportunity scores, and shows you market demand in seconds.
              </p>
            </div>

            <div className="text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto text-2xl font-bold text-primary">
                3
              </div>
              <h3 className="text-xl font-semibold text-white">Make Decisions</h3>
              <p className="text-white/60">
                Review trends, competition, and opportunity scores. Build what people are searching for, or pivot to better opportunities.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section id="signup" className="py-32 px-4">
        <div className="max-w-4xl mx-auto">
          <GlassmorphicCard className="p-12 md:p-16 text-center space-y-8">
            <div className="space-y-4">
              <h2 className="text-4xl md:text-5xl font-bold text-white">
                Ready to Build Products People Actually Want?
              </h2>
              <p className="text-xl text-white/70 max-w-2xl mx-auto">
                Join entrepreneurs who validate ideas before building. Start discovering high-potential opportunities today.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <Button 
                size="lg" 
                className="text-lg px-10 py-7 h-auto group"
                onClick={() => setLocation("/auth?signup=true")}
              >
                Create Free Account
                <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </div>

            <div className="pt-8 space-y-4">
              <div className="flex items-center justify-center gap-6 flex-wrap text-sm text-white/60">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  <span>No credit card required</span>
                </div>
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  <span>Instant access</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  <span>Setup in 30 seconds</span>
                </div>
              </div>
            </div>
          </GlassmorphicCard>
        </div>
      </section>
    </div>
  );
}

