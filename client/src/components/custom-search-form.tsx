import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ListInput } from "@/components/ui/list-input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { supabase } from "@/lib/supabase";
import { Loader2, Search, ExternalLink, Building2, Sparkles, Plus, FolderOpen, Pencil, Sparkle } from "lucide-react";
import { CustomSearchProjectBrowser } from "./custom-search-project-browser";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { CustomSearchProject } from "@shared/schema";

interface CustomSearchFormProps { }

interface FormData {
    name: string;
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
    const [isEditingName, setIsEditingName] = useState(false);
    const [isGeneratingKeywords, setIsGeneratingKeywords] = useState(false);
    const [showKeywordProgress, setShowKeywordProgress] = useState(false);
    const [keywordProgress, setKeywordProgress] = useState<{
        stage: string;
        seedsGenerated: number;
        keywordsGenerated: number;
        duplicatesFound: number;
        existingKeywordsFound: number;
        newKeywordsCollected: number;
        currentSeed?: string;
        seeds?: string[];
        allKeywords?: string[];
        duplicates?: string[];
        existingKeywords?: string[];
        newKeywords?: string[];
    } | null>(null);
    const [generatedKeywords, setGeneratedKeywords] = useState<string[]>([]);
    const [expandedQuadrant, setExpandedQuadrant] = useState<string | null>(null);
    const [savedProgress, setSavedProgress] = useState<any>(null);
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const form = useForm<FormData>({
        defaultValues: {
            name: "",
            pitch: "",
        },
    });

    const pitch = form.watch("pitch");
    const name = form.watch("name");

    // Query to check if user has any projects
    const { data: projectsData } = useQuery<{ projects: CustomSearchProject[] }>({
        queryKey: ["/api/custom-search/projects"],
        queryFn: async () => {
            const res = await apiRequest("GET", "/api/custom-search/projects");
            return res.json();
        },
    });

