import { useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ListInput } from "@/components/ui/list-input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Sparkles, Search, ExternalLink, Building2 } from "lucide-react";

interface CustomSearchFormProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

interface FormData {
    pitch: string;
    topics: string[];
    personas: string[];
    painPoints: string[];
    features: string[];
}

interface Competitor {
    name: string;
    description: string;
    url?: string | null;
}

export function CustomSearchForm({
    open,
    onOpenChange,
}: CustomSearchFormProps) {
    const { toast } = useToast();
    const [topics, setTopics] = useState<string[]>([]);
    const [personas, setPersonas] = useState<string[]>([]);
    const [painPoints, setPainPoints] = useState<string[]>([]);
    const [features, setFeatures] = useState<string[]>([]);
    const [isGeneratingTopics, setIsGeneratingTopics] = useState(false);
    const [isGeneratingPersonas, setIsGeneratingPersonas] = useState(false);
    const [isGeneratingPainPoints, setIsGeneratingPainPoints] =
        useState(false);
    const [isGeneratingFeatures, setIsGeneratingFeatures] = useState(false);
    const [isFindingCompetitors, setIsFindingCompetitors] = useState(false);
    const [competitors, setCompetitors] = useState<Competitor[]>([]);

    const form = useForm<FormData>({
        defaultValues: {
            pitch: "",
        },
    });

    const pitch = form.watch("pitch");

    const generateItemsMutation = useMutation({
        mutationFn: async ({
            pitch,
            type,
        }: {
            pitch: string;
            type: "topics" | "personas" | "pain-points" | "features";
        }) => {
            const res = await apiRequest("POST", "/api/custom-search/generate-items", {
                pitch,
                type,
            });
            return res.json();
        },
        onError: (error) => {
            toast({
                title: "Error",
                description:
                    error instanceof Error
                        ? error.message
                        : "Failed to generate items",
                variant: "destructive",
            });
        },
    });

    const findCompetitorsMutation = useMutation({
        mutationFn: async (data: {
            pitch: string;
            topics?: string[];
            personas?: string[];
            painPoints?: string[];
            features?: string[];
        }) => {
            const res = await apiRequest(
                "POST",
                "/api/custom-search/find-competitors",
                data
            );
            return res.json();
        },
        onSuccess: (result) => {
            if (result.competitors && Array.isArray(result.competitors)) {
                setCompetitors(result.competitors);
                toast({
                    title: "Competitors Found!",
                    description: `Found ${result.competitors.length} competitors.`,
                });
            } else {
                toast({
                    title: "Competitors Found!",
                    description: "No competitors data returned.",
                    variant: "destructive",
                });
            }
        },
        onError: (error) => {
            toast({
                title: "Error",
                description:
                    error instanceof Error
                        ? error.message
                        : "Failed to find competitors",
                variant: "destructive",
            });
        },
    });

    const handleGenerateTopics = async () => {
        if (!pitch || pitch.trim().length === 0) {
            toast({
                title: "Error",
                description: "Please enter an idea pitch first",
                variant: "destructive",
            });
            return;
        }

        setIsGeneratingTopics(true);
        try {
            const result = await generateItemsMutation.mutateAsync({
                pitch,
                type: "topics",
            });
            if (result.items && Array.isArray(result.items)) {
                // Add new items that don't already exist
                const newItems = result.items.filter((item: string) => !topics.includes(item));
                setTopics([...topics, ...newItems]);
            }
        } finally {
            setIsGeneratingTopics(false);
        }
    };

    const handleGeneratePersonas = async () => {
        if (!pitch || pitch.trim().length === 0) {
            toast({
                title: "Error",
                description: "Please enter an idea pitch first",
                variant: "destructive",
            });
            return;
        }

        setIsGeneratingPersonas(true);
        try {
            const result = await generateItemsMutation.mutateAsync({
                pitch,
                type: "personas",
            });
            if (result.items && Array.isArray(result.items)) {
                // Add new items that don't already exist
                const newItems = result.items.filter((item: string) => !personas.includes(item));
                setPersonas([...personas, ...newItems]);
            }
        } finally {
            setIsGeneratingPersonas(false);
        }
    };

    const handleGeneratePainPoints = async () => {
        if (!pitch || pitch.trim().length === 0) {
            toast({
                title: "Error",
                description: "Please enter an idea pitch first",
                variant: "destructive",
            });
            return;
        }

        setIsGeneratingPainPoints(true);
        try {
            const result = await generateItemsMutation.mutateAsync({
                pitch,
                type: "pain-points",
            });
            if (result.items && Array.isArray(result.items)) {
                // Add new items that don't already exist
                const newItems = result.items.filter((item: string) => !painPoints.includes(item));
                setPainPoints([...painPoints, ...newItems]);
            }
        } finally {
            setIsGeneratingPainPoints(false);
        }
    };

    const handleGenerateFeatures = async () => {
        if (!pitch || pitch.trim().length === 0) {
            toast({
                title: "Error",
                description: "Please enter an idea pitch first",
                variant: "destructive",
            });
            return;
        }

        setIsGeneratingFeatures(true);
        try {
            const result = await generateItemsMutation.mutateAsync({
                pitch,
                type: "features",
            });
            if (result.items && Array.isArray(result.items)) {
                // Add new items that don't already exist
                const newItems = result.items.filter((item: string) => !features.includes(item));
                setFeatures([...features, ...newItems]);
            }
        } finally {
            setIsGeneratingFeatures(false);
        }
    };

    const handleFindCompetitors = async () => {
        if (!pitch || pitch.trim().length === 0) {
            toast({
                title: "Error",
                description: "Please enter an idea pitch first",
                variant: "destructive",
            });
            return;
        }

        setIsFindingCompetitors(true);
        try {
            await findCompetitorsMutation.mutateAsync({
                pitch,
                topics: topics.length > 0 ? topics : undefined,
                personas: personas.length > 0 ? personas : undefined,
                painPoints: painPoints.length > 0 ? painPoints : undefined,
                features: features.length > 0 ? features : undefined,
            });
        } finally {
            setIsFindingCompetitors(false);
        }
    };

    const handleClose = () => {
        form.reset();
        setTopics([]);
        setPersonas([]);
        setPainPoints([]);
        setFeatures([]);
        setCompetitors([]);
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Search className="h-5 w-5 text-white" />
                        Custom Search
                    </DialogTitle>
                    <DialogDescription>
                        Provide detailed information about your idea to generate
                        targeted keywords and competitor analysis.
                    </DialogDescription>
                </DialogHeader>

                <form className="space-y-6">
                    {/* Idea Pitch */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-white">
                            Idea Pitch <span className="text-red-500">*</span>
                        </label>
                        <Textarea
                            {...form.register("pitch")}
                            placeholder="Describe your idea in detail..."
                            className="min-h-[100px] bg-white/5 border-white/10 text-white placeholder:text-white/40"
                        />
                        <p className="text-xs text-white/60">
                            Provide a comprehensive description of your idea.
                            This will be used to generate topics, personas, pain
                            points, and features.
                        </p>
                    </div>

                    {/* Topics */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-white">
                            Topics
                        </label>
                        <ListInput
                            value={topics}
                            onChange={setTopics}
                            placeholder="Add topics related to your idea (or press Generate)"
                            onGenerate={handleGenerateTopics}
                            isGenerating={isGeneratingTopics}
                            generateLabel="Generate from Pitch"
                            badgeColor="bg-blue-600/80 text-blue-100 border-blue-500/50"
                        />
                    </div>

                    {/* Personas */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-white">
                            Personas
                        </label>
                        <ListInput
                            value={personas}
                            onChange={setPersonas}
                            placeholder="Add target personas (or press Generate)"
                            onGenerate={handleGeneratePersonas}
                            isGenerating={isGeneratingPersonas}
                            generateLabel="Generate from Pitch"
                            badgeColor="bg-emerald-600/80 text-emerald-100 border-emerald-500/50"
                        />
                    </div>

                    {/* Pain Points */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-white">
                            Pain Points
                        </label>
                        <ListInput
                            value={painPoints}
                            onChange={setPainPoints}
                            placeholder="Add pain points your idea addresses (or press Generate)"
                            onGenerate={handleGeneratePainPoints}
                            isGenerating={isGeneratingPainPoints}
                            generateLabel="Generate from Pitch"
                            badgeColor="bg-amber-600/80 text-amber-100 border-amber-500/50"
                        />
                    </div>

                    {/* Features */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-white">
                            Features
                        </label>
                        <ListInput
                            value={features}
                            onChange={setFeatures}
                            placeholder="Add key features (or press Generate)"
                            onGenerate={handleGenerateFeatures}
                            isGenerating={isGeneratingFeatures}
                            generateLabel="Generate from Pitch"
                            badgeColor="bg-purple-600/80 text-purple-100 border-purple-500/50"
                        />
                    </div>

                    {/* Find Competitors Button */}
                    <div className="pt-4 border-t border-white/10">
                        <Button
                            type="button"
                            onClick={handleFindCompetitors}
                            disabled={
                                !pitch ||
                                pitch.trim().length === 0 ||
                                isFindingCompetitors
                            }
                            className="w-full"
                        >
                            {isFindingCompetitors ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Finding Competitors...
                                </>
                            ) : (
                                <>
                                    <Search className="mr-2 h-4 w-4" />
                                    Find All Competitors Automatically
                                </>
                            )}
                        </Button>
                    </div>

                    {/* Competitors List */}
                    {competitors.length > 0 && (
                        <div className="pt-4 border-t border-white/10">
                            <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                    <Building2 className="h-5 w-5 text-white/60" />
                                    <h3 className="text-sm font-semibold text-white">
                                        Found Competitors ({competitors.length})
                                    </h3>
                                </div>
                                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                                    {competitors.map((competitor, index) => (
                                        <div
                                            key={index}
                                            className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg p-3 transition-colors"
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <h4 className="text-sm font-medium text-white">
                                                            {competitor.name}
                                                        </h4>
                                                        {competitor.url && (
                                                            <a
                                                                href={competitor.url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="text-primary hover:text-primary/80 transition-colors"
                                                                onClick={(e) => e.stopPropagation()}
                                                            >
                                                                <ExternalLink className="h-3.5 w-3.5" />
                                                            </a>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-white/60 line-clamp-2">
                                                        {competitor.description}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </form>
            </DialogContent>
        </Dialog>
    );
}
