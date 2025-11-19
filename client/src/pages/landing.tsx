import { useState, useRef, useEffect, useMemo } from "react";
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
    Minimize,
    Search,
    Loader2,
    ArrowUpDown,
    ArrowUp,
    ArrowDown
} from "lucide-react";
import { Input } from "@/components/ui/input";
import logoImage from "@assets/image_1761146000585.png";
import type { Keyword } from "@shared/schema";

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

    // Search state
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<Keyword[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);

    // Sort state
    type SortField = "keyword" | "volume" | "competition" | "cpc" | "growthYoy" | "opportunityScore";
    type SortDirection = "asc" | "desc" | null;
    const [sortField, setSortField] = useState<SortField | null>(null);
    const [sortDirection, setSortDirection] = useState<SortDirection>(null);

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

    const handleSearch = async () => {
        if (!searchQuery.trim()) return;

        setIsSearching(true);
        setHasSearched(true);
        try {
            const response = await fetch("/api/public/search-keywords", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ query: searchQuery.trim() }),
            });

            if (!response.ok) {
                throw new Error("Failed to search keywords");
            }

            const data = await response.json();
            setSearchResults(data.keywords || []);
        } catch (error) {
            console.error("Error searching keywords:", error);
            setSearchResults([]);
        } finally {
            setIsSearching(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.preventDefault();
            handleSearch();
        }
    };

    // Gradient helper functions (matching keywords-table.tsx)
    const getRedGradientText = (value: number) => {
        const normalizedValue = Math.min(1, Math.max(0, value / 100));
        const lightness = 100 - normalizedValue * 40;
        return { color: `hsl(0, 80%, ${lightness}%)` };
    };

    const getPurpleGradientText = (value: number, max: number) => {
        const normalizedValue = Math.min(1, value / max);
        const lightness = 100 - normalizedValue * 40;
        return { color: `hsl(250, 80%, ${lightness}%)` };
    };

    const getOrangeGradientText = (value: number, max: number = 100) => {
        const normalizedValue = Math.min(1, Math.max(0, value / max));

        // Interpolate from white (at 0) to yellow (at 100)
        // White: hsl(0, 0%, 100%) -> Yellow: hsl(50, 100%, 60%)
        if (normalizedValue === 0) {
            return { color: `hsl(0, 0%, 100%)` }; // Pure white at 0
        }

        // At 0: white (0% saturation, 100% lightness)
        // At 100: yellow (50 hue, 100% saturation, 60% lightness)
        const hue = 50;
        const saturation = normalizedValue * 100; // 0% to 100%
        const lightness = 100 - (normalizedValue * 40); // 100% to 60%

        return { color: `hsl(${hue}, ${saturation}%, ${lightness}%)` };
    };

    const getTrendGradientText = (value: number) => {
        if (value >= 0) {
            const normalizedValue = Math.min(1, value / 200);
            const lightness = 100 - normalizedValue * 50;
            return { color: `hsl(142, 70%, ${lightness}%)` };
        } else {
            const normalizedValue = Math.min(1, Math.abs(value) / 100);
            const lightness = 100 - normalizedValue * 50;
            return { color: `hsl(0, 80%, ${lightness}%)` };
        }
    };

    const formatTwoSignificantDigits = (value: number): string => {
        if (value === 0 || isNaN(value) || !isFinite(value)) {
            return "";
        }

        // Round to 2 significant digits
        const order = Math.floor(Math.log10(Math.abs(value)));
        const rounded = Math.round(value / Math.pow(10, order - 1)) * Math.pow(10, order - 1);

        // Format with millions (M) if >= 1,000,000
        if (rounded >= 1000000) {
            const inMillions = rounded / 1000000;
            // Round to 2 significant digits for the millions value
            const millionsOrder = Math.floor(Math.log10(Math.abs(inMillions)));
            const roundedMillions = Math.round(inMillions / Math.pow(10, millionsOrder - 1)) * Math.pow(10, millionsOrder - 1);
            return `${roundedMillions.toLocaleString('en-US', { maximumFractionDigits: 1 })}M`;
        }

        // Format with thousands (k) if >= 1,000
        if (rounded >= 1000) {
            const inThousands = rounded / 1000;
            // Round to 2 significant digits for the thousands value
            const thousandsOrder = Math.floor(Math.log10(Math.abs(inThousands)));
            const roundedThousands = Math.round(inThousands / Math.pow(10, thousandsOrder - 1)) * Math.pow(10, thousandsOrder - 1);
            return `${roundedThousands.toLocaleString('en-US', { maximumFractionDigits: 1 })}k`;
        }

        // Format with thousands separators for smaller values
        if (rounded >= 1) {
            return Math.round(rounded).toLocaleString('en-US');
        } else {
            // For small values, show up to 2 decimal places if needed
            return rounded.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
        }
    };

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            if (sortDirection === "desc") {
                setSortDirection("asc");
            } else if (sortDirection === "asc") {
                setSortDirection(null);
                setSortField(null);
            } else {
                setSortDirection("desc");
            }
        } else {
            setSortField(field);
            setSortDirection("desc");
        }
    };

    const SortIcon = ({ field }: { field: SortField }) => {
        if (sortField !== field) {
            return <ArrowUpDown className="h-4 w-4 ml-1 text-white/40" />;
        }
        if (sortDirection === "asc") {
            return <ArrowUp className="h-4 w-4 ml-1 text-primary" />;
        }
        return <ArrowDown className="h-4 w-4 ml-1 text-primary" />;
    };

    // Sort the search results
    const sortedResults = useMemo(() => {
        if (!sortField || !sortDirection) {
            return searchResults;
        }

        return [...searchResults].sort((a, b) => {
            let aVal: any;
            let bVal: any;

            switch (sortField) {
                case "keyword":
                    aVal = a.keyword?.toLowerCase() || "";
                    bVal = b.keyword?.toLowerCase() || "";
                    break;
                case "volume":
                    aVal = a.volume || 0;
                    bVal = b.volume || 0;
                    break;
                case "competition":
                    aVal = a.competition || 0;
                    bVal = b.competition || 0;
                    break;
                case "cpc":
                    aVal = parseFloat(a.cpc?.toString() || "0");
                    bVal = parseFloat(b.cpc?.toString() || "0");
                    break;
                case "growthYoy":
                    aVal = parseFloat(a.growthYoy?.toString() || "0");
                    bVal = parseFloat(b.growthYoy?.toString() || "0");
                    break;
                case "opportunityScore":
                    aVal = parseFloat(a.opportunityScore?.toString() || "0");
                    bVal = parseFloat(b.opportunityScore?.toString() || "0");
                    break;
            }

            if (sortDirection === "asc") {
                return aVal > bVal ? 1 : -1;
            } else {
                return aVal < bVal ? 1 : -1;
            }
        });
    }, [searchResults, sortField, sortDirection]);

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
                        <div className="flex items-center gap-2 sm:gap-4">
                            <Button
                                variant="ghost"
                                onClick={() => setLocation("/auth")}
                                className="text-white/80 hover:text-white rounded-full px-3 sm:px-4"
                                size="sm"
                            >
                                <span className="hidden sm:inline">Sign In</span>
                                <span className="sm:hidden">Sign In</span>
                            </Button>
                            <Button
                                onClick={() => setLocation("/auth?signup=true")}
                                className="bg-primary hover:bg-primary/90 rounded-full px-3 sm:px-4"
                                size="sm"
                            >
                                <span className="hidden sm:inline">Get Started</span>
                                <span className="sm:hidden">Start</span>
                            </Button>
                        </div>
                    </div>
                </div>
            </nav>

            {/* Hero Section */}
            <section className="relative pt-24 sm:pt-32 md:pt-40 pb-16 sm:pb-24 md:pb-32 px-4 overflow-hidden">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center space-y-6 sm:space-y-8 md:space-y-10">
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
                        <p className="text-lg sm:text-xl md:text-2xl text-white/80 max-w-3xl mx-auto leading-relaxed font-light px-2">
                            Discover high-potential startup ideas in <strong className="text-white font-semibold">seconds</strong> from 80,000+ real YC startup keywords with 15+ differents metrics. Including trends, economics, and opportunity scores.
                        </p>

                        {/* Search Bar */}
                        <div className="max-w-2xl mx-auto pt-8">
                            <div className="relative flex items-center gap-0">
                                <Input
                                    placeholder="Write a short pitch here and press enter to find semantically related keywords."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    className="w-full bg-white/5 border-white/10 text-white placeholder:text-white/40 focus:border-primary focus:ring-2 focus:ring-primary/20 h-14 px-6 pr-14 rounded-l-full rounded-r-none border-r-0"
                                />
                                <Button
                                    type="button"
                                    onClick={handleSearch}
                                    disabled={isSearching || !searchQuery.trim()}
                                    className="h-14 pl-6 pr-8 bg-white/5 border-white/10 text-white hover:bg-white/10 rounded-r-full rounded-l-none border-l-0 flex items-center justify-center"
                                >
                                    {isSearching ? (
                                        <Loader2 className="h-5 w-5 animate-spin" />
                                    ) : (
                                        <Search className="h-5 w-5" />
                                    )}
                                </Button>
                            </div>

                            {/* Search Results Table */}
                            {hasSearched && (
                                <div className="mt-6">
                                    {isSearching ? (
                                        <div className="text-center py-8 text-white/60">
                                            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                                            <p>Searching keywords...</p>
                                        </div>
                                    ) : searchResults.length > 0 ? (
                                        <div className="bg-white/5 border border-white/10 rounded-lg overflow-hidden">
                                            <div className="overflow-x-auto -mx-4 sm:mx-0">
                                                <div className="inline-block min-w-full align-middle">
                                                    <table className="w-full min-w-[640px]">
                                                        <thead>
                                                            <tr className="border-b border-white/10">
                                                                <th
                                                                    className="text-left px-2 sm:px-4 py-3 text-sm font-semibold text-white/90 cursor-pointer hover:bg-white/5 transition-colors"
                                                                    onClick={() => handleSort("keyword")}
                                                                >
                                                                    <div className="flex items-center">
                                                                        Keyword
                                                                        <SortIcon field="keyword" />
                                                                    </div>
                                                                </th>
                                                                <th
                                                                    className="text-right px-2 sm:px-4 py-3 text-sm font-semibold text-white/90 cursor-pointer hover:bg-white/5 transition-colors"
                                                                    onClick={() => handleSort("volume")}
                                                                >
                                                                    <div className="flex items-center justify-end">
                                                                        Volume
                                                                        <SortIcon field="volume" />
                                                                    </div>
                                                                </th>
                                                                <th
                                                                    className="text-right px-2 sm:px-4 py-3 text-sm font-semibold text-white/90 cursor-pointer hover:bg-white/5 transition-colors"
                                                                    onClick={() => handleSort("competition")}
                                                                >
                                                                    <div className="flex items-center justify-end">
                                                                        Competition
                                                                        <SortIcon field="competition" />
                                                                    </div>
                                                                </th>
                                                                <th
                                                                    className="text-right px-2 sm:px-4 py-3 text-sm font-semibold text-white/90 cursor-pointer hover:bg-white/5 transition-colors"
                                                                    onClick={() => handleSort("cpc")}
                                                                >
                                                                    <div className="flex items-center justify-end">
                                                                        CPC
                                                                        <SortIcon field="cpc" />
                                                                    </div>
                                                                </th>
                                                                <th
                                                                    className="text-right px-2 sm:px-4 py-3 text-sm font-semibold text-white/90 cursor-pointer hover:bg-white/5 transition-colors"
                                                                    onClick={() => handleSort("growthYoy")}
                                                                >
                                                                    <div className="flex items-center justify-end">
                                                                        YoY Trend
                                                                        <SortIcon field="growthYoy" />
                                                                    </div>
                                                                </th>
                                                                <th
                                                                    className="text-right px-2 sm:px-4 py-3 text-sm font-semibold text-white/90 cursor-pointer hover:bg-white/5 transition-colors"
                                                                    onClick={() => handleSort("opportunityScore")}
                                                                >
                                                                    <div className="flex items-center justify-end">
                                                                        Opportunity
                                                                        <SortIcon field="opportunityScore" />
                                                                    </div>
                                                                </th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {sortedResults.map((keyword, index) => {
                                                                // Calculate max CPC for gradient (relative to all results)
                                                                const maxCpc = Math.max(
                                                                    ...sortedResults
                                                                        .map((k) => parseFloat(k.cpc?.toString() || "0"))
                                                                        .filter((v) => !isNaN(v) && v > 0),
                                                                    1 // Default to 1 if no valid CPCs
                                                                );

                                                                return (
                                                                    <tr
                                                                        key={keyword.id || index}
                                                                        className="border-b border-white/5 hover:bg-white/5 transition-colors"
                                                                    >
                                                                        <td className="px-2 sm:px-4 py-3 text-white/90 font-medium">{keyword.keyword}</td>
                                                                        <td className="px-2 sm:px-4 py-3 text-right text-white/70">
                                                                            {keyword.volume !== null && keyword.volume !== undefined
                                                                                ? formatTwoSignificantDigits(keyword.volume)
                                                                                : "—"}
                                                                        </td>
                                                                        <td className="px-2 sm:px-4 py-3 text-right">
                                                                            {keyword.competition !== null && keyword.competition !== undefined ? (
                                                                                <span className="font-medium" style={getRedGradientText(keyword.competition)}>
                                                                                    {keyword.competition}
                                                                                </span>
                                                                            ) : (
                                                                                <span className="text-white/50">—</span>
                                                                            )}
                                                                        </td>
                                                                        <td className="px-2 sm:px-4 py-3 text-right">
                                                                            {keyword.cpc && parseFloat(keyword.cpc.toString()) > 0 ? (
                                                                                <span className="font-medium" style={getPurpleGradientText(parseFloat(keyword.cpc.toString()), maxCpc)}>
                                                                                    ${parseFloat(keyword.cpc.toString()).toFixed(2)}
                                                                                </span>
                                                                            ) : (
                                                                                <span className="text-white/50">—</span>
                                                                            )}
                                                                        </td>
                                                                        <td className="px-2 sm:px-4 py-3 text-right">
                                                                            {keyword.growthYoy !== null && keyword.growthYoy !== undefined && keyword.growthYoy !== "" ? (
                                                                                <span className="font-medium" style={getTrendGradientText(parseFloat(keyword.growthYoy.toString()))}>
                                                                                    {parseFloat(keyword.growthYoy.toString()) >= 0 ? "+" : ""}
                                                                                    {Math.round(parseFloat(keyword.growthYoy.toString()))}%
                                                                                </span>
                                                                            ) : (
                                                                                <span className="text-white/50">—</span>
                                                                            )}
                                                                        </td>
                                                                        <td className="px-2 sm:px-4 py-3 text-right">
                                                                            {keyword.opportunityScore !== null && keyword.opportunityScore !== undefined ? (
                                                                                <span className="font-medium" style={getOrangeGradientText(parseFloat(keyword.opportunityScore.toString()), 25)}>
                                                                                    {Math.round(parseFloat(keyword.opportunityScore.toString()))}
                                                                                </span>
                                                                            ) : (
                                                                                <span className="text-white/50">—</span>
                                                                            )}
                                                                        </td>
                                                                    </tr>
                                                                );
                                                            })}
                                                        </tbody>
                                                        <tfoot>
                                                            <tr>
                                                                <td colSpan={6} className="px-2 sm:px-4 py-3 border-t border-white/10">
                                                                    <div className="flex justify-center">
                                                                        <Button
                                                                            variant="ghost"
                                                                            className="text-sm px-4 py-2 h-auto group text-purple-400 hover:text-purple-300 hover:bg-white/5 transition-all"
                                                                            onClick={() => setLocation("/auth?signup=true")}
                                                                        >
                                                                            See more keywords and metrics
                                                                            <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                                                                        </Button>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        </tfoot>
                                                    </table>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-center py-8 text-white/60">
                                            <p>No keywords found. Try a different search query.</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </section>

            {/* Features Section */}
            <section className="py-12 sm:py-16 md:py-24 px-4">
                <div className="max-w-7xl mx-auto space-y-12 sm:space-y-16">
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
                            <h3 className="text-xl sm:text-2xl font-semibold text-white">YC Keywords Explorer</h3>
                            <p className="text-sm sm:text-base text-white/70">
                                Enter any idea or pitch and instantly discover the most relevant keywords from 80,000+ YC startup keywords. Evaluate volume, trends, economics, competition, and opportunities for each keyword. Get an aggregate report of all selected keywords and use filters to find keywords with specific metrics, perfect for data-backed brainstorming.
                            </p>
                        </div>
                    </div>

                    {/* Feature 2 - Sector Browsing */}
                    <div className="grid md:grid-cols-2 gap-8 items-center">
                        <div className="space-y-4 order-2 md:order-1 md:text-right">
                            <h3 className="text-xl sm:text-2xl font-semibold text-white">Sector Watcher</h3>
                            <p className="text-sm sm:text-base text-white/70">
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
                            <h3 className="text-xl sm:text-2xl font-semibold text-white">Competitor Radar</h3>
                            <p className="text-sm sm:text-base text-white/70">
                                Find competitors in your space, then automatically generate the keywords they're targeting. Get the same comprehensive metrics, volume, trends, economics, competition, and opportunity scores, to either compete on the same demand or identify untapped gaps in the market.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* FAQ Section */}
            <section className="py-12 sm:py-16 md:py-24 px-4 border-t border-white/10">
                <div className="max-w-4xl mx-auto">
                    <div className="text-center mb-8 sm:mb-12">
                        <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-4">
                            Frequently Asked Questions
                        </h2>
                        <p className="text-base sm:text-lg text-white/70">
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
            <section id="signup" className="py-16 sm:py-24 md:py-32 px-4">
                <div className="max-w-4xl mx-auto flex justify-center">
                    <Button
                        size="lg"
                        className="text-lg px-12 py-8 h-auto group rounded-full shadow-xl shadow-primary/30 hover:shadow-primary/50 transition-all duration-300 hover:scale-105"
                        onClick={() => setLocation("/auth?signup=true")}
                    >
                        Find Opportunities
                        <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                    </Button>
                </div>
            </section>
        </div>
    );
}
