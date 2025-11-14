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
                                className="text-white/80 hover:text-white rounded-full"
                            >
                                Sign In
                            </Button>
                            <Button
                                onClick={() => setLocation("/auth?signup=true")}
                                className="bg-primary hover:bg-primary/90 rounded-full"
                            >
                                Get Started
                            </Button>
                        </div>
                    </div>
                </div>
            </nav>

            {/* Hero Section */}
            <section className="relative pt-40 pb-32 px-4 overflow-hidden">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center space-y-10">
                        {/* Decorative Element */}
                        <div className="flex justify-center">
                            <div className="h-1 w-24 bg-gradient-to-r from-transparent via-primary to-transparent rounded-full"></div>
                        </div>

                        {/* Headline */}
                        <div className="space-y-4">
                            <h1 className="text-6xl md:text-7xl lg:text-8xl font-bold text-white leading-[1.1] tracking-tight">
                                Stop Building Products
                                <br />
                                <span className="bg-gradient-to-r from-primary via-secondary to-primary bg-clip-text text-transparent animate-gradient">
                                    Nobody Searches For
                                </span>
                            </h1>
                        </div>

                        {/* Subheadline */}
                        <p className="text-xl md:text-2xl text-white/80 max-w-3xl mx-auto leading-relaxed font-light">
                            Find and validate your startup ideas in <strong className="text-white font-semibold">seconds</strong> with real Google Ads data.
                            Discover trending opportunities, analyze market demand, and build products people actually want.
                        </p>

                        {/* CTA Buttons */}
                        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-6">
                            <Button
                                size="lg"
                                className="text-lg px-10 py-7 h-auto group rounded-full shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all duration-300 hover:scale-105"
                                onClick={() => setLocation("/auth?signup=true")}
                            >
                                Start Validating Ideas Free
                                <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                            </Button>
                        </div>

                        {/* Trust Signal */}
                        <div className="pt-6">
                            <div className="inline-flex items-center gap-6 px-6 py-3 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm">
                                <div className="flex items-center gap-2 text-sm text-white/70">
                                    <Shield className="h-4 w-4 text-primary" />
                                    <span>No credit card</span>
                                </div>
                                <div className="h-4 w-px bg-white/20"></div>
                                <div className="flex items-center gap-2 text-sm text-white/70">
                                    <Zap className="h-4 w-4 text-secondary" />
                                    <span>Instant access</span>
                                </div>
                                <div className="h-4 w-px bg-white/20"></div>
                                <div className="text-sm text-white/70">
                                    <span className="font-semibold text-white">80K+</span> keywords
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Problem Section */}
            <section className="py-24 px-4 relative">
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/5 to-transparent"></div>
                <div className="max-w-6xl mx-auto relative">
                    <GlassmorphicCard className="p-8 md:p-12 border-2 border-white/10 hover:border-primary/30 transition-colors duration-300">
                        <div className="text-center space-y-8">
                            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-destructive/10 border border-destructive/20 text-destructive text-sm font-medium">
                                The Problem
                            </div>
                            <h2 className="text-4xl md:text-5xl font-bold text-white">
                                The Hidden Cost of Building Blind
                            </h2>
                            <p className="text-lg text-white/80 max-w-2xl mx-auto leading-relaxed">
                                Most entrepreneurs waste <strong className="text-white font-semibold">weeks or months</strong> building products
                                that solve problems nobody is actively searching for. By the time they realize there's no market demand,
                                it's too late.
                            </p>
                            <div className="grid md:grid-cols-3 gap-8 pt-8">
                                <div className="space-y-3 p-6 rounded-xl bg-white/5 border border-white/10 hover:border-destructive/30 transition-all duration-300">
                                    <div className="text-5xl font-bold text-destructive">90%</div>
                                    <div className="text-white/70 font-medium">of startups fail</div>
                                </div>
                                <div className="space-y-3 p-6 rounded-xl bg-white/5 border border-white/10 hover:border-warning/30 transition-all duration-300">
                                    <div className="text-5xl font-bold text-warning">$50K+</div>
                                    <div className="text-white/70 font-medium">wasted on failed ideas</div>
                                </div>
                                <div className="space-y-3 p-6 rounded-xl bg-white/5 border border-white/10 hover:border-primary/30 transition-all duration-300">
                                    <div className="text-5xl font-bold text-primary">Hours</div>
                                    <div className="text-white/70 font-medium">spent on manual research</div>
                                </div>
                            </div>
                        </div>
                    </GlassmorphicCard>
                </div>
            </section>

            {/* Solution Section */}
            <section className="py-24 px-4">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center space-y-6 mb-20">
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium">
                            The Solution
                        </div>
                        <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white">
                            Validate Ideas in <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">Seconds</span>, Not Weeks
                        </h2>
                        <p className="text-xl text-white/80 max-w-2xl mx-auto leading-relaxed">
                            Get instant market insights using real Google Ads keyword data—no expensive tools or manual research required.
                        </p>
                    </div>

                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {/* Feature 1 */}
                        <GlassmorphicCard className="p-6 space-y-4 group hover:border-primary/30 transition-all duration-300 hover:scale-[1.02] cursor-default">
                            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                                <Lightbulb className="h-7 w-7 text-primary" />
                            </div>
                            <h3 className="text-xl font-semibold text-white">AI Idea Generation</h3>
                            <p className="text-white/70 leading-relaxed">
                                Stuck for ideas? Our AI generates focused microSaaS concepts based on proven principles—perfect for when you're facing blank page syndrome.
                            </p>
                        </GlassmorphicCard>

                        {/* Feature 2 */}
                        <GlassmorphicCard className="p-6 space-y-4 group hover:border-secondary/30 transition-all duration-300 hover:scale-[1.02] cursor-default">
                            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-secondary/30 to-secondary/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                                <Search className="h-7 w-7 text-secondary" />
                            </div>
                            <h3 className="text-xl font-semibold text-white">Semantic Keyword Search</h3>
                            <p className="text-white/70 leading-relaxed">
                                Find relevant keywords even without exact matches. Our vector-based search understands context and intent, not just keywords.
                            </p>
                        </GlassmorphicCard>

                        {/* Feature 3 */}
                        <GlassmorphicCard className="p-6 space-y-4 group hover:border-primary/30 transition-all duration-300 hover:scale-[1.02] cursor-default">
                            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                                <TrendingUp className="h-7 w-7 text-primary" />
                            </div>
                            <h3 className="text-xl font-semibold text-white">Real Trend Data</h3>
                            <p className="text-white/70 leading-relaxed">
                                See 12 months of search volume trends. Understand if markets are growing, stable, or declining before you commit.
                            </p>
                        </GlassmorphicCard>

                        {/* Feature 4 */}
                        <GlassmorphicCard className="p-6 space-y-4 group hover:border-secondary/30 transition-all duration-300 hover:scale-[1.02] cursor-default">
                            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-secondary/30 to-secondary/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                                <Target className="h-7 w-7 text-secondary" />
                            </div>
                            <h3 className="text-xl font-semibold text-white">Opportunity Scoring</h3>
                            <p className="text-white/70 leading-relaxed">
                                Our proprietary algorithm combines market size, growth trends, competition, and ad economics into one clear opportunity score.
                            </p>
                        </GlassmorphicCard>

                        {/* Feature 5 */}
                        <GlassmorphicCard className="p-6 space-y-4 group hover:border-primary/30 transition-all duration-300 hover:scale-[1.02] cursor-default">
                            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                                <BarChart3 className="h-7 w-7 text-primary" />
                            </div>
                            <h3 className="text-xl font-semibold text-white">80,000+ Keywords</h3>
                            <p className="text-white/70 leading-relaxed">
                                Access pre-analyzed Google Ads keyword data. No account setup, no expensive subscriptions—just instant insights.
                            </p>
                        </GlassmorphicCard>

                        {/* Feature 6 */}
                        <GlassmorphicCard className="p-6 space-y-4 group hover:border-secondary/30 transition-all duration-300 hover:scale-[1.02] cursor-default">
                            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-secondary/30 to-secondary/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                                <Zap className="h-7 w-7 text-secondary" />
                            </div>
                            <h3 className="text-xl font-semibold text-white">Instant Results</h3>
                            <p className="text-white/70 leading-relaxed">
                                Get comprehensive market reports in seconds. What used to take days of research now happens at the click of a button.
                            </p>
                        </GlassmorphicCard>
                    </div>
                </div>
            </section>

            {/* Benefits Section */}
            <section className="py-24 px-4 bg-gradient-to-b from-white/5 via-white/3 to-transparent relative">
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
                <div className="max-w-6xl mx-auto relative">
                    <div className="text-center space-y-6 mb-16">
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium">
                            Why Choose Us
                        </div>
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
            <section className="py-24 px-4">
                <div className="max-w-6xl mx-auto">
                    <GlassmorphicCard className="p-8 md:p-12 border-2 border-white/10">
                        <div className="text-center space-y-12">
                            <div className="space-y-2">
                                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium">
                                    By The Numbers
                                </div>
                            </div>
                            <div className="grid md:grid-cols-3 gap-8">
                                <div className="space-y-3 p-6 rounded-xl bg-gradient-to-br from-primary/10 to-transparent border border-primary/20">
                                    <div className="text-5xl md:text-6xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">80K+</div>
                                    <div className="text-white/70 font-medium">Keywords Analyzed</div>
                                </div>
                                <div className="space-y-3 p-6 rounded-xl bg-gradient-to-br from-secondary/10 to-transparent border border-secondary/20">
                                    <div className="text-5xl md:text-6xl font-bold bg-gradient-to-r from-secondary to-primary bg-clip-text text-transparent">Instant</div>
                                    <div className="text-white/70 font-medium">Market Validation</div>
                                </div>
                                <div className="space-y-3 p-6 rounded-xl bg-gradient-to-br from-primary/10 to-transparent border border-primary/20">
                                    <div className="text-5xl md:text-6xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">$0</div>
                                    <div className="text-white/70 font-medium">To Get Started</div>
                                </div>
                            </div>
                        </div>
                    </GlassmorphicCard>
                </div>
            </section>

            {/* How It Works */}
            <section className="py-24 px-4 bg-gradient-to-b from-transparent via-white/5 to-transparent">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center space-y-6 mb-20">
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium">
                            Simple Process
                        </div>
                        <h2 className="text-4xl md:text-5xl font-bold text-white">
                            How It Works
                        </h2>
                        <p className="text-xl text-white/80 max-w-2xl mx-auto leading-relaxed">
                            Three simple steps to validate any startup idea
                        </p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-8 relative">
                        {/* Connecting Line */}
                        <div className="hidden md:block absolute top-16 left-1/3 right-1/3 h-0.5 bg-gradient-to-r from-primary/50 via-secondary/50 to-primary/50"></div>

                        <div className="text-center space-y-6 relative z-10">
                            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 border-2 border-primary/30 flex items-center justify-center mx-auto text-3xl font-bold text-primary shadow-lg shadow-primary/20">
                                1
                            </div>
                            <h3 className="text-xl font-semibold text-white">Enter Your Idea</h3>
                            <p className="text-white/70 leading-relaxed">
                                Type in your startup idea or use our AI to generate one. No need for perfect wording—we understand context.
                            </p>
                        </div>

                        <div className="text-center space-y-6 relative z-10">
                            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-secondary/30 to-secondary/10 border-2 border-secondary/30 flex items-center justify-center mx-auto text-3xl font-bold text-secondary shadow-lg shadow-secondary/20">
                                2
                            </div>
                            <h3 className="text-xl font-semibold text-white">Get Instant Analysis</h3>
                            <p className="text-white/70 leading-relaxed">
                                Our AI finds relevant keywords, analyzes trends, calculates opportunity scores, and shows you market demand in seconds.
                            </p>
                        </div>

                        <div className="text-center space-y-6 relative z-10">
                            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 border-2 border-primary/30 flex items-center justify-center mx-auto text-3xl font-bold text-primary shadow-lg shadow-primary/20">
                                3
                            </div>
                            <h3 className="text-xl font-semibold text-white">Make Decisions</h3>
                            <p className="text-white/70 leading-relaxed">
                                Review trends, competition, and opportunity scores. Build what people are searching for, or pivot to better opportunities.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Final CTA Section */}
            <section id="signup" className="py-32 px-4 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/5 to-transparent"></div>
                <div className="max-w-4xl mx-auto relative">
                    <GlassmorphicCard className="p-12 md:p-16 text-center space-y-10 border-2 border-primary/20 hover:border-primary/40 transition-all duration-300">
                        <div className="space-y-6">
                            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium">
                                Get Started Today
                            </div>
                            <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight">
                                Ready to Build Products People Actually Want?
                            </h2>
                            <p className="text-xl text-white/80 max-w-2xl mx-auto leading-relaxed">
                                Join entrepreneurs who validate ideas before building. Start discovering high-potential opportunities today.
                            </p>
                        </div>

                        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-6">
                            <Button
                                size="lg"
                                className="text-lg px-12 py-8 h-auto group rounded-full shadow-xl shadow-primary/30 hover:shadow-primary/50 transition-all duration-300 hover:scale-105"
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

