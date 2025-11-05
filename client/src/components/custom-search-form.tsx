import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ListInput } from "@/components/ui/list-input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, Search, ExternalLink, Building2, Sparkles, Plus, FolderOpen } from "lucide-react";
import { CustomSearchProjectBrowser } from "./custom-search-project-browser";
import type { CustomSearchProject } from "@shared/schema";

interface CustomSearchFormProps { }

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

export function CustomSearchForm({ }: CustomSearchFormProps) {
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
    const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
    const [showProjectBrowser, setShowProjectBrowser] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isLoadingProject, setIsLoadingProject] = useState(false);
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const form = useForm<FormData>({
        defaultValues: {
            pitch: "",
        },
    });

    const pitch = form.watch("pitch");

    // Query to check if user has any projects
    const { data: projectsData } = useQuery<{ projects: CustomSearchProject[] }>({
        queryKey: ["/api/custom-search/projects"],
        queryFn: async () => {
            const res = await apiRequest("GET", "/api/custom-search/projects");
            return res.json();
        },
    });

    // Create project mutation
    const createProjectMutation = useMutation({
        mutationFn: async (data: {
            name?: string;
            pitch?: string;
            topics?: string[];
            personas?: string[];
            painPoints?: string[];
            features?: string[];
            competitors?: Competitor[];
        }) => {
            const res = await apiRequest("POST", "/api/custom-search/projects", data);
            return res.json();
        },
        onSuccess: (result) => {
            setCurrentProjectId(result.project.id);
            queryClient.invalidateQueries({ queryKey: ["/api/custom-search/projects"] });
        },
        onError: (error) => {
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "Failed to create project",
                variant: "destructive",
            });
        },
    });

    // Update project mutation
    const updateProjectMutation = useMutation({
        mutationFn: async (data: {
            id: string;
            pitch?: string;
            topics?: string[];
            personas?: string[];
            painPoints?: string[];
            features?: string[];
            competitors?: Competitor[];
        }) => {
            const { id, ...updateData } = data;
            const res = await apiRequest("PUT", `/api/custom-search/projects/${id}`, updateData);
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/custom-search/projects"] });
        },
        onError: (error) => {
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "Failed to save project",
                variant: "destructive",
            });
        },
    });

    // Auto-save function with debouncing
    const autoSave = () => {
        // Skip auto-save if we're loading a project or creating initial project
        if (isLoadingProject || createProjectMutation.isPending) return;
        
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }

        saveTimeoutRef.current = setTimeout(() => {
            if (!currentProjectId) {
                // Create new project if none exists
                createProjectMutation.mutate({
                    pitch: pitch || "",
                    topics,
                    personas,
                    painPoints,
                    features,
                    competitors,
                });
            } else {
                // Update existing project
                setIsSaving(true);
                updateProjectMutation.mutate(
                    {
                        id: currentProjectId,
                        pitch: pitch || "",
                        topics,
                        personas,
                        painPoints,
                        features,
                        competitors,
                    },
                    {
                        onSettled: () => {
                            setIsSaving(false);
                        },
                    }
                );
            }
        }, 2000); // 2 second debounce
    };

    // Auto-save on form changes
    useEffect(() => {
        autoSave();
        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pitch, topics, personas, painPoints, features, competitors, isLoadingProject]);

    // Auto-create project on first mount if no projects exist
    useEffect(() => {
        if (!projectsData) return;
        
        // Only auto-create/load if we don't have a current project and we're not manually creating one
        if (projectsData.projects.length === 0 && !currentProjectId && !createProjectMutation.isPending && !isLoadingProject) {
            setIsLoadingProject(true);
            createProjectMutation.mutate({
                pitch: "",
                topics: [],
                personas: [],
                painPoints: [],
                features: [],
                competitors: [],
            }, {
                onSuccess: () => {
                    setTimeout(() => {
                        setIsLoadingProject(false);
                    }, 100);
                },
            });
        } else if (projectsData.projects.length > 0 && !currentProjectId && !isLoadingProject) {
            // Load most recent project
            const mostRecent = projectsData.projects[0];
            loadProject(mostRecent);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectsData, currentProjectId]);

    // Load project data into form
    const loadProject = (project: CustomSearchProject) => {
        setIsLoadingProject(true);
        setCurrentProjectId(project.id);
        form.setValue("pitch", project.pitch || "");
        setTopics(project.topics || []);
        setPersonas(project.personas || []);
        setPainPoints(project.painPoints || []);
        setFeatures(project.features || []);
        setCompetitors(project.competitors || []);
        // Allow auto-save after a short delay to ensure form is fully updated
        setTimeout(() => {
            setIsLoadingProject(false);
        }, 100);
    };

    // Handle new project creation
    const handleNewProject = () => {
        // Clear any pending save operations
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = null;
        }
        
        // Set loading flag first to prevent auto-save
        setIsLoadingProject(true);
        setIsSaving(false);
        
        // Clear all form state
        form.reset({ pitch: "" });
        setTopics([]);
        setPersonas([]);
        setPainPoints([]);
        setFeatures([]);
        setCompetitors([]);
        setCurrentProjectId(null);
        
        // Create new project with blank data after a small delay to ensure state is cleared
        setTimeout(() => {
            createProjectMutation.mutate({
                pitch: "",
                topics: [],
                personas: [],
                painPoints: [],
                features: [],
                competitors: [],
            }, {
                onSuccess: () => {
                    // Allow auto-save after project is created
                    setTimeout(() => {
                        setIsLoadingProject(false);
                    }, 100);
                },
                onError: () => {
                    setIsLoadingProject(false);
                },
            });
        }, 50);
    };

    // Handle project selection from browser
    const handleSelectProject = (project: CustomSearchProject) => {
        loadProject(project);
    };

    const generateIdeaMutation = useMutation({
        mutationFn: async (data: { originalIdea: string | null; longerDescription?: boolean }) => {
            const res = await apiRequest("POST", "/api/generate-idea", data);
            return res.json();
        },
        onSuccess: (result) => {
            toast({
                title: "Idea Generated!",
                description: result.idea.generatedIdea,
            });
            // Set the generated idea in the pitch field
            form.setValue("pitch", result.idea.generatedIdea);
            queryClient.invalidateQueries({ queryKey: ["/api/ideas"] });
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
                // Auto-save will be triggered by useEffect
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

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="space-y-2">
                <h3 className="flex items-center gap-2 text-xl font-semibold text-white">
                    <Search className="h-5 w-5 text-white" />
                    Custom Search
                </h3>
                <p className="text-sm text-white/60">
                    Provide detailed information about your idea to generate
                    targeted keywords and competitor analysis.
                </p>
            </div>

            {/* Project Management Buttons */}
            <div className="flex items-center justify-between gap-4 pb-4 border-b border-white/10">
                <Button
                    type="button"
                    variant="outline"
                    onClick={handleNewProject}
                    disabled={createProjectMutation.isPending}
                    className="flex items-center gap-2"
                >
                    <Plus className="h-4 w-4" />
                    New Project
                </Button>
                <div className="flex items-center gap-2">
                    {isSaving && (
                        <div className="flex items-center gap-2 text-xs text-white/60">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Saving...
                        </div>
                    )}
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => setShowProjectBrowser(true)}
                        className="flex items-center gap-2"
                    >
                        <FolderOpen className="h-4 w-4" />
                        Browse Projects
                    </Button>
                </div>
            </div>

            {/* Project Browser Modal */}
            <CustomSearchProjectBrowser
                open={showProjectBrowser}
                onOpenChange={setShowProjectBrowser}
                onSelectProject={handleSelectProject}
                onCreateNew={handleNewProject}
            />

            <form className="space-y-6">
                {/* Idea Pitch */}
                <div className="space-y-2">
                    <label className="text-sm font-medium text-white">
                        Idea Pitch <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                        <Textarea
                            {...form.register("pitch")}
                            placeholder="Describe your idea in detail..."
                            className="min-h-[100px] bg-white/5 border-white/10 text-white placeholder:text-white/40 pr-20 pb-10"
                        />
                        <div className="absolute right-2 bottom-2">
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() => generateIdeaMutation.mutate({ originalIdea: null, longerDescription: true })}
                                disabled={generateIdeaMutation.isPending}
                                className="h-8 text-yellow-300 hover:bg-transparent gap-1.5 px-4"
                                title="Generate idea from AI"
                            >
                                {generateIdeaMutation.isPending ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin stroke-[2.5]" />
                                        <span className="text-xs">Generating...</span>
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="h-4 w-4 stroke-[2.5]" />
                                        <span className="text-xs">I'm feeling vibing</span>
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                    <p className="text-xs text-white/60">
                        Provide a comprehensive description of your idea.
                        This will be used to generate topics, personas, pain
                        points, and features.
                    </p>
                </div>

                {/* List Inputs in 2x2 Grid */}
                <div className="grid grid-cols-2 gap-6">
                    {/* Topics */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-white">
                            Topics
                        </label>
                        <ListInput
                            value={topics}
                            onChange={setTopics}
                            placeholder="Add topics related to your idea"
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
                            placeholder="Add target personas"
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
                            placeholder="Add pain points your idea addresses"
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
                            placeholder="Add key features"
                            onGenerate={handleGenerateFeatures}
                            isGenerating={isGeneratingFeatures}
                            generateLabel="Generate from Pitch"
                            badgeColor="bg-purple-600/80 text-purple-100 border-purple-500/50"
                        />
                    </div>
                </div>

                {/* Find Competitors Button */}
                <div className="pt-4 border-t border-white/10 flex justify-center">
                    <Button
                        type="button"
                        onClick={handleFindCompetitors}
                        disabled={
                            !pitch ||
                            pitch.trim().length === 0 ||
                            isFindingCompetitors
                        }
                        className="w-1/2"
                    >
                        {isFindingCompetitors ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Finding Competitors...
                            </>
                        ) : (
                            <>
                                <Search className="mr-2 h-4 w-4" />
                                Find Competitors
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
                            <div className="grid grid-cols-3 gap-3">
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
        </div>
    );
}
