import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { GlassmorphicCard } from "@/components/glassmorphic-card";
import {
    ArrowRight,
    Play,
    Zap,
    Shield
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
                            <span className="text-2xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
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
                                Start Validating Ideas
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

            {/* Features Section */}
            <section className="py-24 px-4">
                <div className="max-w-7xl mx-auto space-y-16">
                    {/* Feature 1 - Video Left */}
                    <div className="grid md:grid-cols-2 gap-8 items-center">
                        <div className="relative aspect-video rounded-lg overflow-hidden bg-gradient-to-br from-white/10 to-white/5 border border-white/10 hover:border-primary/30 transition-colors">
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-16 h-16 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center border border-white/20 hover:bg-primary/20 hover:border-primary/40 transition-all cursor-pointer">
                                    <Play className="h-8 w-8 text-white ml-1" />
                                </div>
                            </div>
                        </div>
                        <div className="space-y-4">
                            <h3 className="text-2xl font-semibold text-white">AI Idea Generation</h3>
                            <p className="text-white/70">
                                Generate focused microSaaS ideas with AI. Perfect for when you're stuck or need inspiration.
                            </p>
                        </div>
                    </div>

                    {/* Feature 2 - Video Right */}
                    <div className="grid md:grid-cols-2 gap-8 items-center">
                        <div className="space-y-4 order-2 md:order-1 md:text-right">
                            <h3 className="text-2xl font-semibold text-white">Semantic Keyword Search</h3>
                            <p className="text-white/70">
                                Find relevant keywords using vector-based semantic search. Understands context, not just exact matches.
                            </p>
                        </div>
                        <div className="relative aspect-video rounded-lg overflow-hidden bg-gradient-to-br from-white/10 to-white/5 border border-white/10 hover:border-secondary/30 transition-colors order-1 md:order-2">
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-16 h-16 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center border border-white/20 hover:bg-secondary/20 hover:border-secondary/40 transition-all cursor-pointer">
                                    <Play className="h-8 w-8 text-white ml-1" />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Feature 3 - Video Left */}
                    <div className="grid md:grid-cols-2 gap-8 items-center">
                        <div className="relative aspect-video rounded-lg overflow-hidden bg-gradient-to-br from-white/10 to-white/5 border border-white/10 hover:border-primary/30 transition-colors">
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-16 h-16 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center border border-white/20 hover:bg-primary/20 hover:border-primary/40 transition-all cursor-pointer">
                                    <Play className="h-8 w-8 text-white ml-1" />
                                </div>
                            </div>
                        </div>
                        <div className="space-y-4">
                            <h3 className="text-2xl font-semibold text-white">Real Trend Data</h3>
                            <p className="text-white/70">
                                See 12 months of search volume trends. Understand if markets are growing or declining.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Final CTA Section */}
            <section id="signup" className="py-32 px-4">
                <div className="max-w-4xl mx-auto flex justify-center">
                    <Button
                        size="lg"
                        className="text-lg px-12 py-8 h-auto group rounded-full shadow-xl shadow-primary/30 hover:shadow-primary/50 transition-all duration-300 hover:scale-105"
                        onClick={() => setLocation("/auth?signup=true")}
                    >
                        Create Free Account
                        <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                    </Button>
                </div>
            </section>
        </div>
    );
}

