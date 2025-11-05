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
import { Loader2, Search, ExternalLink, Building2, Sparkles, Plus, FolderOpen, Pencil, Sparkle, CheckCircle2 } from "lucide-react";
import { CustomSearchProjectBrowser } from "./custom-search-project-browser";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { CustomSearchProject, Keyword } from "@shared/schema";
import { KeywordsTable } from "@/components/keywords-table";
import { TrendChart } from "@/components/trend-chart";
import { KeywordMetricsCards } from "@/components/keyword-metrics-cards";
import { MetricsCards } from "@/components/metrics-cards";
import { AverageTrendChart } from "@/components/average-trend-chart";
import { Checkbox } from "@/components/ui/checkbox";

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
    const [keywordProgressStartTime, setKeywordProgressStartTime] = useState<number | null>(null);
    const [metricsProgressStartTime, setMetricsProgressStartTime] = useState<number | null>(null);
    const [generatedKeywords, setGeneratedKeywords] = useState<string[]>([]);
    const [showQuadrantPopup, setShowQuadrantPopup] = useState(false);
    const [quadrantPopupType, setQuadrantPopupType] = useState<'seeds' | 'keywords' | 'duplicates' | 'existing' | null>(null);
    const [savedProgress, setSavedProgress] = useState<any>(null);
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isInitialLoadRef = useRef(false); // Track if we're in the initial load phase
    const [isFetchingDataForSEO, setIsFetchingDataForSEO] = useState(false);
    const [isComputingMetrics, setIsComputingMetrics] = useState(false);
    const [isGeneratingReport, setIsGeneratingReport] = useState(false);
    const [dataForSEOStats, setDataForSEOStats] = useState<{ keywordsWithData: number; totalKeywords: number; keywordsWithoutData: number } | null>(null);
    const [metricsStats, setMetricsStats] = useState<{ processedCount: number; totalKeywords: number } | null>(null);
    const [reportData, setReportData] = useState<any>(null);
    const [selectedKeyword, setSelectedKeyword] = useState<string | null>(null);
    const [displayedKeywordCount, setDisplayedKeywordCount] = useState(10);
    const [showOnlyFullData, setShowOnlyFullData] = useState(false);

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
        // Skip auto-save if we're loading a project, creating initial project, or in initial load phase
        if (isLoadingProject || createProjectMutation.isPending || isInitialLoadRef.current) {
            // Clear any pending save operations
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
                saveTimeoutRef.current = null;
            }
            return;
        }

        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }

        saveTimeoutRef.current = setTimeout(() => {
            // Double-check we're still not loading (race condition protection)
            if (isLoadingProject || createProjectMutation.isPending || isInitialLoadRef.current) return;
            
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
        // Clear any pending auto-save when loading a project
        if (isLoadingProject) {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
                saveTimeoutRef.current = null;
            }
            return;
        }
        
        autoSave();
        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [name, pitch, topics, personas, painPoints, features, competitors, isLoadingProject, currentProjectId]);

    // Auto-create project on first mount if no projects exist
    const hasAutoLoadedRef = useRef(false); // Track if we've already auto-loaded a project
    useEffect(() => {
        // Don't run if projects are still loading or we've already auto-loaded
        if (!projectsData || hasAutoLoadedRef.current) return;

        // Only auto-create/load if we don't have a current project and we're not manually creating one
        if (projectsData.projects.length === 0 && !currentProjectId && !createProjectMutation.isPending && !isLoadingProject) {
            // Clear any pending auto-save
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
                saveTimeoutRef.current = null;
            }
            
            hasAutoLoadedRef.current = true; // Mark as auto-loaded
            setIsLoadingProject(true);
            isInitialLoadRef.current = true; // Prevent auto-save during creation
            
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
                        isInitialLoadRef.current = false;
                    }, 200);
                },
            });
        } else if (projectsData.projects.length > 0 && !currentProjectId && !isLoadingProject) {
            // Load most recent project
            hasAutoLoadedRef.current = true; // Mark as auto-loaded
            const mostRecent = projectsData.projects[0];
            loadProject(mostRecent);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectsData, currentProjectId]);

    // Load project data into form
    const loadProject = async (project: CustomSearchProject) => {
        // Clear any pending auto-save operations first
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = null;
        }
        
        // Set flag to prevent auto-save during loading
        isInitialLoadRef.current = true;
        
        // Set currentProjectId FIRST before updating form values
        setIsLoadingProject(true);
        setCurrentProjectId(project.id);
        
        // Wait a tick to ensure currentProjectId state is set before updating form values
        await new Promise(resolve => setTimeout(resolve, 0));
        
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
            // If progress exists and is complete, show the keywords and report
            const progress = project.keywordGenerationProgress;
            if ((progress.currentStage === 'complete' || progress.stage === 'complete') && progress.newKeywords) {
                setGeneratedKeywords(progress.newKeywords);
            }
            // Restore stage-specific stats if available
            if (progress.dataForSEOFetched && progress.keywordsFetchedCount !== undefined) {
                setDataForSEOStats({
                    keywordsWithData: progress.keywordsFetchedCount,
                    totalKeywords: progress.newKeywords?.length || 0,
                    keywordsWithoutData: (progress.newKeywords?.length || 0) - progress.keywordsFetchedCount,
                });
            }
            if (progress.metricsComputed && progress.metricsProcessedCount !== undefined) {
                setMetricsStats({
                    processedCount: progress.metricsProcessedCount,
                    totalKeywords: progress.keywordsFetchedCount || progress.newKeywords?.length || 0,
                });
            }
        } else {
            setSavedProgress(null);
        }

        // Load keywords status from database
        try {
            const res = await apiRequest("GET", `/api/custom-search/projects/${project.id}/keywords-status`);
            const status = await res.json();
            
            // Restore keywords list if available
            if (status.keywordList && status.keywordList.length > 0) {
                setGeneratedKeywords(status.keywordList);
            }

            // Restore DataForSEO stats if keywords have data
            if (status.hasDataForSEO) {
                setDataForSEOStats({
                    keywordsWithData: status.keywordsWithData,
                    totalKeywords: status.totalKeywords,
                    keywordsWithoutData: status.totalKeywords - status.keywordsWithData,
                });
            }

            // Restore metrics stats if metrics are computed
            if (status.hasMetrics) {
                setMetricsStats({
                    processedCount: status.keywordsWithMetrics,
                    totalKeywords: status.keywordsWithData,
                });

                // If metrics are computed and report is already generated, try to load the report
                if (savedProgress?.reportGenerated || savedProgress?.currentStage === 'complete') {
                    try {
                        const reportRes = await apiRequest("POST", `/api/custom-search/generate-report`, {
                            projectId: project.id,
                        });
                        const reportResult = await reportRes.json();
                        if (reportResult.success && reportResult.report) {
                            setReportData(reportResult.report);
                            setDisplayedKeywordCount(10); // Reset to 10 when loading report
                            setShowOnlyFullData(false); // Reset filter when loading report
                        }
                    } catch (reportError) {
                        console.error("Error loading report:", reportError);
                        // Don't show error, just continue
                    }
                }
            }
        } catch (error) {
            console.error("Error loading keywords status:", error);
            // Don't show error to user, just continue without restoring status
        }
        
        // Allow auto-save after a short delay to ensure form is fully updated
        setTimeout(() => {
            setIsLoadingProject(false);
            isInitialLoadRef.current = false; // Re-enable auto-save after loading is complete
        }, 200); // Increased delay to ensure all state updates are complete
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
        setDataForSEOStats(null);
        setMetricsStats(null);
        setReportData(null);
        setSelectedKeyword(null);
        setDisplayedKeywordCount(10);
        setShowOnlyFullData(false);

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
                        isInitialLoadRef.current = false; // Re-enable auto-save
                    }, 200);
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

    const handleGenerateFullReport = async (resume: boolean = false) => {
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
        setShowQuadrantPopup(false);
        
        // If resuming, restore progress state
        if (resume && savedProgress) {
            setKeywordProgress({
                stage: savedProgress.currentStage || savedProgress.stage || 'initializing',
                seedsGenerated: savedProgress.seedsGenerated || 0,
                keywordsGenerated: savedProgress.keywordsGenerated || 0,
                duplicatesFound: savedProgress.duplicatesFound || 0,
                existingKeywordsFound: savedProgress.existingKeywordsFound || 0,
                newKeywordsCollected: savedProgress.newKeywordsCollected || 0,
                seeds: savedProgress.seeds || [],
                allKeywords: savedProgress.allKeywords || [],
                duplicates: savedProgress.duplicates || [],
                existingKeywords: savedProgress.existingKeywords || [],
            });
            if (savedProgress.newKeywords) {
                setGeneratedKeywords(savedProgress.newKeywords);
            }
        } else {
            // Initialize with optimistic progress - start showing first stage immediately
            setKeywordProgress({
                stage: 'generating-seeds',
                seedsGenerated: 0,
                keywordsGenerated: 0,
                duplicatesFound: 0,
                existingKeywordsFound: 0,
                newKeywordsCollected: 0,
            });
            setGeneratedKeywords([]);
            // Reset metrics stats
            setDataForSEOStats(null);
            setMetricsStats(null);
            // Reset progress start times for fresh generation
            setKeywordProgressStartTime(null);
            setMetricsProgressStartTime(null);
        }

        try {
            // Get Supabase session token
            const { data: { session } } = await supabase.auth.getSession();
            
            const headers: Record<string, string> = { "Content-Type": "application/json" };
            if (session?.access_token) {
                headers["Authorization"] = `Bearer ${session.access_token}`;
            }

            const response = await fetch("/api/custom-search/generate-full-report", {
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
                                const currentStage = data.currentStage || data.stage || 'initializing';
                                
                                // Track when keyword generation stage starts for optimistic progress
                                if ((currentStage === 'generating-keywords' || currentStage === 'selecting-top-keywords') && !keywordProgressStartTime) {
                                    setKeywordProgressStartTime(Date.now());
                                }
                                
                                // Track when metrics computation stage starts for optimistic progress
                                if (currentStage === 'computing-metrics' && !metricsProgressStartTime) {
                                    setMetricsProgressStartTime(Date.now());
                                }
                                
                                // Update progress with current stage
                                setKeywordProgress({
                                    stage: currentStage,
                                    ...data
                                });
                                // Update generated keywords if available in progress
                                if (data.newKeywords && Array.isArray(data.newKeywords)) {
                                    setGeneratedKeywords(data.newKeywords);
                                }
                                // Update stage-specific stats
                                if (data.keywordsWithData !== undefined) {
                                    setDataForSEOStats({
                                        keywordsWithData: data.keywordsWithData,
                                        totalKeywords: data.totalKeywords || 0,
                                        keywordsWithoutData: (data.totalKeywords || 0) - data.keywordsWithData,
                                    });
                                }
                                if (data.processedCount !== undefined) {
                                    setMetricsStats({
                                        processedCount: data.processedCount,
                                        totalKeywords: data.totalKeywords || 0,
                                    });
                                }
                            } else if (data.type === "complete") {
                                // Final completion - report is ready
                                if (data.report) {
                                    setReportData(data.report);
                                    setDisplayedKeywordCount(10);
                                    setShowOnlyFullData(false);
                                }
                                if (data.newKeywords && Array.isArray(data.newKeywords)) {
                                    setGeneratedKeywords(data.newKeywords);
                                }
                                setKeywordProgress(prev => prev ? { ...prev, stage: 'complete', currentStage: 'complete' } : null);
                                // Reset progress start times
                                setKeywordProgressStartTime(null);
                                setMetricsProgressStartTime(null);
                                // Update saved progress to mark as complete
                                if (currentProjectId) {
                                    queryClient.invalidateQueries({ queryKey: ["/api/custom-search/projects"] });
                                    setTimeout(() => {
                                        queryClient.invalidateQueries({ queryKey: ["/api/custom-search/projects"] });
                                    }, 500);
                                }
                                toast({
                                    title: "Report Generated!",
                                    description: `Successfully generated full report with ${data.report?.totalKeywords || 0} keywords`,
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
            console.error("Error generating full report:", error);
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "Failed to generate full report",
                variant: "destructive",
            });
        } finally {
            setIsGeneratingKeywords(false);
            // Reset progress start times when generation completes or fails
            setKeywordProgressStartTime(null);
            setMetricsProgressStartTime(null);
        }
    };

    const handleLoadMore = () => {
        if (reportData && reportData.keywords) {
            setDisplayedKeywordCount(prev => prev + 5);
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

                {/* Find Competitors and Find Custom Keywords Buttons */}
                <div className="pt-4 border-t border-white/10">
                    <div className="flex gap-3">
                        <Button
                            type="button"
                            onClick={handleFindCompetitors}
                            disabled={
                                !pitch ||
                                pitch.trim().length === 0 ||
                                isFindingCompetitors
                            }
                            className="flex-1"
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
                        <Button
                            type="button"
                            onClick={() => handleGenerateFullReport(false)}
                            disabled={
                                !pitch ||
                                pitch.trim().length === 0 ||
                                isGeneratingKeywords ||
                                !currentProjectId
                            }
                            className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                        >
                            {isGeneratingKeywords ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Finding Keywords...
                                </>
                            ) : (
                                <>
                                    <Sparkle className="mr-2 h-4 w-4" />
                                    Find custom keywords
                                </>
                            )}
                        </Button>
                    </div>

                    {/* Show resume option if progress exists and is incomplete */}
                    {savedProgress && savedProgress.currentStage !== 'complete' && savedProgress.currentStage !== undefined && (
                        <div className="mt-3 bg-yellow-500/20 border border-yellow-500/30 rounded-lg p-3">
                            <div className="text-sm text-yellow-200 mb-2">
                                Generation in progress: {savedProgress.newKeywordsCollected || 0} / 1000 keywords
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    type="button"
                                    onClick={() => handleGenerateFullReport(true)}
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
                                        handleGenerateFullReport(false);
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

                    {/* Inline Step Indicators */}
                    {isGeneratingKeywords && (
                        <div className="mt-4 space-y-2">
                            {/* Step 1: Generating Seeds */}
                            <div className="flex items-center gap-2">
                                {(() => {
                                    const currentStage = keywordProgress?.stage || keywordProgress?.currentStage || '';
                                    const isActive = currentStage === 'generating-seeds';
                                    const isCompleted = ['generating-keywords', 'fetching-dataforseo', 'computing-metrics', 'generating-report', 'complete'].includes(currentStage);
                                    return (
                                        <>
                                            {isCompleted ? (
                                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                                            ) : isActive ? (
                                                <Loader2 className="h-4 w-4 text-yellow-500 animate-spin" />
                                            ) : (
                                                <div className="h-4 w-4 rounded-full border-2 border-white/40" />
                                            )}
                                            <span className={`text-sm ${isCompleted ? 'text-green-500' : isActive ? 'text-yellow-500' : 'text-white/60'}`}>
                                                Generating seeds
                                            </span>
                                        </>
                                    );
                                })()}
                            </div>

                            {/* Step 2: Generating Keywords - with progress bar */}
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    {(() => {
                                        const currentStage = keywordProgress?.stage || keywordProgress?.currentStage || '';
                                        const isActive = currentStage === 'generating-keywords' || currentStage === 'selecting-top-keywords';
                                        const isCompleted = ['fetching-dataforseo', 'computing-metrics', 'generating-report', 'complete'].includes(currentStage);
                                        return (
                                            <>
                                                {isCompleted ? (
                                                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                                                ) : isActive ? (
                                                    <Loader2 className="h-4 w-4 text-yellow-500 animate-spin" />
                                                ) : (
                                                    <div className="h-4 w-4 rounded-full border-2 border-white/40" />
                                                )}
                                                <span className={`text-sm ${isCompleted ? 'text-green-500' : isActive ? 'text-yellow-500' : 'text-white/60'}`}>
                                                    Generating keywords
                                                </span>
                                                {isActive && (
                                                    <span className="text-xs text-white/60 ml-auto">
                                                        {keywordProgress?.newKeywordsCollected || 0} / 1000
                                                    </span>
                                                )}
                                            </>
                                        );
                                    })()}
                                </div>
                                {(() => {
                                    const currentStage = keywordProgress?.stage || keywordProgress?.currentStage || '';
                                    const isActive = currentStage === 'generating-keywords' || currentStage === 'selecting-top-keywords';
                                    if (!isActive) return null;
                                    
                                    // Smooth progress: start animating immediately, update with actual progress
                                    const actualProgress = keywordProgress?.newKeywordsCollected || 0;
                                    const actualPercent = Math.min((actualProgress / 1000) * 100, 100);
                                    
                                    // Optimistic progress: if we just started and have no progress yet, show a small amount
                                    // This prevents the bar from appearing stuck at 0%
                                    let optimisticPercent = actualPercent;
                                    if (actualPercent === 0 && keywordProgressStartTime) {
                                        const timeSinceStart = Date.now() - keywordProgressStartTime;
                                        // Show 2% after 500ms, 5% after 2s to give visual feedback
                                        if (timeSinceStart > 500) {
                                            optimisticPercent = Math.min(2 + (timeSinceStart - 500) / 300, 5);
                                        }
                                    }
                                    
                                    return (
                                        <div className="ml-6">
                                            <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-gradient-to-r from-purple-600 to-pink-600 transition-all duration-500 ease-out"
                                                    style={{
                                                        width: `${Math.max(optimisticPercent, actualPercent)}%`,
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>

                            {/* Step 3: Fetching DataForSEO */}
                            <div className="flex items-center gap-2">
                                {(() => {
                                    const currentStage = keywordProgress?.stage || keywordProgress?.currentStage || '';
                                    const isActive = currentStage === 'fetching-dataforseo';
                                    const isCompleted = ['computing-metrics', 'generating-report', 'complete'].includes(currentStage);
                                    return (
                                        <>
                                            {isCompleted ? (
                                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                                            ) : isActive ? (
                                                <Loader2 className="h-4 w-4 text-yellow-500 animate-spin" />
                                            ) : (
                                                <div className="h-4 w-4 rounded-full border-2 border-white/40" />
                                            )}
                                            <span className={`text-sm ${isCompleted ? 'text-green-500' : isActive ? 'text-yellow-500' : 'text-white/60'}`}>
                                                Fetching DataForSEO metrics
                                            </span>
                                        </>
                                    );
                                })()}
                            </div>

                            {/* Step 4: Computing Metrics - with progress bar */}
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    {(() => {
                                        const currentStage = keywordProgress?.stage || keywordProgress?.currentStage || '';
                                        const isActive = currentStage === 'computing-metrics';
                                        const isCompleted = ['generating-report', 'complete'].includes(currentStage);
                                        return (
                                            <>
                                                {isCompleted ? (
                                                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                                                ) : isActive ? (
                                                    <Loader2 className="h-4 w-4 text-yellow-500 animate-spin" />
                                                ) : (
                                                    <div className="h-4 w-4 rounded-full border-2 border-white/40" />
                                                )}
                                                <span className={`text-sm ${isCompleted ? 'text-green-500' : isActive ? 'text-yellow-500' : 'text-white/60'}`}>
                                                    Computing metrics
                                                </span>
                                                {isActive && metricsStats && (
                                                    <span className="text-xs text-white/60 ml-auto">
                                                        {metricsStats.processedCount} / {metricsStats.totalKeywords}
                                                    </span>
                                                )}
                                            </>
                                        );
                                    })()}
                                </div>
                                {(() => {
                                    const currentStage = keywordProgress?.stage || keywordProgress?.currentStage || '';
                                    const isActive = currentStage === 'computing-metrics';
                                    if (!isActive) return null;
                                    
                                    // Calculate actual progress
                                    const actualPercent = metricsStats && metricsStats.totalKeywords > 0
                                        ? Math.min((metricsStats.processedCount / metricsStats.totalKeywords) * 100, 100)
                                        : 0;
                                    
                                    // Optimistic progress: if we just started and have no progress yet, show a small amount
                                    let optimisticPercent = actualPercent;
                                    if (actualPercent === 0 && metricsProgressStartTime) {
                                        const timeSinceStart = Date.now() - metricsProgressStartTime;
                                        // Show 2% after 500ms, 5% after 2s to give visual feedback
                                        if (timeSinceStart > 500) {
                                            optimisticPercent = Math.min(2 + (timeSinceStart - 500) / 300, 5);
                                        }
                                    }
                                    
                                    return (
                                        <div className="ml-6">
                                            <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-gradient-to-r from-purple-600 to-pink-600 transition-all duration-500 ease-out"
                                                    style={{
                                                        width: `${Math.max(optimisticPercent, actualPercent)}%`,
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>

                            {/* Step 5: Generating Report */}
                            <div className="flex items-center gap-2">
                                {(() => {
                                    const currentStage = keywordProgress?.stage || keywordProgress?.currentStage || '';
                                    const isActive = currentStage === 'generating-report';
                                    const isCompleted = currentStage === 'complete';
                                    return (
                                        <>
                                            {isCompleted ? (
                                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                                            ) : isActive ? (
                                                <Loader2 className="h-4 w-4 text-yellow-500 animate-spin" />
                                            ) : (
                                                <div className="h-4 w-4 rounded-full border-2 border-white/40" />
                                            )}
                                            <span className={`text-sm ${isCompleted ? 'text-green-500' : isActive ? 'text-yellow-500' : 'text-white/60'}`}>
                                                Generating report
                                            </span>
                                        </>
                                    );
                                })()}
                            </div>
                        </div>
                    )}
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

            {/* Quadrant Popup Dialog */}
            <Dialog open={showQuadrantPopup} onOpenChange={setShowQuadrantPopup}>
                <DialogContent className="max-w-2xl max-h-[80vh] bg-gray-900 border-gray-700">
                    <DialogHeader>
                        <DialogTitle className="text-white">
                            {quadrantPopupType === 'seeds' && 'Seeds Generated'}
                            {quadrantPopupType === 'keywords' && 'Keywords Generated'}
                            {quadrantPopupType === 'duplicates' && 'Duplicates Found'}
                            {quadrantPopupType === 'existing' && 'Existing Keywords'}
                        </DialogTitle>
                        <DialogDescription className="text-white/60">
                            {quadrantPopupType === 'seeds' && `Total: ${keywordProgress?.seedsGenerated || 0} seeds`}
                            {quadrantPopupType === 'keywords' && `Total: ${keywordProgress?.keywordsGenerated || 0} keywords`}
                            {quadrantPopupType === 'duplicates' && `Total: ${keywordProgress?.duplicatesFound || 0} duplicates`}
                            {quadrantPopupType === 'existing' && `Total: ${keywordProgress?.existingKeywordsFound || 0} existing keywords`}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="mt-4 max-h-[60vh] overflow-y-auto">
                        {quadrantPopupType === 'seeds' && keywordProgress?.seeds && keywordProgress.seeds.length > 0 && (
                            <div className="space-y-2">
                                {keywordProgress.seeds.map((seed, index) => (
                                    <div key={index} className="text-sm text-white/90 bg-white/5 rounded-lg px-4 py-3 border border-white/10">
                                        {seed}
                                    </div>
                                ))}
                            </div>
                        )}
                        {quadrantPopupType === 'keywords' && keywordProgress?.allKeywords && keywordProgress.allKeywords.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {keywordProgress.allKeywords.map((keyword, index) => (
                                    <span key={index} className="text-sm bg-white/10 text-white/90 px-3 py-2 rounded-lg border border-white/20">
                                        {keyword}
                                    </span>
                                ))}
                            </div>
                        )}
                        {quadrantPopupType === 'duplicates' && keywordProgress?.duplicates && keywordProgress.duplicates.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {keywordProgress.duplicates.map((duplicate, index) => (
                                    <span key={index} className="text-sm bg-orange-500/20 text-orange-200 px-3 py-2 rounded-lg border border-orange-500/30">
                                        {duplicate}
                                    </span>
                                ))}
                            </div>
                        )}
                        {quadrantPopupType === 'existing' && keywordProgress?.existingKeywords && keywordProgress.existingKeywords.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {keywordProgress.existingKeywords.map((keyword, index) => (
                                    <span key={index} className="text-sm bg-blue-500/20 text-blue-200 px-3 py-2 rounded-lg border border-blue-500/30">
                                        {keyword}
                                    </span>
                                ))}
                            </div>
                        )}
                        {(!keywordProgress || 
                            (quadrantPopupType === 'seeds' && (!keywordProgress.seeds || keywordProgress.seeds.length === 0)) ||
                            (quadrantPopupType === 'keywords' && (!keywordProgress.allKeywords || keywordProgress.allKeywords.length === 0)) ||
                            (quadrantPopupType === 'duplicates' && (!keywordProgress.duplicates || keywordProgress.duplicates.length === 0)) ||
                            (quadrantPopupType === 'existing' && (!keywordProgress.existingKeywords || keywordProgress.existingKeywords.length === 0))
                        ) && (
                            <div className="text-center text-white/60 py-8">
                                No items to display yet.
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Report Display */}
            {reportData && reportData.keywords && reportData.keywords.length > 0 && (() => {
                // Filter keywords with full data if checkbox is checked
                // A keyword has "full data" if it has all essential metrics: volume, competition, cpc, and topPageBid
                const filteredKeywords = showOnlyFullData 
                    ? reportData.keywords.filter((k: any) => {
                        // Check if volume exists and is > 0
                        let volume: number | null = null;
                        if (k.volume !== null && k.volume !== undefined) {
                            if (typeof k.volume === 'number') {
                                volume = k.volume;
                            } else if (typeof k.volume === 'string' && k.volume.trim() !== '') {
                                const parsed = parseInt(k.volume, 10);
                                volume = !isNaN(parsed) ? parsed : null;
                            }
                        }
                        const hasVolume = volume !== null && volume > 0;
                        
                        // Check if competition exists
                        let competition: number | null = null;
                        if (k.competition !== null && k.competition !== undefined) {
                            if (typeof k.competition === 'number') {
                                competition = k.competition;
                            } else if (typeof k.competition === 'string' && k.competition.trim() !== '') {
                                const parsed = parseInt(k.competition, 10);
                                competition = !isNaN(parsed) ? parsed : null;
                            }
                        }
                        const hasCompetition = competition !== null;
                        
                        // Check if CPC exists and is > 0
                        let cpc: number | null = null;
                        if (k.cpc !== null && k.cpc !== undefined && k.cpc !== '') {
                            const parsed = parseFloat(k.cpc);
                            cpc = !isNaN(parsed) && parsed > 0 ? parsed : null;
                        }
                        const hasCpc = cpc !== null && cpc > 0;
                        
                        // Check if top page bid exists and is > 0
                        let topPageBid: number | null = null;
                        if (k.topPageBid !== null && k.topPageBid !== undefined && k.topPageBid !== '') {
                            const parsed = parseFloat(k.topPageBid);
                            topPageBid = !isNaN(parsed) && parsed > 0 ? parsed : null;
                        }
                        const hasTopPageBid = topPageBid !== null && topPageBid > 0;
                        
                        // Require all metrics to be present
                        return hasVolume && hasCompetition && hasCpc && hasTopPageBid;
                    })
                    : reportData.keywords;
                
                // Slice keywords based on displayedKeywordCount (same logic as standard search)
                const displayedKeywords = filteredKeywords.slice(0, displayedKeywordCount);
                const hasMoreToShow = displayedKeywordCount < filteredKeywords.length;

                return (
                    <div className="space-y-4 mt-8">
                        <div className="text-center pt-8 pb-4">
                            <h2 className="text-3xl md:text-4xl font-bold text-white leading-tight max-w-3xl mx-auto">
                                {name || "Custom Search Report"}
                            </h2>
                            {pitch && (
                                <p className="text-lg text-white/70 mt-4 max-w-2xl mx-auto">
                                    {pitch}
                                </p>
                            )}
                        </div>

                        <div className="pt-16 space-y-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="text-xl font-semibold text-white/90 mb-2">
                                        Top {displayedKeywords.length} Generated Keywords
                                    </h3>
                                    <p className="text-sm text-white/60">
                                        Click a keyword to view its trend analysis
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Checkbox
                                        id="showOnlyFullData"
                                        checked={showOnlyFullData}
                                        onCheckedChange={(checked) => {
                                            setShowOnlyFullData(checked === true);
                                            setDisplayedKeywordCount(10); // Reset to 10 when toggling filter
                                        }}
                                    />
                                    <label
                                        htmlFor="showOnlyFullData"
                                        className="text-sm text-white/80 cursor-pointer"
                                    >
                                        Only keywords with full data
                                    </label>
                                </div>
                            </div>
                            <KeywordsTable
                                keywords={displayedKeywords as Keyword[]}
                                selectedKeyword={selectedKeyword}
                                onKeywordSelect={setSelectedKeyword}
                                onLoadMore={hasMoreToShow ? handleLoadMore : undefined}
                                reportId={currentProjectId || ""}
                            />
                        </div>

                        {selectedKeyword &&
                            displayedKeywords.find(
                                (k: any) => k.keyword === selectedKeyword,
                            ) && (
                                <div className="grid grid-cols-1 lg:grid-cols-[1fr_175px] gap-4">
                                    <TrendChart
                                        key={`chart-${selectedKeyword}`}
                                        keywords={displayedKeywords as Keyword[]}
                                        reportId={currentProjectId || ""}
                                        selectedKeyword={selectedKeyword}
                                    />
                                    <KeywordMetricsCards
                                        key={`metrics-${selectedKeyword}`}
                                        keyword={
                                            displayedKeywords.find(
                                                (k: any) => k.keyword === selectedKeyword,
                                            ) as Keyword
                                        }
                                        allKeywords={displayedKeywords as Keyword[]}
                                    />
                                </div>
                            )}

                        <div className="pt-16 space-y-4">
                            <h3 className="text-xl font-semibold text-white/90">
                                Aggregated KPIs
                            </h3>
                            <MetricsCards keywords={displayedKeywords as Keyword[]} />
                        </div>

                        <div>
                            <AverageTrendChart keywords={displayedKeywords as Keyword[]} />
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}