    // Update saved progress when project data changes
    useEffect(() => {
        if (currentProjectId && projectsData?.projects) {
            const currentProject = projectsData.projects.find(p => p.id === currentProjectId);
            if (currentProject?.keywordGenerationProgress) {
                setSavedProgress(currentProject.keywordGenerationProgress);
                // If complete, update generated keywords
                if (currentProject.keywordGenerationProgress.stage === 'complete' && currentProject.keywordGenerationProgress.newKeywords) {
                    setGeneratedKeywords(currentProject.keywordGenerationProgress.newKeywords);
                }
            }
        }
    }, [projectsData, currentProjectId]);

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
            name?: string;
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
                    name: name || undefined,
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
                        name: name || undefined,
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
    }, [name, pitch, topics, personas, painPoints, features, competitors, isLoadingProject]);

    // Auto-create project on first mount if no projects exist
    useEffect(() => {
        if (!projectsData) return;

        // Only auto-create/load if we don't have a current project and we're not manually creating one
        if (projectsData.projects.length === 0 && !currentProjectId && !createProjectMutation.isPending && !isLoadingProject) {
            setIsLoadingProject(true);
            createProjectMutation.mutate({
                name: "",
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
        form.setValue("name", project.name || "");
        form.setValue("pitch", project.pitch || "");
        setTopics(project.topics || []);
        setPersonas(project.personas || []);
        setPainPoints(project.painPoints || []);
        setFeatures(project.features || []);
        setCompetitors(project.competitors || []);
        
        // Load saved keyword generation progress
        if (project.keywordGenerationProgress) {
            setSavedProgress(project.keywordGenerationProgress);
            // If progress exists and is complete, show the keywords
            if (project.keywordGenerationProgress.stage === 'complete' && project.keywordGenerationProgress.newKeywords) {
                setGeneratedKeywords(project.keywordGenerationProgress.newKeywords);
            }
        } else {
            setSavedProgress(null);
        }
        
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
        setSavedProgress(null);
        setGeneratedKeywords([]);
        setKeywordProgress(null);

        // Clear all form state
        form.reset({ name: "", pitch: "" });
        setTopics([]);
        setPersonas([]);
        setPainPoints([]);
        setFeatures([]);
        setCompetitors([]);
        setCurrentProjectId(null);

        // Create new project with blank data after a small delay to ensure state is cleared
        setTimeout(() => {
            createProjectMutation.mutate({
                name: "",
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
        mutationFn: async (data: { originalIdea: string | null; longerDescription?: boolean; expand?: boolean }) => {
            const res = await apiRequest("POST", "/api/generate-idea", data);
            return res.json();
        },
        onSuccess: (result, variables) => {
            const wasExpanded = variables.expand && variables.originalIdea;
            toast({
                title: wasExpanded ? "Idea Expanded!" : "Idea Generated!",
                description: result.idea.generatedIdea,
            });
            // Set the generated idea in the pitch field and name if provided
            form.setValue("pitch", result.idea.generatedIdea);
            if (result.idea.name) {
                form.setValue("name", result.idea.name);
            }
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

    const handleGenerateKeywords = async (resume: boolean = false) => {
        if (!pitch || pitch.trim().length === 0) {
            toast({
                title: "Error",
                description: "Please enter an idea pitch first",
                variant: "destructive",
            });
            return;
        }

        if (!currentProjectId) {
            toast({
                title: "Error",
                description: "Please save your project first",
                variant: "destructive",
            });
            return;
        }

        setIsGeneratingKeywords(true);
        setShowKeywordProgress(true);
        setExpandedQuadrant(null);
        
        // If resuming, restore progress state
        if (resume && savedProgress) {
            setKeywordProgress({
                stage: savedProgress.stage,
                seedsGenerated: savedProgress.seedsGenerated,
                keywordsGenerated: savedProgress.keywordsGenerated,
                duplicatesFound: savedProgress.duplicatesFound,
                existingKeywordsFound: savedProgress.existingKeywordsFound,
                newKeywordsCollected: savedProgress.newKeywordsCollected,
                seeds: savedProgress.seeds,
                allKeywords: savedProgress.allKeywords,
                duplicates: savedProgress.duplicates,
                existingKeywords: savedProgress.existingKeywords,
            });
            if (savedProgress.newKeywords) {
                setGeneratedKeywords(savedProgress.newKeywords);
            }
        } else {
            setKeywordProgress({
                stage: 'initializing',
                seedsGenerated: 0,
                keywordsGenerated: 0,
                duplicatesFound: 0,
                existingKeywordsFound: 0,
                newKeywordsCollected: 0,
            });
            setGeneratedKeywords([]);
        }

        try {
            // Get Supabase session token
            const { data: { session } } = await supabase.auth.getSession();
            
            const headers: Record<string, string> = { "Content-Type": "application/json" };
            if (session?.access_token) {
                headers["Authorization"] = `Bearer ${session.access_token}`;
            }

            const response = await fetch("/api/custom-search/generate-keywords", {
                method: "POST",
                headers,
                body: JSON.stringify({
                    projectId: currentProjectId,
                    pitch,
                    topics: topics.length > 0 ? topics : undefined,
                    personas: personas.length > 0 ? personas : undefined,
                    painPoints: painPoints.length > 0 ? painPoints : undefined,
                    features: features.length > 0 ? features : undefined,
                    resumeFromProgress: resume && savedProgress ? savedProgress : undefined,
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            // Handle Server-Sent Events
            const reader = response.body?.getReader();
            const decoder = new TextDecoder();

            if (!reader) {
                throw new Error("No response body");
            }

            let buffer = "";
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                    if (line.startsWith("data: ")) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            if (data.type === "progress") {
                                setKeywordProgress(data.data);
                                // Update generated keywords if available in progress
                                if (data.data.newKeywords && Array.isArray(data.data.newKeywords)) {
                                    setGeneratedKeywords(data.data.newKeywords);
                                }
                            } else if (data.type === "complete") {
                                setGeneratedKeywords(data.data.keywords || []);
                                setKeywordProgress(prev => prev ? { ...prev, stage: 'complete', newKeywords: data.data.keywords || [] } : null);
                                // Update saved progress to mark as complete
                                if (currentProjectId) {
                                    queryClient.invalidateQueries({ queryKey: ["/api/custom-search/projects"] });
                                    // Refresh saved progress
                                    setTimeout(() => {
                                        queryClient.invalidateQueries({ queryKey: ["/api/custom-search/projects"] });
                                    }, 500);
                                }
                                toast({
                                    title: "Keywords Generated!",
                                    description: `Successfully generated ${data.data.keywords?.length || 0} keywords`,
                                });
                            } else if (data.type === "error") {
                                throw new Error(data.error || "Unknown error");
                            }
                        } catch (e) {
                            console.error("Error parsing SSE data:", e);
                        }
                    }
                }
            }
        } catch (error) {
            console.error("Error generating keywords:", error);
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "Failed to generate keywords",
                variant: "destructive",
            });
        } finally {
            setIsGeneratingKeywords(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Project Name and Management Buttons */}
            <div className="flex items-center justify-between gap-4 pb-4 border-b border-white/10">
                {/* Project Name */}
                <div className="flex items-center gap-2">
                    {isEditingName ? (
                        <Input
                            {...form.register("name")}
                            placeholder="Enter project name..."
                            className="bg-transparent border-white/20 text-white placeholder:text-white/40 px-0 py-0 h-auto border-b-2 border-white/40 focus:border-white rounded-none focus:ring-0 focus-visible:ring-0"
                            autoFocus
                            onBlur={() => setIsEditingName(false)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.currentTarget.blur();
                                }
                            }}
                        />
                    ) : (
                        <div className="flex items-center gap-2">
                            <span
                                className="text-white/60 hover:text-white/80 transition-colors cursor-pointer px-0 py-2 rounded-none border-b-2 border-transparent hover:border-white/40"
                                onClick={() => setIsEditingName(true)}
                            >
                                {name || "Untitled Project"}
                            </span>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => setIsEditingName(true)}
                                className="h-6 w-6 text-white/40 hover:text-white/60 hover:bg-transparent p-0"
                            >
                                <Pencil className="h-3 w-3" />
                            </Button>
                        </div>
                    )}
                </div>

                {/* Project Management Buttons */}
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
                        onClick={handleNewProject}
                        disabled={createProjectMutation.isPending}
                        className="flex items-center gap-2"
                    >
                        <Plus className="h-4 w-4" />
                        New Project
                    </Button>
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
                            className="min-h-[100px] bg-white/5 border-white/10 text-white placeholder:text-white/40 pr-40 pb-10"
                        />
                        <div className="absolute right-2 bottom-2 flex items-center gap-2">
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() => generateIdeaMutation.mutate({ originalIdea: pitch || null, expand: true })}
                                disabled={generateIdeaMutation.isPending || !pitch || pitch.trim().length === 0}
                                className="h-8 text-blue-300 hover:bg-transparent gap-1.5 px-4"
                                title="Expand current idea"
                            >
                                {generateIdeaMutation.isPending ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin stroke-[2.5]" />
                                        <span className="text-xs">Expanding...</span>
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="h-4 w-4 stroke-[2.5]" />
                                        <span className="text-xs">Expand Current</span>
                                    </>
                                )}
                            </Button>
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
                                        <span className="text-xs">Generate New</span>
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

                {/* Generate Keywords Button */}
                <div className="pt-4 border-t border-white/10 space-y-3">
                    {/* Show resume option if progress exists and is incomplete */}
                    {savedProgress && savedProgress.stage !== 'complete' && (
                        <div className="bg-yellow-500/20 border border-yellow-500/30 rounded-lg p-3">
                            <div className="text-sm text-yellow-200 mb-2">
                                Generation in progress: {savedProgress.newKeywordsCollected} / 1000 keywords
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    type="button"
                                    onClick={() => handleGenerateKeywords(true)}
                                    disabled={isGeneratingKeywords}
                                    className="flex-1 bg-yellow-600 hover:bg-yellow-700"
                                >
                                    {isGeneratingKeywords ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Resuming...
                                        </>
                                    ) : (
                                        <>
                                            <Sparkle className="mr-2 h-4 w-4" />
                                            Resume Generation
                                        </>
                                    )}
                                </Button>
                                <Button
                                    type="button"
                                    onClick={() => {
                                        setSavedProgress(null);
                                        handleGenerateKeywords(false);
                                    }}
                                    disabled={isGeneratingKeywords}
                                    variant="outline"
                                    className="flex-1"
                                >
                                    Start Fresh
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Show completed keywords if generation is complete */}
                    {savedProgress && savedProgress.stage === 'complete' && savedProgress.newKeywords && savedProgress.newKeywords.length > 0 && (
                        <div className="bg-green-500/20 border border-green-500/30 rounded-lg p-3">
                            <div className="text-sm text-green-200 mb-2">
                                ✓ Generation completed: {savedProgress.newKeywords.length} keywords
                            </div>
                            <Button
                                type="button"
                                onClick={() => {
                                    setShowKeywordProgress(true);
                                    setKeywordProgress({
                                        stage: 'complete',
                                        seedsGenerated: savedProgress.seedsGenerated,
                                        keywordsGenerated: savedProgress.keywordsGenerated,
                                        duplicatesFound: savedProgress.duplicatesFound,
                                        existingKeywordsFound: savedProgress.existingKeywordsFound,
                                        newKeywordsCollected: savedProgress.newKeywordsCollected,
                                        seeds: savedProgress.seeds,
                                        allKeywords: savedProgress.allKeywords,
                                        duplicates: savedProgress.duplicates,
                                        existingKeywords: savedProgress.existingKeywords,
                                    });
                                    setGeneratedKeywords(savedProgress.newKeywords);
                                }}
                                variant="outline"
                                className="w-full"
                            >
                                View Keywords
                            </Button>
                        </div>
                    )}

                    {/* Generate Keywords Button */}
                    <div className="flex justify-center">
                        <Button
                            type="button"
                            onClick={() => handleGenerateKeywords(false)}
                            disabled={
                                !pitch ||
                                pitch.trim().length === 0 ||
                                isGeneratingKeywords ||
                                !currentProjectId
                            }
                            className="w-1/2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                        >
                            {isGeneratingKeywords ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Generating Keywords...
                                </>
                            ) : (
                                <>
                                    <Sparkle className="mr-2 h-4 w-4" />
                                    Generate Keywords
                                </>
                            )}
                        </Button>
                    </div>
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

            {/* Keyword Generation Progress Dialog */}
            <Dialog open={showKeywordProgress} onOpenChange={setShowKeywordProgress}>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Generating Keywords</DialogTitle>
                        <DialogDescription>
                            Generating 1000 unique keywords from your custom search inputs...
                        </DialogDescription>
                    </DialogHeader>

                    {keywordProgress && (
                        <div className="space-y-6 mt-4">
                            {/* Stage Indicator */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium text-white">Stage</span>
                                    <span className="text-sm text-white/60 capitalize">
                                        {keywordProgress.stage.replace(/-/g, ' ')}
                                    </span>
                                </div>
                                {keywordProgress.currentSeed && (
                                    <div className="text-xs text-white/40 truncate">
                                        Current seed: {keywordProgress.currentSeed}
                                    </div>
                                )}
                            </div>

                            {/* Progress Metrics */}
                            <div className="grid grid-cols-2 gap-4">
                                {/* Seeds Generated */}
                                <div 
                                    className={`bg-white/5 rounded-lg p-3 cursor-pointer transition-colors hover:bg-white/10 ${
                                        expandedQuadrant === 'seeds' ? 'bg-white/10 border border-white/20' : ''
                                    }`}
                                    onClick={() => setExpandedQuadrant(expandedQuadrant === 'seeds' ? null : 'seeds')}
                                >
                                    <div className="text-xs text-white/60 mb-1">Seeds Generated</div>
                                    <div className="text-2xl font-semibold text-white">
                                        {keywordProgress.seedsGenerated}
                                    </div>
                                    {expandedQuadrant === 'seeds' && keywordProgress.seeds && keywordProgress.seeds.length > 0 && (
                                        <div className="mt-3 max-h-48 overflow-y-auto space-y-1">
                                            {keywordProgress.seeds.map((seed, index) => (
                                                <div key={index} className="text-xs text-white/70 bg-white/5 rounded px-2 py-1">
                                                    {seed}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Keywords Generated */}
                                <div 
                                    className={`bg-white/5 rounded-lg p-3 cursor-pointer transition-colors hover:bg-white/10 ${
                                        expandedQuadrant === 'keywords' ? 'bg-white/10 border border-white/20' : ''
                                    }`}
                                    onClick={() => setExpandedQuadrant(expandedQuadrant === 'keywords' ? null : 'keywords')}
                                >
                                    <div className="text-xs text-white/60 mb-1">Keywords Generated</div>
                                    <div className="text-2xl font-semibold text-white">
                                        {keywordProgress.keywordsGenerated}
                                    </div>
                                    {expandedQuadrant === 'keywords' && keywordProgress.allKeywords && keywordProgress.allKeywords.length > 0 && (
                                        <div className="mt-3 max-h-48 overflow-y-auto">
                                            <div className="flex flex-wrap gap-1">
                                                {keywordProgress.allKeywords.map((keyword, index) => (
                                                    <span key={index} className="text-xs bg-white/10 text-white/70 px-2 py-1 rounded">
                                                        {keyword}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Duplicates Found */}
                                <div 
                                    className={`bg-white/5 rounded-lg p-3 cursor-pointer transition-colors hover:bg-white/10 ${
                                        expandedQuadrant === 'duplicates' ? 'bg-white/10 border border-white/20' : ''
                                    }`}
                                    onClick={() => setExpandedQuadrant(expandedQuadrant === 'duplicates' ? null : 'duplicates')}
                                >
                                    <div className="text-xs text-white/60 mb-1">Duplicates Found</div>
                                    <div className="text-2xl font-semibold text-white">
                                        {keywordProgress.duplicatesFound}
                                    </div>
                                    {expandedQuadrant === 'duplicates' && keywordProgress.duplicates && keywordProgress.duplicates.length > 0 && (
                                        <div className="mt-3 max-h-48 overflow-y-auto">
                                            <div className="flex flex-wrap gap-1">
                                                {keywordProgress.duplicates.map((duplicate, index) => (
                                                    <span key={index} className="text-xs bg-white/10 text-white/70 px-2 py-1 rounded">
                                                        {duplicate}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Existing Keywords */}
                                <div 
                                    className={`bg-white/5 rounded-lg p-3 cursor-pointer transition-colors hover:bg-white/10 ${
                                        expandedQuadrant === 'existing' ? 'bg-white/10 border border-white/20' : ''
                                    }`}
                                    onClick={() => setExpandedQuadrant(expandedQuadrant === 'existing' ? null : 'existing')}
                                >
                                    <div className="text-xs text-white/60 mb-1">Existing Keywords</div>
                                    <div className="text-2xl font-semibold text-white">
                                        {keywordProgress.existingKeywordsFound}
                                    </div>
                                    {expandedQuadrant === 'existing' && keywordProgress.existingKeywords && keywordProgress.existingKeywords.length > 0 && (
                                        <div className="mt-3 max-h-48 overflow-y-auto">
                                            <div className="flex flex-wrap gap-1">
                                                {keywordProgress.existingKeywords.map((keyword, index) => (
                                                    <span key={index} className="text-xs bg-white/10 text-white/70 px-2 py-1 rounded">
                                                        {keyword}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* New Keywords Collected */}
                            <div className="bg-gradient-to-r from-purple-600/20 to-pink-600/20 rounded-lg p-4 border border-purple-500/30">
                                <div className="text-xs text-white/60 mb-1">New Keywords Collected</div>
                                <div className="text-3xl font-bold text-white">
                                    {keywordProgress.newKeywordsCollected}
                                    <span className="text-lg text-white/60 ml-2">/ 1000</span>
                                </div>
                                <div className="mt-2 w-full bg-white/10 rounded-full h-2">
                                    <div
                                        className="bg-gradient-to-r from-purple-600 to-pink-600 h-2 rounded-full transition-all duration-300"
                                        style={{
                                            width: `${Math.min((keywordProgress.newKeywordsCollected / 1000) * 100, 100)}%`,
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Generated Keywords Preview */}
                            {generatedKeywords.length > 0 && (
                                <div className="space-y-2">
                                    <div className="text-sm font-medium text-white">
                                        Generated Keywords ({generatedKeywords.length})
                                    </div>
                                    <div className="max-h-60 overflow-y-auto bg-white/5 rounded-lg p-3">
                                        <div className="flex flex-wrap gap-2">
                                            {generatedKeywords.slice(0, 50).map((keyword, index) => (
                                                <span
                                                    key={index}
                                                    className="text-xs bg-white/10 text-white/80 px-2 py-1 rounded"
                                                >
                                                    {keyword}
                                                </span>
                                            ))}
                                            {generatedKeywords.length > 50 && (
                                                <span className="text-xs text-white/60">
                                                    +{generatedKeywords.length - 50} more
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Completion Message */}
                            {keywordProgress.stage === 'complete' && (
                                <div className="bg-green-500/20 border border-green-500/30 rounded-lg p-4">
                                    <div className="text-sm font-medium text-green-400">
                                        ✓ Keywords Generated Successfully!
                                    </div>
                                    <div className="text-xs text-white/60 mt-1">
                                        {generatedKeywords.length} unique keywords have been generated and saved.
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {isGeneratingKeywords && (
                        <div className="mt-4 flex items-center justify-center">
                            <Loader2 className="h-6 w-6 animate-spin text-white/60" />
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
