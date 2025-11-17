import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { GlassmorphicCard } from "@/components/glassmorphic-card";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import {
    ArrowRight,
    Play,
    Zap,
    Shield,
    Pause,
    Maximize,
    Minimize
} from "lucide-react";
import logoImage from "@assets/image_1761146000585.png";

export default function LandingPage() {
    const [, setLocation] = useLocation();
    const [isVideoPlaying, setIsVideoPlaying] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    const videoContainerRef = useRef<HTMLDivElement>(null);

    const [isVideo2Playing, setIsVideo2Playing] = useState(false);
    const [isFullscreen2, setIsFullscreen2] = useState(false);
    const video2Ref = useRef<HTMLVideoElement>(null);
    const videoContainer2Ref = useRef<HTMLDivElement>(null);

    const [isVideo3Playing, setIsVideo3Playing] = useState(false);
    const [isFullscreen3, setIsFullscreen3] = useState(false);
    const video3Ref = useRef<HTMLVideoElement>(null);
    const videoContainer3Ref = useRef<HTMLDivElement>(null);

    const toggleFullscreen = async () => {
        if (!videoContainerRef.current) return;

        try {
            if (!document.fullscreenElement) {
                await videoContainerRef.current.requestFullscreen();
                setIsFullscreen(true);
            } else {
                await document.exitFullscreen();
                setIsFullscreen(false);
            }
        } catch (error) {
            console.error("Error toggling fullscreen:", error);
        }
    };

    const toggleFullscreen2 = async () => {
        if (!videoContainer2Ref.current) return;

        try {
            if (!document.fullscreenElement) {
                await videoContainer2Ref.current.requestFullscreen();
                setIsFullscreen2(true);
            } else {
                await document.exitFullscreen();
                setIsFullscreen2(false);
            }
        } catch (error) {
            console.error("Error toggling fullscreen:", error);
        }
    };

    const toggleFullscreen3 = async () => {
        if (!videoContainer3Ref.current) return;

        try {
            if (!document.fullscreenElement) {
                await videoContainer3Ref.current.requestFullscreen();
                setIsFullscreen3(true);
            } else {
                await document.exitFullscreen();
                setIsFullscreen3(false);
            }
        } catch (error) {
            console.error("Error toggling fullscreen:", error);
        }
    };

    // Listen for fullscreen changes
    useEffect(() => {
        const handleFullscreenChange = () => {
            const isFullscreenActive = !!document.fullscreenElement;
            setIsFullscreen(isFullscreenActive && document.fullscreenElement === videoContainerRef.current);
            setIsFullscreen2(isFullscreenActive && document.fullscreenElement === videoContainer2Ref.current);
            setIsFullscreen3(isFullscreenActive && document.fullscreenElement === videoContainer3Ref.current);
        };

        document.addEventListener("fullscreenchange", handleFullscreenChange);
        return () => {
            document.removeEventListener("fullscreenchange", handleFullscreenChange);
        };
    }, []);

    return (
        <div className="min-h-screen">
            {/* Navigation Header */}
            <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-b border-white/10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        <div className="flex items-center">
                            <img
                                src={logoImage}
                                alt="Pioneers AI Lab"
                                className="h-8"
                            />
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
                            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-white leading-[1.1] tracking-tight">
                                Stop Building Products
                                <br />
                                <span className="bg-gradient-to-r from-primary via-secondary to-primary bg-clip-text text-transparent animate-gradient">
                                    Nobody Searches For
                                </span>
                            </h1>
                        </div>

                        {/* Subheadline */}
                        <p className="text-xl md:text-2xl text-white/80 max-w-3xl mx-auto leading-relaxed font-light">
                            Discover high-potential startup ideas in <strong className="text-white font-semibold">seconds</strong> from 80,000+ real YC startup keywords with 15+ differents metrics. Including trends, economics, and opportunity scores.
                        </p>

                        {/* CTA Buttons */}
                        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-6">
                            <Button
                                size="lg"
                                className="text-lg px-10 py-7 h-auto group rounded-full shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all duration-300 hover:scale-105"
                                onClick={() => setLocation("/auth?signup=true")}
                            >
                                Start Discovering Ideas
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
                    {/* Feature 1 - YC Keywords Search */}
                    <div className="grid md:grid-cols-2 gap-8 items-center">
                        <div
                            ref={videoContainerRef}
                            className="relative aspect-video rounded-lg overflow-hidden bg-gradient-to-br from-white/10 to-white/5 border border-white/10 hover:border-primary/30 transition-colors group"
                        >
                            <video
                                ref={videoRef}
                                src="/YC Keywords explorer.mp4"
                                className="w-full h-full object-cover"
                                loop
                                muted
                                playsInline
                                onPlay={() => setIsVideoPlaying(true)}
                                onPause={() => setIsVideoPlaying(false)}
                            />
                            <button
                                onClick={() => {
                                    if (videoRef.current) {
                                        if (isVideoPlaying) {
                                            videoRef.current.pause();
                                        } else {
                                            videoRef.current.play();
                                        }
                                    }
                                }}
                                className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${isVideoPlaying
                                    ? 'opacity-0 group-hover:opacity-100 bg-black/10'
                                    : 'opacity-100 bg-black/20'
                                    }`}
                            >
                                <div className="w-16 h-16 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center border border-white/20 hover:bg-primary/20 hover:border-primary/40 transition-all cursor-pointer">
                                    {isVideoPlaying ? (
                                        <Pause className="h-8 w-8 text-white" />
                                    ) : (
                                        <Play className="h-8 w-8 text-white ml-1" />
                                    )}
                                </div>
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    toggleFullscreen();
                                }}
                                className={`absolute bottom-4 right-4 p-2 rounded-lg bg-black/60 hover:bg-black/80 backdrop-blur-sm border border-white/20 hover:border-primary/40 transition-opacity duration-300 cursor-pointer z-10 ${isFullscreen || !isVideoPlaying
                                    ? 'opacity-100'
                                    : 'opacity-0 group-hover:opacity-100'
                                    }`}
                                aria-label="Toggle fullscreen"
                            >
                                {isFullscreen ? (
                                    <Minimize className="h-5 w-5 text-white" />
                                ) : (
                                    <Maximize className="h-5 w-5 text-white" />
                                )}
                            </button>
                        </div>
                        <div className="space-y-4">
                            <h3 className="text-2xl font-semibold text-white">YC Keywords Explorer</h3>
                            <p className="text-white/70">
                                Enter any idea or pitch and instantly discover the most relevant keywords from 80,000+ YC startup keywords. Evaluate volume, trends, economics, competition, and opportunities for each keyword. Get an aggregate report of all selected keywords and use filters to find keywords with specific metrics, perfect for data-backed brainstorming.
                            </p>
                        </div>
                    </div>

                    {/* Feature 2 - Sector Browsing */}
                    <div className="grid md:grid-cols-2 gap-8 items-center">
                        <div className="space-y-4 order-2 md:order-1 md:text-right">
                            <h3 className="text-2xl font-semibold text-white">Sector Watcher</h3>
                            <p className="text-white/70">
                                Browse through all YC sectors and explore companies within each sector. Rank them by volume, economics, trend, or opportunity for related keywords. Use YC pitches as starting points for keywords explorer to dive deeper into keyword opportunities.
                            </p>
                        </div>
                        <div
                            ref={videoContainer2Ref}
                            className="relative aspect-video rounded-lg overflow-hidden bg-gradient-to-br from-white/10 to-white/5 border border-white/10 hover:border-secondary/30 transition-colors order-1 md:order-2 group"
                        >
                            <video
                                ref={video2Ref}
                                src="/SectorBrowsing.mp4"
                                className="w-full h-full object-cover"
                                loop
                                muted
                                playsInline
                                onPlay={() => setIsVideo2Playing(true)}
                                onPause={() => setIsVideo2Playing(false)}
                            />
                            <button
                                onClick={() => {
                                    if (video2Ref.current) {
                                        if (isVideo2Playing) {
                                            video2Ref.current.pause();
                                        } else {
                                            video2Ref.current.play();
                                        }
                                    }
                                }}
                                className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${isVideo2Playing
                                    ? 'opacity-0 group-hover:opacity-100 bg-black/10'
                                    : 'opacity-100 bg-black/20'
                                    }`}
                            >
                                <div className="w-16 h-16 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center border border-white/20 hover:bg-secondary/20 hover:border-secondary/40 transition-all cursor-pointer">
                                    {isVideo2Playing ? (
                                        <Pause className="h-8 w-8 text-white" />
                                    ) : (
                                        <Play className="h-8 w-8 text-white ml-1" />
                                    )}
                                </div>
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    toggleFullscreen2();
                                }}
                                className={`absolute bottom-4 right-4 p-2 rounded-lg bg-black/60 hover:bg-black/80 backdrop-blur-sm border border-white/20 hover:border-secondary/40 transition-opacity duration-300 cursor-pointer z-10 ${isFullscreen2 || !isVideo2Playing
                                    ? 'opacity-100'
                                    : 'opacity-0 group-hover:opacity-100'
                                    }`}
                                aria-label="Toggle fullscreen"
                            >
                                {isFullscreen2 ? (
                                    <Minimize className="h-5 w-5 text-white" />
                                ) : (
                                    <Maximize className="h-5 w-5 text-white" />
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Feature 3 - Custom Search */}
                    <div className="grid md:grid-cols-2 gap-8 items-center">
                        <div
                            ref={videoContainer3Ref}
                            className="relative aspect-video rounded-lg overflow-hidden bg-gradient-to-br from-white/10 to-white/5 border border-white/10 hover:border-primary/30 transition-colors group"
                        >
                            <video
                                ref={video3Ref}
                                src="/CompetitorRadar.mp4"
                                className="w-full h-full object-cover"
                                loop
                                muted
                                playsInline
                                onPlay={() => setIsVideo3Playing(true)}
                                onPause={() => setIsVideo3Playing(false)}
                            />
                            <button
                                onClick={() => {
                                    if (video3Ref.current) {
                                        if (isVideo3Playing) {
                                            video3Ref.current.pause();
                                        } else {
                                            video3Ref.current.play();
                                        }
                                    }
                                }}
                                className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${isVideo3Playing
                                    ? 'opacity-0 group-hover:opacity-100 bg-black/10'
                                    : 'opacity-100 bg-black/20'
                                    }`}
                            >
                                <div className="w-16 h-16 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center border border-white/20 hover:bg-primary/20 hover:border-primary/40 transition-all cursor-pointer">
                                    {isVideo3Playing ? (
                                        <Pause className="h-8 w-8 text-white" />
                                    ) : (
                                        <Play className="h-8 w-8 text-white ml-1" />
                                    )}
                                </div>
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    toggleFullscreen3();
                                }}
                                className={`absolute bottom-4 right-4 p-2 rounded-lg bg-black/60 hover:bg-black/80 backdrop-blur-sm border border-white/20 hover:border-primary/40 transition-opacity duration-300 cursor-pointer z-10 ${isFullscreen3 || !isVideo3Playing
                                    ? 'opacity-100'
                                    : 'opacity-0 group-hover:opacity-100'
                                    }`}
                                aria-label="Toggle fullscreen"
                            >
                                {isFullscreen3 ? (
                                    <Minimize className="h-5 w-5 text-white" />
                                ) : (
                                    <Maximize className="h-5 w-5 text-white" />
                                )}
                            </button>
                        </div>
                        <div className="space-y-4">
                            <h3 className="text-2xl font-semibold text-white">Competitor Radar</h3>
                            <p className="text-white/70">
                                Find competitors in your space, then automatically generate the keywords they're targeting. Get the same comprehensive metrics, volume, trends, economics, competition, and opportunity scores, to either compete on the same demand or identify untapped gaps in the market.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* FAQ Section */}
            <section className="py-24 px-4 border-t border-white/10">
                <div className="max-w-4xl mx-auto">
                    <div className="text-center mb-12">
                        <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                            Frequently Asked Questions
                        </h2>
                        <p className="text-lg text-white/70">
                            Everything you need to know about Trends Search
                        </p>
                    </div>

                    <Accordion type="single" collapsible className="w-full space-y-4">
                        <AccordionItem value="item-1" className="border border-white/10 rounded-lg px-6 bg-white/5">
                            <AccordionTrigger className="text-white hover:no-underline py-6">
                                <span className="text-left font-semibold">What is Trends Search?</span>
                            </AccordionTrigger>
                            <AccordionContent className="text-white/70 pb-6">
                                Trends Search is a data-driven brainstorming tool designed for entrepreneurs looking for startup ideas. Generate ideas and discover related keywords to determine whether your concept is in a blue ocean (untapped market) or red ocean (competitive market).
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="item-2" className="border border-white/10 rounded-lg px-6 bg-white/5">
                            <AccordionTrigger className="text-white hover:no-underline py-6">
                                <span className="text-left font-semibold">How does it work?</span>
                            </AccordionTrigger>
                            <AccordionContent className="text-white/70 pb-6">
                                <p className="mb-3">If you already have ideas, type them into the YC keyword explorer search bar (keep it concise). You'll instantly find semantically related keywords with comprehensive metrics, including an aggregated opportunity score, 40 or more indicates a very good opportunity.</p>
                                <p>Don't have an idea yet? Let our AI generate one for you, or browse through sectors to discover trending keyword spaces.</p>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="item-3" className="border border-white/10 rounded-lg px-6 bg-white/5">
                            <AccordionTrigger className="text-white hover:no-underline py-6">
                                <span className="text-left font-semibold">Where does the data come from?</span>
                            </AccordionTrigger>
                            <AccordionContent className="text-white/70 pb-6">
                                <p className="mb-3">We scraped all 6,000+ Y Combinator startups and generated 80,000+ keywords from them. You can explore these keywords directly using the YC keywords explorer.</p>
                                <p>We've also aggregated keyword analytics by individual companies and by overall sectors to help you spot general opportunities. Explore these aggregated insights through our sector browsing feature.</p>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="item-4" className="border border-white/10 rounded-lg px-6 bg-white/5">
                            <AccordionTrigger className="text-white hover:no-underline py-6">
                                <span className="text-left font-semibold">What metrics are included for each keyword?</span>
                            </AccordionTrigger>
                            <AccordionContent className="text-white/70 pb-6">
                                <p className="mb-3">Each keyword includes 15+ different metrics, organized into two categories:</p>
                                <p className="mb-2"><strong className="text-white">First-order metrics</strong> (pulled directly from Google Ads): Historical and current search volumes, competition index, CPC, and top page bid.</p>
                                <p><strong className="text-white">Secondary metrics</strong> (computed from primary data): 3-month and YoY trends, volatility, trend strength, bid efficiency, total advertiser costs, serviceable advertiser costs, and opportunity score.</p>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="item-5" className="border border-white/10 rounded-lg px-6 bg-white/5">
                            <AccordionTrigger className="text-white hover:no-underline py-6">
                                <span className="text-left font-semibold">How much does it cost?</span>
                            </AccordionTrigger>
                            <AccordionContent className="text-white/70 pb-6">
                                <p className="mb-3">The YC keywords explorer is completely free with unlimited search, no credit card required.</p>
                                <p>Advanced features that require costly API requests (like custom keyword generation) are available through a premium account to help us cover operational expenses.</p>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="item-6" className="border border-white/10 rounded-lg px-6 bg-white/5">
                            <AccordionTrigger className="text-white hover:no-underline py-6">
                                <span className="text-left font-semibold">Are keywords up to date?</span>
                            </AccordionTrigger>
                            <AccordionContent className="text-white/70 pb-6">
                                <p className="mb-3">Yes! We update all keywords monthly to ensure they're always current and accurate.</p>
                                <p>For dedicated, on-demand keywords, use the Competitors Radar feature. Simply input your landing page URL or a competitor's landing page, and we'll generate fresh keywords instantly.</p>
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>
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
                        Explore keywords
                        <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                    </Button>
                </div>
            </section>
        </div>
    );
}

