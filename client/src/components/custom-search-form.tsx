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
import type { CustomSearchProject, Keyword } from "@shared/schema";
import { KeywordsTable } from "@/components/keywords-table";
import { TrendChart } from "@/components/trend-chart";
import { KeywordMetricsCards } from "@/components/keyword-metrics-cards";
import { MetricsCards } from "@/components/metrics-cards";
import { AverageTrendChart } from "@/components/average-trend-chart";

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
    const [showQuadrantPopup, setShowQuadrantPopup] = useState(false);
    const [quadrantPopupType, setQuadrantPopupType] = useState<'seeds' | 'keywords' | 'duplicates' | 'existing' | null>(null);
    const [savedProgress, setSavedProgress] = useState<any>(null);
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const [isFetchingDataForSEO, setIsFetchingDataForSEO] = useState(false);
    const [isComputingMetrics, setIsComputingMetrics] = useState(false);
    const [isGeneratingReport, setIsGeneratingReport] = useState(false);
    const [dataForSEOStats, setDataForSEOStats] = useState<{ keywordsWithData: number; totalKeywords: number; keywordsWithoutData: number } | null>(null);
    const [metricsStats, setMetricsStats] = useState<{ processedCount: number; totalKeywords: number } | null>(null);
    const [reportData, setReportData] = useState<any>(null);
    const [selectedKeyword, setSelectedKeyword] = useState<string | null>(null);

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
    const loadProject = async (project: CustomSearchProject) => {
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

                // If metrics are computed, try to load the report
                try {
                    const reportRes = await apiRequest("POST", `/api/custom-search/generate-report`, {
                        projectId: project.id,
                    });
                    const reportResult = await reportRes.json();
                    if (reportResult.success && reportResult.report) {
                        setReportData(reportResult.report);
                    }
                } catch (reportError) {
                    console.error("Error loading report:", reportError);
                    // Don't show error, just continue
                }
            }
        } catch (error) {
            console.error("Error loading keywords status:", error);
            // Don't show error to user, just continue without restoring status
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
        setDataForSEOStats(null);
        setMetricsStats(null);
        setReportData(null);

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
        setShowQuadrantPopup(false);
        
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

    const handleFetchDataForSEO = async () => {
        if (!currentProjectId) {
            toast({
                title: "Error",
                description: "Please save your project first",
                variant: "destructive",
            });
            return;
        }

        setIsFetchingDataForSEO(true);
        try {
            const res = await apiRequest("POST", "/api/custom-search/fetch-dataforseo", {
                projectId: currentProjectId,
            });
            const result = await res.json();
            
            if (result.success) {
                setDataForSEOStats({
                    keywordsWithData: result.keywordsWithData,
                    totalKeywords: result.totalKeywords,
                    keywordsWithoutData: result.keywordsWithoutData,
                });
                toast({
                    title: "DataForSEO Metrics Fetched!",
                    description: `${result.keywordsWithData} out of ${result.totalKeywords} keywords had data`,
                });
                // Refresh project data
                queryClient.invalidateQueries({ queryKey: ["/api/custom-search/projects"] });
            } else {
                throw new Error(result.message || "Failed to fetch DataForSEO metrics");
            }
        } catch (error) {
            console.error("Error fetching DataForSEO metrics:", error);
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "Failed to fetch DataForSEO metrics",
                variant: "destructive",
            });
        } finally {
            setIsFetchingDataForSEO(false);
        }
    };

    const handleComputeMetrics = async () => {
        if (!currentProjectId) {
            toast({
                title: "Error",
                description: "Please save your project first",
                variant: "destructive",
            });
            return;
        }

        setIsComputingMetrics(true);
        try {
            const res = await apiRequest("POST", "/api/custom-search/compute-metrics", {
                projectId: currentProjectId,
            });
            const result = await res.json();
            
            if (result.success) {
                setMetricsStats({
                    processedCount: result.processedCount,
                    totalKeywords: result.totalKeywords,
                });
                toast({
                    title: "Metrics Computed!",
                    description: `Processed ${result.processedCount} out of ${result.totalKeywords} keywords`,
                });
                // Refresh project data
                queryClient.invalidateQueries({ queryKey: ["/api/custom-search/projects"] });
            } else {
                throw new Error(result.message || "Failed to compute metrics");
            }
        } catch (error) {
            console.error("Error computing metrics:", error);
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "Failed to compute metrics",
                variant: "destructive",
            });
        } finally {
            setIsComputingMetrics(false);
        }
    };

    const handleGenerateReport = async () => {
        if (!currentProjectId) {
            toast({
                title: "Error",
                description: "Please save your project first",
                variant: "destructive",
            });
            return;
        }

        setIsGeneratingReport(true);
        try {
            const res = await apiRequest("POST", "/api/custom-search/generate-report", {
                projectId: currentProjectId,
            });
            const result = await res.json();
            
            if (result.success) {
                setReportData(result.report);
                toast({
                    title: "Report Generated!",
                    description: `Report generated for ${result.report.totalKeywords} keywords`,
                });
            } else {
                throw new Error(result.message || "Failed to generate report");
            }
        } catch (error) {
            console.error("Error generating report:", error);
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "Failed to generate report",
                variant: "destructive",
            });
        } finally {
            setIsGeneratingReport(false);
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

                    {/* Show completed keywords if generation is complete OR if keywords exist in database */}
                    {((savedProgress && savedProgress.stage === 'complete' && savedProgress.newKeywords && savedProgress.newKeywords.length > 0) || generatedKeywords.length > 0) && (
                        <div className="bg-green-500/20 border border-green-500/30 rounded-lg p-3 space-y-3">
                            <div className="text-sm text-green-200 mb-2">
                                ✓ {savedProgress?.stage === 'complete' ? 'Generation completed' : 'Keywords loaded'}: {generatedKeywords.length} keywords
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

                            {/* DataForSEO Fetch Button */}
                            <div className="space-y-2">
                                <Button
                                    type="button"
                                    onClick={handleFetchDataForSEO}
                                    disabled={isFetchingDataForSEO || !currentProjectId || dataForSEOStats !== null}
                                    className="w-full bg-blue-600 hover:bg-blue-700"
                                >
                                    {isFetchingDataForSEO ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Fetching DataForSEO...
                                        </>
                                    ) : dataForSEOStats ? (
                                        <>
                                            <Search className="mr-2 h-4 w-4" />
                                            DataForSEO Fetched
                                        </>
                                    ) : (
                                        <>
                                            <Search className="mr-2 h-4 w-4" />
                                            Fetch DataForSEO
                                        </>
                                    )}
                                </Button>
                                {dataForSEOStats && (
                                    <div className="text-xs text-green-200">
                                        {dataForSEOStats.keywordsWithData} / {dataForSEOStats.totalKeywords} keywords had data
                                    </div>
                                )}
                            </div>

                            {/* Compute Metrics Button */}
                            <div className="space-y-2">
                                <Button
                                    type="button"
                                    onClick={handleComputeMetrics}
                                    disabled={isComputingMetrics || !currentProjectId || !dataForSEOStats || metricsStats !== null}
                                    className="w-full bg-purple-600 hover:bg-purple-700"
                                >
                                    {isComputingMetrics ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Computing Metrics...
                                        </>
                                    ) : metricsStats ? (
                                        <>
                                            <Sparkles className="mr-2 h-4 w-4" />
                                            Metrics Computed
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles className="mr-2 h-4 w-4" />
                                            Compute Metrics
                                        </>
                                    )}
                                </Button>
                                {metricsStats && (
                                    <div className="text-xs text-green-200">
                                        Processed {metricsStats.processedCount} / {metricsStats.totalKeywords} keywords
                                    </div>
                                )}
                            </div>

                            {/* Generate Report Button */}
                            <div className="space-y-2">
                                <Button
                                    type="button"
                                    onClick={handleGenerateReport}
                                    disabled={isGeneratingReport || !currentProjectId || !metricsStats}
                                    className="w-full bg-indigo-600 hover:bg-indigo-700"
                                >
                                    {isGeneratingReport ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Generating Report...
                                        </>
                                    ) : (
                                        <>
                                            <Sparkle className="mr-2 h-4 w-4" />
                                            Generate Report
                                        </>
                                    )}
                                </Button>
                                {reportData && (
                                    <div className="text-xs text-green-200">
                                        Report generated for {reportData.totalKeywords} keywords
                                    </div>
                                )}
                            </div>
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
                                    className="bg-white/5 rounded-lg p-3 cursor-pointer transition-colors hover:bg-white/10"
                                    onClick={() => {
                                        setQuadrantPopupType('seeds');
                                        setShowQuadrantPopup(true);
                                    }}
                                >
                                    <div className="text-xs text-white/60 mb-1">Seeds Generated</div>
                                    <div className="text-2xl font-semibold text-white">
                                        {keywordProgress.seedsGenerated}
                                    </div>
                                </div>

                                {/* Keywords Generated */}
                                <div 
                                    className="bg-white/5 rounded-lg p-3 cursor-pointer transition-colors hover:bg-white/10"
                                    onClick={() => {
                                        setQuadrantPopupType('keywords');
                                        setShowQuadrantPopup(true);
                                    }}
                                >
                                    <div className="text-xs text-white/60 mb-1">Keywords Generated</div>
                                    <div className="text-2xl font-semibold text-white">
                                        {keywordProgress.keywordsGenerated}
                                    </div>
                                </div>

                                {/* Duplicates Found */}
                                <div 
                                    className="bg-white/5 rounded-lg p-3 cursor-pointer transition-colors hover:bg-white/10"
                                    onClick={() => {
                                        setQuadrantPopupType('duplicates');
                                        setShowQuadrantPopup(true);
                                    }}
                                >
                                    <div className="text-xs text-white/60 mb-1">Duplicates Found</div>
                                    <div className="text-2xl font-semibold text-white">
                                        {keywordProgress.duplicatesFound}
                                    </div>
                                </div>

                                {/* Existing Keywords */}
                                <div 
                                    className="bg-white/5 rounded-lg p-3 cursor-pointer transition-colors hover:bg-white/10"
                                    onClick={() => {
                                        setQuadrantPopupType('existing');
                                        setShowQuadrantPopup(true);
                                    }}
                                >
                                    <div className="text-xs text-white/60 mb-1">Existing Keywords</div>
                                    <div className="text-2xl font-semibold text-white">
                                        {keywordProgress.existingKeywordsFound}
                                    </div>
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
            {reportData && reportData.keywords && reportData.keywords.length > 0 && (
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
                        <div>
                            <h3 className="text-xl font-semibold text-white/90 mb-2">
                                Generated Keywords ({reportData.keywords.length})
                            </h3>
                            <p className="text-sm text-white/60">
                                Click a keyword to view its trend analysis
                            </p>
                        </div>
                        <KeywordsTable
                            keywords={reportData.keywords as Keyword[]}
                            selectedKeyword={selectedKeyword}
                            onKeywordSelect={setSelectedKeyword}
                            reportId={currentProjectId || ""}
                        />
                    </div>

                    {selectedKeyword &&
                        reportData.keywords.find(
                            (k: any) => k.keyword === selectedKeyword,
                        ) && (
                            <div className="grid grid-cols-1 lg:grid-cols-[1fr_175px] gap-4">
                                <TrendChart
                                    key={`chart-${selectedKeyword}`}
                                    keywords={reportData.keywords as Keyword[]}
                                    reportId={currentProjectId || ""}
                                    selectedKeyword={selectedKeyword}
                                />
                                <KeywordMetricsCards
                                    key={`metrics-${selectedKeyword}`}
                                    keyword={
                                        reportData.keywords.find(
                                            (k: any) => k.keyword === selectedKeyword,
                                        ) as Keyword
                                    }
                                    allKeywords={reportData.keywords as Keyword[]}
                                />
                            </div>
                        )}

                    <div className="pt-16 space-y-4">
                        <h3 className="text-xl font-semibold text-white/90">
                            Aggregated KPIs
                        </h3>
                        <MetricsCards keywords={reportData.keywords as Keyword[]} />
                    </div>

                    <div>
                        <AverageTrendChart keywords={reportData.keywords as Keyword[]} />
                    </div>
                </div>
            )}
        </div>
    );
}
