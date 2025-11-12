import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, History, Loader2, Building2, Search } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { IdeaWithReport } from "@shared/schema";
import { KeywordFilters, type KeywordFilter } from "@/components/keyword-filters";
import { SectorBrowser } from "@/components/sector-browser";
import { CustomSearchForm } from "@/components/custom-search-form";

interface IdeaGeneratorProps {
    onIdeaGenerated: (idea: IdeaWithReport) => void;
    onShowHistory: () => void;
    onReportGenerated: (idea: IdeaWithReport) => void;
    currentIdea?: IdeaWithReport | null;
    onGeneratingChange?: (isGenerating: boolean) => void;
    searchKeyword?: string | null;
    onActiveTabChange?: (tab: string) => void;
}

export function IdeaGenerator({
    onIdeaGenerated,
    onShowHistory,
    onReportGenerated,
    currentIdea,
    onGeneratingChange,
    searchKeyword,
    onActiveTabChange,
}: IdeaGeneratorProps) {
    const { toast } = useToast();
    const [showSectorBrowser, setShowSectorBrowser] = useState(false);
    const [activeTab, setActiveTab] = useState("standard");
    const [isSearchMode, setIsSearchMode] = useState(false);

    // Notify parent when tab changes
    useEffect(() => {
        onActiveTabChange?.(activeTab);
    }, [activeTab, onActiveTabChange]);

    const form = useForm({
        defaultValues: {
            idea: "",
        },
    });

    // Load filters from localStorage or use empty array
    const [filters, setFilters] = useState<KeywordFilter[]>(() => {
        if (typeof window !== 'undefined') {
            const stored = localStorage.getItem('keyword-filters');
            if (stored) {
                try {
                    const parsed = JSON.parse(stored);
                    if (Array.isArray(parsed)) {
                        return parsed;
                    }
                } catch (e) {
                    // Invalid JSON, use empty array
                }
            }
        }
        return [];
    });

    // Save filters to localStorage whenever they change
    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('keyword-filters', JSON.stringify(filters));
        }
    }, [filters]);

    // Update form and focus input when searchKeyword changes
    useEffect(() => {
        if (searchKeyword) {
            form.setValue("idea", searchKeyword);

            // Query the input element and scroll to it
            const inputElement = document.querySelector('[data-testid="input-idea"]') as HTMLInputElement;

            if (inputElement) {
                inputElement.scrollIntoView({
                    behavior: "smooth",
                    block: "center"
                });

                // Small delay to ensure smooth scroll completes before focusing
                setTimeout(() => {
                    inputElement.focus();
                    inputElement.select(); // Select all text for easy editing
                }, 300);
            }
        }
    }, [searchKeyword, form]);

    const generateIdeaMutation = useMutation({
        mutationFn: async (data: { originalIdea: string | null }) => {
            const res = await apiRequest("POST", "/api/generate-idea", data);
            return res.json();
        },
        onSuccess: (result) => {
            toast({
                title: "Idea Generated!",
                description: result.idea.generatedIdea,
            });
            // Set the generated idea in the input field
            form.setValue("idea", result.idea.generatedIdea);
            queryClient.invalidateQueries({ queryKey: ["/api/ideas"] });
            onIdeaGenerated(result.idea);

            // Fetch the name in the background (it's being generated asynchronously)
            // This allows the user to proceed while the title is being generated
            (async () => {
                try {
                    // Wait a bit for the name to be generated, then fetch it
                    // We'll retry a few times in case it's not ready yet
                    let retries = 3;
                    let name: string | null = null;

                    while (retries > 0 && !name) {
                        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second between retries
                        try {
                            const nameRes = await apiRequest("GET", `/api/idea/${result.idea.id}/name`);
                            const nameData = await nameRes.json();
                            name = nameData.name;
                        } catch (error) {
                            // Name might not be ready yet, retry
                            retries--;
                        }
                    }

                    // If we got the name, update the idea
                    if (name) {
                        onIdeaGenerated({ ...result.idea, name });
                    }
                } catch (error) {
                    // Silently fail - name generation is not critical
                    console.error("Error fetching idea name:", error);
                }
            })();
        },
        onError: (error) => {
            toast({
                title: "Error",
                description:
                    error instanceof Error ? error.message : "Failed to generate idea",
                variant: "destructive",
            });
        },
    });

    const generateReportMutation = useMutation({
        mutationFn: async (data: { ideaId: string; filters?: KeywordFilter[] }) => {
            const res = await apiRequest("POST", "/api/generate-report", {
                ideaId: data.ideaId,
                keywordCount: 20, // Preload 20 keywords (show 10, expand by 5)
                filters: data.filters?.map(({ id, ...rest }) => rest) || [],
            });
            return res.json();
        },
        onSuccess: (result) => {
            toast({
                title: "Report Generated!",
                description: "Your market analysis is ready.",
            });
            queryClient.invalidateQueries({ queryKey: ["/api/ideas"] });
            if (currentIdea) {
                onReportGenerated({
                    ...currentIdea,
                    report: {
                        ...result.report,
                        keywords: result.keywords,
                    },
                });
            }
        },
        onError: (error: any) => {
            // Check if it's a payment required error
            if (error?.message?.includes("402") || error?.status === 402 || error?.requiresPayment) {
                toast({
                    title: "Payment Required",
                    description: "Advanced filters require a one-time payment. Please unlock premium features to use filters.",
                    variant: "destructive",
                });
                return;
            }

            toast({
                title: "Error",
                description:
                    error instanceof Error ? error.message : "Failed to generate report",
                variant: "destructive",
            });
        },
    });

    // Notify parent when generating state changes
    // Only notify when generating report, not when just generating idea
    useEffect(() => {
        // Only show loading components when generating report (search mode)
        // Don't show them when just generating an idea
        const isGenerating = generateReportMutation.isPending || 
            (generateIdeaMutation.isPending && isSearchMode);
        onGeneratingChange?.(isGenerating);
    }, [
        generateIdeaMutation.isPending,
        generateReportMutation.isPending,
        isSearchMode,
        onGeneratingChange,
    ]);

    const handleGenerateIdea = () => {
        // Only generate new AI idea (pass null to force AI generation)
        // Don't automatically generate report - let user search separately
        setIsSearchMode(false);
        generateIdeaMutation.mutate({
            originalIdea: null,
        });
    };

    const handleSearch = () => {
        const ideaText = form.getValues("idea");

        if (!ideaText || ideaText.trim().length === 0) {
            toast({
                title: "Error",
                description: "Please enter an idea to search for keywords",
                variant: "destructive",
            });
            return;
        }

        // If we have a current idea with the same text, just regenerate report
        if (currentIdea?.id && currentIdea.generatedIdea === ideaText.trim()) {
            generateReportMutation.mutate({
                ideaId: currentIdea.id,
                filters
            });
            return;
        }

        // Create idea with the current input, then generate report
        setIsSearchMode(true);
        generateIdeaMutation.mutate({
            originalIdea: ideaText.trim(),
        });
    };

    // Update generateIdeaMutation to trigger report generation when idea is created from search
    useEffect(() => {
        if (generateIdeaMutation.isSuccess && generateIdeaMutation.data && isSearchMode) {
            // This was triggered by search, so generate report
            generateReportMutation.mutate({ 
                ideaId: generateIdeaMutation.data.idea.id, 
                filters 
            });
            setIsSearchMode(false); // Reset flag
        }
    }, [generateIdeaMutation.isSuccess, generateIdeaMutation.data, isSearchMode, filters]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.preventDefault();
            handleSearch();
        }
    };

    return (
        <div className="space-y-6">
            <div className="space-y-8 pt-12">
                <div className="text-center max-w-3xl mx-auto">
                    <h2 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-secondary via-primary to-white bg-clip-text text-transparent mb-6">
                        Trends Search
                    </h2>
                    <p className="text-base text-white/80 leading-relaxed">
                        Discover trending opportunities or research your own ideas. Get instant insights
                        from 80,000+ real keywords with search volume, competition, and
                        growth trends.
                    </p>
                </div>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="flex gap-8 bg-transparent p-0 h-auto mb-8">
                        <TabsTrigger
                            value="standard"
                            className="bg-transparent text-white/60 data-[state=active]:text-white data-[state=active]:bg-transparent px-0 py-2 rounded-none border-b-2 border-transparent data-[state=active]:border-white/40 hover:text-white/80 transition-colors"
                        >
                            Standard Search
                        </TabsTrigger>
                        <TabsTrigger
                            value="custom"
                            className="bg-transparent text-white/60 data-[state=active]:text-white data-[state=active]:bg-transparent px-0 py-2 rounded-none border-b-2 border-transparent data-[state=active]:border-white/40 hover:text-white/80 transition-colors"
                        >
                            Custom Search
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="standard" className="space-y-6">
                        <div className="flex items-center gap-0">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setShowSectorBrowser(true)}
                                className="h-14 pl-6 pr-4 bg-purple-600/20 border-purple-500/50 text-white hover:bg-purple-600/30 hover:border-purple-400 transition-colors whitespace-nowrap rounded-l-full rounded-r-none"
                                data-testid="button-browse-sectors"
                            >
                                <Building2 className="h-5 w-5 stroke-[2.5] mr-2" />
                                Browse Sectors
                            </Button>
                            <div className="relative flex-1">
                                <Input
                                    placeholder="Write a short pitch here and press enter to find semantically related keywords."
                                    className="w-full bg-white/5 border-white/10 text-white placeholder:text-white/40 focus:border-primary focus:ring-2 focus:ring-primary/20 h-14 px-6 pr-32 rounded-none border-l-0 border-r-0"
                                    data-testid="input-idea"
                                    onKeyDown={handleKeyDown}
                                    {...form.register("idea")}
                                />
                                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1 items-center">
                                    <Button
                                        type="button"
                                        onClick={handleGenerateIdea}
                                        disabled={generateIdeaMutation.isPending}
                                        variant="ghost"
                                        className="h-10 px-3 text-yellow-300 hover:bg-transparent whitespace-nowrap"
                                        data-testid="button-generate"
                                    >
                                        {generateIdeaMutation.isPending ? (
                                            <>
                                                <Loader2 className="h-4 w-4 animate-spin stroke-[2.5] mr-1.5" />
                                                <span className="text-sm">Generate</span>
                                            </>
                                        ) : (
                                            <>
                                                <Sparkles className="h-4 w-4 stroke-[2.5] mr-1.5" />
                                                <span className="text-sm">Generate</span>
                                            </>
                                        )}
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={onShowHistory}
                                        className="h-10 w-10 text-secondary hover:bg-transparent"
                                        data-testid="button-history"
                                    >
                                        <History className="h-5 w-5 stroke-[2.5]" />
                                    </Button>
                                </div>
                            </div>
                            <Button
                                type="button"
                                onClick={handleSearch}
                                disabled={
                                    generateReportMutation.isPending ||
                                    generateIdeaMutation.isPending
                                }
                                className="h-14 pl-6 pr-8 bg-white/5 border-white/10 text-white hover:bg-white/10 rounded-r-full rounded-l-none border-l-0 flex items-center justify-center"
                                data-testid="button-search"
                            >
                                {generateReportMutation.isPending || generateIdeaMutation.isPending ? (
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                ) : (
                                    <Search className="h-5 w-5" />
                                )}
                            </Button>
                        </div>

                        {/* Keyword Filters */}
                        <KeywordFilters
                            ideaText={form.watch("idea") || null}
                            filters={filters}
                            onFiltersChange={setFilters}
                        />
                    </TabsContent>

                    <TabsContent value="custom" className="">
                        <CustomSearchForm />
                    </TabsContent>
                </Tabs>
            </div>

            {/* Sector Browser */}
            <SectorBrowser
                open={showSectorBrowser}
                onOpenChange={setShowSectorBrowser}
                onSelectItem={(text) => {
                    form.setValue("idea", text);
                    // Focus the input so user can see the selection and manually trigger if needed
                    const inputElement = document.querySelector('[data-testid="input-idea"]') as HTMLInputElement;
                    if (inputElement) {
                        setTimeout(() => {
                            inputElement.focus();
                            inputElement.select();
                        }, 100);
                    }
                    // If there's a current idea, automatically generate report
                    // Otherwise, let user generate idea first
                    if (currentIdea?.id) {
                        generateReportMutation.mutate({
                            ideaId: currentIdea.id,
                            filters
                        });
                    }
                }}
            />

        </div>
    );
}
