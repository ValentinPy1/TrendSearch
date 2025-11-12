import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ListInput } from "@/components/ui/list-input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { LocationSelector } from "@/components/ui/location-selector";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { supabase } from "@/lib/supabase";
import { Loader2, Search, ExternalLink, Building2, Sparkles, Plus, FolderOpen, Pencil, Sparkle, CheckCircle2, Save, HelpCircle, MapPin } from "lucide-react";
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
    const [queryKeywords, setQueryKeywords] = useState<string[]>([]);
    const [isGeneratingTopics, setIsGeneratingTopics] = useState(false);
    const [isGeneratingPersonas, setIsGeneratingPersonas] = useState(false);
    const [isGeneratingPainPoints, setIsGeneratingPainPoints] =
        useState(false);
    const [isGeneratingFeatures, setIsGeneratingFeatures] = useState(false);
    const [isGeneratingQueryKeywords, setIsGeneratingQueryKeywords] = useState(false);
    const [isFindingCompetitors, setIsFindingCompetitors] = useState(false);
    const [competitors, setCompetitors] = useState<Competitor[]>([]);
    const [competitorProgress, setCompetitorProgress] = useState<{
        stage: string;
        completedCount?: number;
        totalCount?: number;
    } | null>(null);
    const [competitorStepStartTime, setCompetitorStepStartTime] = useState<number | null>(null);
    const [competitorElapsedTime, setCompetitorElapsedTime] = useState<number>(0);
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
    const [stepStartTimes, setStepStartTimes] = useState<Record<string, number>>({});
    const [elapsedTimes, setElapsedTimes] = useState<Record<string, number>>({});
    const [generatedKeywords, setGeneratedKeywords] = useState<string[]>([]);
    const [showQuadrantPopup, setShowQuadrantPopup] = useState(false);
    const [quadrantPopupType, setQuadrantPopupType] = useState<'seeds' | 'keywords' | 'duplicates' | 'existing' | null>(null);
    const [savedProgress, setSavedProgress] = useState<any>(null);
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isInitialLoadRef = useRef(false); // Track if we're in the initial load phase
    const isCreatingProjectRef = useRef(false); // Track if a project is being created to prevent duplicates
    const [isFetchingDataForSEO, setIsFetchingDataForSEO] = useState(false);
    const [isComputingMetrics, setIsComputingMetrics] = useState(false);
    const [isGeneratingReport, setIsGeneratingReport] = useState(false);
    const [isLoadingReport, setIsLoadingReport] = useState(false);
    const [dataForSEOStats, setDataForSEOStats] = useState<{ keywordsWithData: number; totalKeywords: number; keywordsWithoutData: number } | null>(null);
    const [metricsStats, setMetricsStats] = useState<{ processedCount: number; totalKeywords: number } | null>(null);
    const [reportData, setReportData] = useState<any>(null);
    const [selectedKeyword, setSelectedKeyword] = useState<string | null>(null);
    const [displayedKeywordCount, setDisplayedKeywordCount] = useState(10);
    const [showOnlyFullData, setShowOnlyFullData] = useState(false);
    const [websiteUrl, setWebsiteUrl] = useState<string>("");
    const [isFindingKeywordsFromWebsite, setIsFindingKeywordsFromWebsite] = useState(false);
    const [activeSubTab, setActiveSubTab] = useState<string>("competitors");
    const [selectedLocation, setSelectedLocation] = useState<{ code: number; name: string } | null>(null);
    const [showHelpDialog, setShowHelpDialog] = useState(false);
    const pitchTextareaRef = useRef<HTMLTextAreaElement | null>(null);

    const form = useForm<FormData>({
        defaultValues: {
            name: "",
            pitch: "",
        },
    });

    const pitch = form.watch("pitch");
    const name = form.watch("name");

    // Auto-resize pitch textarea
    const resizePitchTextarea = () => {
        const textarea = pitchTextareaRef.current;
        if (textarea) {
            // Reset height to auto to get the correct scrollHeight
            textarea.style.height = 'auto';
            // Set height based on scrollHeight, with minimum of 2 lines (~52px) and padding for buttons
            const minHeight = 52; // ~2 lines
            const paddingForButtons = 40; // Space for buttons at bottom
            const newHeight = Math.max(minHeight, textarea.scrollHeight) + paddingForButtons;
            textarea.style.height = `${newHeight}px`;
        }
    };

    // Resize textarea when pitch changes
    useEffect(() => {
        // Use setTimeout to ensure DOM has updated
        const timeoutId = setTimeout(() => {
            resizePitchTextarea();
        }, 0);
        return () => clearTimeout(timeoutId);
    }, [pitch]);

    // Query to check if user has any projects
    const { data: projectsData, isLoading: isLoadingProjects, isFetching: isFetchingProjects } = useQuery<{ projects: CustomSearchProject[] }>({
        queryKey: ["/api/custom-search/projects"],
        queryFn: async () => {
            const res = await apiRequest("GET", "/api/custom-search/projects");
            return res.json();
        },
    });

    // Track which project the report is for
    const reportProjectIdRef = useRef<string | null>(null);

    // Clear report data when project changes
    const previousProjectIdRef = useRef<string | null>(null);
    useEffect(() => {
        // If project ID changed, clear report data
        if (previousProjectIdRef.current !== null && previousProjectIdRef.current !== currentProjectId) {
            setReportData(null);
            reportProjectIdRef.current = null;
            setGeneratedKeywords([]);
            setSelectedKeyword(null);
            setDisplayedKeywordCount(10);
            setShowOnlyFullData(false);
        }
        previousProjectIdRef.current = currentProjectId;
    }, [currentProjectId]);

    // Update saved progress when project data changes
    useEffect(() => {
        // Don't clear project if query is loading or fetching (prevents clearing during refetches when switching tabs)
        if (isLoadingProjects || isFetchingProjects) {
            return;
        }

        if (currentProjectId && projectsData?.projects) {
            const currentProject = projectsData.projects.find(p => p.id === currentProjectId);

            // If current project was deleted, clear the form
            // BUT: Don't clear if we're currently creating a project (race condition protection)
            // AND: Don't clear if query is loading/fetching (prevents clearing during refetches)
            if (!currentProject && currentProjectId && !isCreatingProjectRef.current && !createProjectMutation.isPending && !isLoadingProjects && !isFetchingProjects) {
                setCurrentProjectId(null);
                form.reset({ name: "", pitch: "" });
                setTopics([]);
                setPersonas([]);
                setPainPoints([]);
                setFeatures([]);
                setCompetitors([]);
                setQueryKeywords([]);
                setReportData(null);
                setGeneratedKeywords([]);
                setSavedProgress(null);
                return;
            }

            // If project exists and is the current project, ensure form values are populated
            // This ensures form values persist after project creation and query refetch
            // IMPORTANT: Only restore form values if they're empty - don't overwrite user input
            // This is especially important for automatic project creation (Find Competitors, Find Keywords)
            // where we want to preserve what the user is typing
            if (currentProject && currentProject.id === currentProjectId && !isCreatingProjectRef.current && !createProjectMutation.isPending) {
                const currentFormValues = form.getValues();
                // Only restore if form is empty but project has a value
                // This prevents overwriting user input during automatic project creation
                if (currentProject.pitch !== undefined) {
                    const projectPitch = currentProject.pitch || "";
                    const formPitch = currentFormValues.pitch || "";
                    // Only update if form is completely empty but project has a value
                    // This preserves user input during automatic project creation
                    if (!formPitch && projectPitch) {
                        form.setValue("pitch", projectPitch);
                    }
                }
                if (currentProject.name !== undefined) {
                    const projectName = currentProject.name || "";
                    const formName = currentFormValues.name || "";
                    // Only update if form is completely empty but project has a value
                    // This preserves user input during automatic project creation
                    if (!formName && projectName) {
                        form.setValue("name", projectName);
                    }
                }

                // Restore array fields only if form arrays are empty but project has values
                // This preserves user input while ensuring data is loaded when needed
                if (currentProject.topics && currentProject.topics.length > 0 && topics.length === 0) {
                    setTopics(currentProject.topics);
                }
                if (currentProject.personas && currentProject.personas.length > 0 && personas.length === 0) {
                    setPersonas(currentProject.personas);
                }
                if (currentProject.painPoints && currentProject.painPoints.length > 0 && painPoints.length === 0) {
                    setPainPoints(currentProject.painPoints);
                }
                if (currentProject.features && currentProject.features.length > 0 && features.length === 0) {
                    setFeatures(currentProject.features);
                }
                if (currentProject.competitors && currentProject.competitors.length > 0 && competitors.length === 0) {
                    setCompetitors(currentProject.competitors);
                }
            }

            if (currentProject?.keywordGenerationProgress) {
                const progress = currentProject.keywordGenerationProgress;
                setSavedProgress(progress);

                // If complete, update generated keywords and report
                if (progress.stage === 'complete' && progress.newKeywords) {
                    setGeneratedKeywords(progress.newKeywords);
                }

                // Always display report if it exists (only for current project)
                // Check both reportGenerated flag and stage === 'complete' (in case reportGenerated is not set)
                if (currentProject.id === currentProjectId) {
                    if (progress.reportGenerated || progress.stage === 'complete') {
                        // Only load if report data doesn't already exist for this project
                        if (reportProjectIdRef.current !== currentProjectId) {
                            loadReportForProject(currentProjectId);
                        }
                    }
                }
            } else if (currentProject) {
                // If no progress object exists, still try to load report if project might have keywords
                // This handles cases where projects were completed before progress tracking was added
                if (currentProject.id === currentProjectId && reportProjectIdRef.current !== currentProjectId) {
                    // Check keywords status first before attempting to generate report
                    (async () => {
                        try {
                            // First check if project has keywords with data
                            const statusRes = await apiRequest("GET", `/api/custom-search/projects/${currentProjectId}/keywords-status`);
                            const status = await statusRes.json();

                            // Only try to generate report if keywords with data exist
                            if (status.hasDataForSEO && status.keywordsWithData > 0) {
                                const reportRes = await apiRequest("POST", `/api/custom-search/generate-report`, {
                                    projectId: currentProjectId,
                                });
                                const reportResult = await reportRes.json();
                                // Double-check that this is still the current project before setting report data
                                if (reportResult.success && reportResult.report) {
                                    setReportData(reportResult.report);
                                    reportProjectIdRef.current = currentProjectId;
                                    setDisplayedKeywordCount(10);
                                    setShowOnlyFullData(false);
                                }
                            }
                        } catch (error) {
                            // Silently fail if no report exists - this is expected for projects without keywords
                            // Don't log errors for projects without keywords as this is normal
                        }
                    })();
                } else if (reportProjectIdRef.current === currentProjectId) {
                    // If we already have report data for this project, don't clear it
                    // This preserves the report even if progress object is missing
                }
            }
        } else if (!currentProjectId) {
            // If no project selected, clear report data
            setReportData(null);
            reportProjectIdRef.current = null;
        }
    }, [projectsData, currentProjectId, isLoadingProjects, isFetchingProjects]);

    // Poll for computed metrics while they're being computed
    useEffect(() => {
        if (!currentProjectId || !reportData || savedProgress?.metricsComputed !== false) {
            return;
        }

        const pollInterval = setInterval(async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                const headers: Record<string, string> = {};
                if (session?.access_token) {
                    headers["Authorization"] = `Bearer ${session.access_token}`;
                }

                const response = await fetch(`/api/custom-search/projects/${currentProjectId}/computed-metrics`, {
                    headers,
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data.metrics && Object.keys(data.metrics).length > 0 && reportData?.keywords) {
                        // Merge computed metrics into report data
                        const updatedKeywords = reportData.keywords.map((kw: any) => {
                            const computedMetrics = data.metrics[kw.id];
                            if (computedMetrics) {
                                return {
                                    ...kw,
                                    volatility: computedMetrics.volatility || kw.volatility,
                                    trendStrength: computedMetrics.trendStrength || kw.trendStrength,
                                    growth3m: computedMetrics.growth3m || kw.growth3m,
                                    growthYoy: computedMetrics.growthYoy || kw.growthYoy,
                                };
                            }
                            return kw;
                        });

                        setReportData({
                            ...reportData,
                            keywords: updatedKeywords,
                        });
                    }
                }
            } catch (error) {
                console.error("Error fetching computed metrics:", error);
            }
        }, 2000); // Poll every 2 seconds

        return () => clearInterval(pollInterval);
    }, [currentProjectId, reportData, savedProgress?.metricsComputed]);

    // Auto-resume incomplete pipelines on page load
    useEffect(() => {
        if (currentProjectId && projectsData?.projects && !isInitialLoadRef.current) {
            const currentProject = projectsData.projects.find(p => p.id === currentProjectId);
            if (currentProject?.keywordGenerationProgress) {
                const progress = currentProject.keywordGenerationProgress;
                const currentStage = progress.currentStage || progress.stage || '';
                const isComplete = currentStage === 'complete';
                const isError = currentStage === 'error';
                const isRunning = !isComplete && !isError && currentStage !== 'idle' && currentStage !== '';

                // If pipeline is running, auto-resume polling
                if (isRunning) {
                    // Restore progress state
                    setKeywordProgress({
                        stage: currentStage,
                        seedsGenerated: progress.seedsGenerated || 0,
                        keywordsGenerated: progress.keywordsGenerated || 0,
                        duplicatesFound: progress.duplicatesFound || 0,
                        existingKeywordsFound: progress.existingKeywordsFound || 0,
                        newKeywordsCollected: progress.newKeywordsCollected || 0,
                        newKeywords: progress.newKeywords || [],
                    });

                    if (progress.newKeywords) {
                        setGeneratedKeywords(progress.newKeywords);
                    }

                    // Start polling
                    setIsFindingKeywordsFromWebsite(true);
                    setIsGeneratingKeywords(true);
                    // Initialize previous status to 'running' so we can detect completion
                    previousPipelineStatusRef.current = 'running';
                    pollPipelineStatus(currentProjectId);
                    pollingIntervalRef.current = setInterval(() => {
                        pollPipelineStatus(currentProjectId);
                    }, 2000);
                } else if (isComplete && progress.reportGenerated) {
                    // Pipeline complete - load report
                    loadReportForProject(currentProjectId);
                }
            }

            isInitialLoadRef.current = true;
        }
    }, [currentProjectId, projectsData]);

    // Cleanup polling on unmount
    useEffect(() => {
        return () => {
            stopPolling();
        };
    }, []);

    // Load report for a project
    const loadReportForProject = async (projectId: string) => {
        // Only load report if it's for the current project
        if (projectId !== currentProjectId) {
            return;
        }

        setIsLoadingReport(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const headers: Record<string, string> = {};
            if (session?.access_token) {
                headers["Authorization"] = `Bearer ${session.access_token}`;
            }

            const response = await fetch(`/api/custom-search/pipeline-status/${projectId}`, {
                method: "GET",
                headers,
            });

            if (response.ok) {
                const data = await response.json();
                // Double-check that this is still the current project before setting report data
                if (data.report && projectId === currentProjectId) {
                    setReportData(data.report);
                    reportProjectIdRef.current = projectId;
                    if (data.report.keywords && Array.isArray(data.report.keywords)) {
                        // Extract keywords from report if needed
                        const keywords = data.report.keywords.map((k: any) => k.keyword || k).filter(Boolean);
                        if (keywords.length > 0) {
                            setGeneratedKeywords(keywords);
                        }
                    }
                }
            }
        } catch (error) {
            console.error("Error loading report:", error);
        } finally {
            setIsLoadingReport(false);
        }
    };

    // Use ref to track step start times to avoid closure issues in timer
    const stepStartTimesRef = useRef<Record<string, number>>({});
    useEffect(() => {
        stepStartTimesRef.current = stepStartTimes;
    }, [stepStartTimes]);

    // Update elapsed time for competitor progress
    useEffect(() => {
        if (!competitorStepStartTime || !isFindingCompetitors) {
            setCompetitorElapsedTime(0);
            return;
        }

        const interval = setInterval(() => {
            setCompetitorElapsedTime(Math.floor((Date.now() - competitorStepStartTime) / 1000));
        }, 1000);

        return () => clearInterval(interval);
    }, [competitorStepStartTime, isFindingCompetitors]);

    // Update elapsed times every second for active steps
    useEffect(() => {
        if (!isGeneratingKeywords || Object.keys(stepStartTimes).length === 0) {
            return;
        }

        const interval = setInterval(() => {
            setElapsedTimes(prev => {
                const currentTimes: Record<string, number> = {};
                const currentStepStartTimes = stepStartTimesRef.current;
                const currentStage = keywordProgress?.stage || '';

                Object.entries(currentStepStartTimes).forEach(([stepKey, startTime]) => {
                    const stepMap: Record<string, string[]> = {
                        'calling-api': ['calling-api'],
                        'creating-task': ['creating-task'],
                        'polling-task': ['polling-task'],
                        'extracting-keywords': ['extracting-keywords'],
                        'fetching-dataforseo': ['fetching-dataforseo'],
                        'computing-metrics': ['computing-metrics'],
                        'generating-report': ['generating-report']
                    };

                    const isActive = stepMap[stepKey]?.includes(currentStage) || false;
                    if (isActive) {
                        // Calculate elapsed time from start time, preserving it even if progress updates reset state
                        const elapsed = Math.floor((Date.now() - startTime) / 1000);
                        currentTimes[stepKey] = elapsed;
                    } else {
                        // If step is completed, preserve the last elapsed time instead of resetting
                        // This prevents the time from resetting when progress updates come in
                        const lastElapsed = prev[stepKey];
                        if (lastElapsed !== undefined && lastElapsed > 0) {
                            currentTimes[stepKey] = lastElapsed;
                        }
                    }
                });

                // Merge with previous times to preserve all step times
                return { ...prev, ...currentTimes };
            });
        }, 1000);

        return () => clearInterval(interval);
    }, [isGeneratingKeywords, keywordProgress]);

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
            isCreatingProjectRef.current = false; // Clear guard after setting currentProjectId

            // Preserve all current form values - don't let query refetch clear them
            // The form already has the correct values that were just saved
            // We don't need to update the form from the server response since we just sent those values

            // Invalidate queries to refresh the projects list
            // Use optimistic update to immediately add the new project to the cache
            // This prevents the form from being cleared during refetch
            queryClient.setQueryData<{ projects: CustomSearchProject[] }>(
                ["/api/custom-search/projects"],
                (oldData) => {
                    if (!oldData) return { projects: [result.project] };
                    // Check if project already exists in the list
                    const exists = oldData.projects.some(p => p.id === result.project.id);
                    if (exists) {
                        // Update existing project
                        return {
                            projects: oldData.projects.map(p =>
                                p.id === result.project.id ? result.project : p
                            )
                        };
                    }
                    // Add new project at the beginning
                    return {
                        projects: [result.project, ...oldData.projects]
                    };
                }
            );

            // Then invalidate to ensure we have the latest data (but form won't clear because of optimistic update)
            queryClient.invalidateQueries({ queryKey: ["/api/custom-search/projects"] });
        },
        onError: (error) => {
            isCreatingProjectRef.current = false; // Clear guard on error
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

    // Auto-save function with debouncing (only for existing projects)
    const autoSave = () => {
        // Skip auto-save if we're loading a project, creating initial project, or in initial load phase
        if (isLoadingProject || createProjectMutation.isPending || isInitialLoadRef.current || isCreatingProjectRef.current) {
            // Clear any pending save operations
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
                saveTimeoutRef.current = null;
            }
            return;
        }

        // Only auto-save if project already exists
        if (!currentProjectId) {
            return;
        }

        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }

        saveTimeoutRef.current = setTimeout(() => {
            // Double-check we're still not loading (race condition protection)
            if (isLoadingProject || createProjectMutation.isPending || isInitialLoadRef.current || isCreatingProjectRef.current) return;

            // Only update existing projects
            if (currentProjectId) {
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

    // Auto-save on form changes (only for existing projects)
    useEffect(() => {
        // Clear any pending auto-save when loading a project
        if (isLoadingProject) {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
                saveTimeoutRef.current = null;
            }
            return;
        }

        // Only auto-save if project exists
        if (currentProjectId) {
            autoSave();
        }

        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [name, pitch, topics, personas, painPoints, features, competitors, isLoadingProject, currentProjectId]);

    // Auto-load disabled - projects are only loaded when explicitly selected by the user
    // Removed auto-load behavior to allow users to start with a blank form

    // Load project data into form
    const loadProject = async (project: CustomSearchProject) => {
        // Clear any pending auto-save operations first
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = null;
        }

        // Clear report data when switching projects
        setReportData(null);
        setIsLoadingReport(false);
        setGeneratedKeywords([]);
        setSelectedKeyword(null);
        setDisplayedKeywordCount(10);
        setShowOnlyFullData(false);

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
        // If keywordGenerationProgress is missing, fetch the project individually to get full data
        let projectWithProgress = project;
        if (!project.keywordGenerationProgress) {
            try {
                const projectRes = await apiRequest("GET", `/api/custom-search/projects/${project.id}`);
                const projectData = await projectRes.json();
                if (projectData.project && projectData.project.keywordGenerationProgress) {
                    projectWithProgress = projectData.project;
                    console.log("Fetched project individually to get progress:", {
                        projectId: project.id,
                        hasProgress: !!projectData.project.keywordGenerationProgress
                    });
                }
            } catch (error) {
                console.error("Error fetching project individually:", error);
            }
        }

        console.log("Loading project:", {
            projectId: projectWithProgress.id,
            hasKeywordGenerationProgress: !!projectWithProgress.keywordGenerationProgress,
            keywordGenerationProgress: projectWithProgress.keywordGenerationProgress,
            projectKeys: Object.keys(projectWithProgress)
        });

        // Load query keywords from saved progress
        if (projectWithProgress.keywordGenerationProgress?.queryKeywords && Array.isArray(projectWithProgress.keywordGenerationProgress.queryKeywords)) {
            setQueryKeywords(projectWithProgress.keywordGenerationProgress.queryKeywords);
        }

        if (projectWithProgress.keywordGenerationProgress) {
            setSavedProgress(projectWithProgress.keywordGenerationProgress);
            // If progress exists and is complete, show the keywords and report
            const progress = projectWithProgress.keywordGenerationProgress;
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
            }

            // If report is already generated, try to load it from pipeline-status endpoint
            // Only try to generate a new report if report is marked as generated but doesn't exist yet
            const shouldTryLoadReport = savedProgress?.reportGenerated ||
                savedProgress?.currentStage === 'complete';

            if (shouldTryLoadReport) {
                console.log("Attempting to load report for project:", {
                    projectId: project.id,
                    reportGenerated: savedProgress?.reportGenerated,
                    currentStage: savedProgress?.currentStage,
                    hasKeywords: status.keywordList?.length > 0,
                    keywordsCount: status.keywordList?.length,
                    hasDataForSEO: status.hasDataForSEO,
                    keywordsWithData: status.keywordsWithData
                });

                // First try to load from pipeline-status (which returns existing reports)
                try {
                    await loadReportForProject(project.id);
                } catch (loadError) {
                    console.log("Report not found in pipeline-status, will be loaded when pipeline completes");
                }

                // Only try to generate a new report if:
                // 1. Report is marked as generated
                // 2. We have keywords with data (metrics are computed)
                // 3. Report doesn't already exist (loadReportForProject didn't find it)
                if (savedProgress?.reportGenerated &&
                    status.hasDataForSEO &&
                    status.keywordsWithData > 0 &&
                    reportProjectIdRef.current !== project.id) {
                    setIsLoadingReport(true);
                    try {
                        const reportRes = await apiRequest("POST", `/api/custom-search/generate-report`, {
                            projectId: project.id,
                        });
                        const reportResult = await reportRes.json();
                        console.log("Report generation result:", {
                            success: reportResult.success,
                            hasReport: !!reportResult.report,
                            reportKeywordsCount: reportResult.report?.keywords?.length || 0
                        });
                        // Only set report data if it's for the current project
                        if (reportResult.success && reportResult.report && project.id === currentProjectId) {
                            setReportData(reportResult.report);
                            reportProjectIdRef.current = project.id;
                            setDisplayedKeywordCount(10); // Reset to 10 when loading report
                            setShowOnlyFullData(false); // Reset filter when loading report
                        }
                    } catch (reportError) {
                        console.error("Error generating report:", reportError);
                        // Don't show error, just continue - report will be generated when pipeline completes
                    } finally {
                        setIsLoadingReport(false);
                    }
                }
            } else {
                console.log("Not loading report - conditions not met:", {
                    projectId: project.id,
                    reportGenerated: savedProgress?.reportGenerated,
                    currentStage: savedProgress?.currentStage,
                    hasSavedProgress: !!savedProgress
                });
            }
        } catch (error) {
            console.error("Error loading keywords status:", error);
            // Don't show error to user, just continue without restoring status
        }

        // Allow auto-save after a short delay to ensure form is fully updated
        setTimeout(() => {
            setIsLoadingProject(false);
            isInitialLoadRef.current = false; // Re-enable auto-save after loading is complete
            // Resize textarea after project is loaded
            resizePitchTextarea();
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
        setQueryKeywords([]);
        setCurrentProjectId(null);

        // Clear any pending auto-save
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = null;
        }
    };

    // Handle project selection from browser
    const handleSelectProject = (project: CustomSearchProject) => {
        loadProject(project);
    };

    // Helper function to ensure project exists - creates it if it doesn't
    const ensureProjectExists = async (): Promise<string | null> => {
        // If project already exists, return its ID
        if (currentProjectId) {
            return currentProjectId;
        }

        // Prevent multiple simultaneous creation attempts
        if (isCreatingProjectRef.current || createProjectMutation.isPending) {
            // Wait for the creation to complete
            return new Promise((resolve) => {
                const checkInterval = setInterval(() => {
                    if (currentProjectId && !isCreatingProjectRef.current && !createProjectMutation.isPending) {
                        clearInterval(checkInterval);
                        resolve(currentProjectId);
                    } else if (!isCreatingProjectRef.current && !createProjectMutation.isPending) {
                        // Creation failed or was cancelled
                        clearInterval(checkInterval);
                        resolve(null);
                    }
                }, 100);
            });
        }

        // Capture current form values at the moment of creation to ensure we use the latest values
        const currentFormValues = form.getValues();
        const currentPitch = currentFormValues.pitch || "";
        const currentName = currentFormValues.name || "";

        // Create new project with current form values
        isCreatingProjectRef.current = true;
        try {
            const result = await createProjectMutation.mutateAsync({
                name: currentName || undefined,
                pitch: currentPitch || "",
                topics,
                personas,
                painPoints,
                features,
                competitors,
            });
            return result.project.id;
        } catch (error) {
            console.error("Failed to create project:", error);
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "Failed to create project",
                variant: "destructive",
            });
            return null;
        } finally {
            isCreatingProjectRef.current = false;
        }
    };

    // Manual save handler - creates project on first save
    const handleSave = () => {
        // Clear any pending auto-save
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = null;
        }

        if (!currentProjectId) {
            // Create new project on first save
            if (isCreatingProjectRef.current) return;
            isCreatingProjectRef.current = true;
            setIsSaving(true);

            createProjectMutation.mutate({
                name: name || undefined,
                pitch: pitch || "",
                topics,
                personas,
                painPoints,
                features,
                competitors,
            }, {
                onSuccess: () => {
                    isCreatingProjectRef.current = false;
                    setIsSaving(false);
                    toast({
                        title: "Project Saved",
                        description: "Project created and saved successfully.",
                    });
                },
                onError: (error) => {
                    isCreatingProjectRef.current = false;
                    setIsSaving(false);
                    toast({
                        title: "Error",
                        description: error instanceof Error ? error.message : "Failed to save project",
                        variant: "destructive",
                    });
                },
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
                    onSuccess: () => {
                        toast({
                            title: "Project Saved",
                            description: "Project updated successfully.",
                        });
                    },
                    onError: (error) => {
                        toast({
                            title: "Error",
                            description: error instanceof Error ? error.message : "Failed to save project",
                            variant: "destructive",
                        });
                    },
                    onSettled: () => {
                        setIsSaving(false);
                    },
                }
            );
        }
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
            // Set the generated idea in the pitch field immediately
            form.setValue("pitch", result.idea.generatedIdea);

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

                    // If we got the name, update the form field
                    if (name) {
                        form.setValue("name", name);
                    }
                } catch (error) {
                    // Silently fail - name generation is not critical
                    console.error("Error fetching idea name:", error);
                }
            })();

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
            // Get Supabase session token
            const { data: { session } } = await supabase.auth.getSession();

            const headers: Record<string, string> = { "Content-Type": "application/json" };
            if (session?.access_token) {
                headers["Authorization"] = `Bearer ${session.access_token}`;
            }

            const response = await fetch("/api/custom-search/find-competitors", {
                method: "POST",
                headers,
                body: JSON.stringify(data),
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

            const competitorsList: Competitor[] = [];
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
                            const eventData = JSON.parse(line.slice(6));

                            if (eventData.type === "progress" && eventData.stage) {
                                // Update progress stage
                                const previousStage = competitorProgress?.stage;
                                setCompetitorProgress({
                                    stage: eventData.stage,
                                    completedCount: eventData.completedCount,
                                    totalCount: eventData.totalCount,
                                });
                                // Reset timer when stage changes
                                if (previousStage !== eventData.stage) {
                                    setCompetitorStepStartTime(Date.now());
                                    setCompetitorElapsedTime(0);
                                }
                            } else if (eventData.type === "competitor" && eventData.competitor) {
                                // Add competitor to list and update UI immediately
                                competitorsList.push(eventData.competitor);
                                setCompetitors([...competitorsList]);
                                // Update progress with completed count
                                if (competitorProgress) {
                                    setCompetitorProgress({
                                        ...competitorProgress,
                                        completedCount: competitorsList.length,
                                    });
                                }
                            } else if (eventData.type === "complete") {
                                // Final completion - all competitors validated
                                if (eventData.competitors && Array.isArray(eventData.competitors)) {
                                    setCompetitors(eventData.competitors);

                                    // Save competitors after all are validated
                                    if (currentProjectId) {
                                        updateProjectMutation.mutate(
                                            {
                                                id: currentProjectId,
                                                competitors: eventData.competitors,
                                            },
                                            {
                                                onSuccess: () => {
                                                    toast({
                                                        title: "Competitors Found!",
                                                        description: `Found and saved ${eventData.competitors.length} competitors.`,
                                                    });
                                                },
                                                onError: () => {
                                                    // Still show success toast even if save fails (auto-save will retry)
                                                    toast({
                                                        title: "Competitors Found!",
                                                        description: `Found ${eventData.competitors.length} competitors.`,
                                                    });
                                                },
                                            }
                                        );
                                    } else {
                                        toast({
                                            title: "Competitors Found!",
                                            description: `Found ${eventData.competitors.length} competitors.`,
                                        });
                                    }
                                }
                            } else if (eventData.type === "error") {
                                throw new Error(eventData.error || "Unknown error");
                            }
                        } catch (e) {
                            console.error("Error parsing SSE data:", e);
                            if (e instanceof Error && e.message !== "Unknown error") {
                                throw e;
                            }
                        }
                    }
                }
            }

            return { competitors: competitorsList };
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

    const handleGenerateQueryKeywords = async () => {
        if (!pitch || pitch.trim().length === 0) {
            toast({
                title: "Error",
                description: "Please enter an idea pitch first",
                variant: "destructive",
            });
            return;
        }

        setIsGeneratingQueryKeywords(true);
        try {
            const result = await generateItemsMutation.mutateAsync({
                pitch,
                type: "topics", // Use topics type for query keywords generation
            });
            if (result.items && Array.isArray(result.items)) {
                // Add new items that don't already exist, limit to 20
                const newItems = result.items
                    .filter((item: string) => !queryKeywords.includes(item))
                    .slice(0, 20 - queryKeywords.length);
                if (newItems.length > 0) {
                    setQueryKeywords([...queryKeywords, ...newItems]);
                }
            }
        } finally {
            setIsGeneratingQueryKeywords(false);
        }
    };

    const handleAddToQueryKeywords = (item: string) => {
        if (queryKeywords.length >= 20) {
            toast({
                title: "Limit reached",
                description: "You can only add up to 20 query keywords",
                variant: "destructive",
            });
            return;
        }
        if (!queryKeywords.includes(item)) {
            setQueryKeywords([...queryKeywords, item]);
        }
    };

    // Get badge color for query keywords based on which list they came from
    const getQueryKeywordBadgeColor = (keyword: string): string | undefined => {
        // Check which list the keyword belongs to and return its original color
        if (topics.includes(keyword)) {
            return "bg-blue-600/80 text-blue-100 border-blue-500/50";
        }
        if (personas.includes(keyword)) {
            return "bg-emerald-600/80 text-emerald-100 border-emerald-500/50";
        }
        if (painPoints.includes(keyword)) {
            return "bg-amber-600/80 text-amber-100 border-amber-500/50";
        }
        if (features.includes(keyword)) {
            return "bg-purple-600/80 text-purple-100 border-purple-500/50";
        }
        // Default color for keywords added directly or generated
        return "bg-pink-600/80 text-pink-100 border-pink-500/50";
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

        // Ensure project exists before proceeding
        const projectId = await ensureProjectExists();
        if (!projectId) {
            toast({
                title: "Error",
                description: "Failed to create project. Please try again.",
                variant: "destructive",
            });
            return;
        }

        // Clear existing competitors so they appear progressively
        setCompetitors([]);
        setCompetitorProgress(null);
        setCompetitorStepStartTime(null);
        setCompetitorElapsedTime(0);
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
            setCompetitorProgress(null);
            setCompetitorStepStartTime(null);
        }
    };

    // Polling mechanism for pipeline status
    const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const previousPipelineStatusRef = useRef<string | null>(null); // Track previous status to detect transitions
    const stopPolling = () => {
        if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
        }
        // Reset previous status when stopping polling
        previousPipelineStatusRef.current = null;
    };

    // Poll pipeline status
    const pollPipelineStatus = async (projectId: string) => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const headers: Record<string, string> = {};
            if (session?.access_token) {
                headers["Authorization"] = `Bearer ${session.access_token}`;
            }

            const response = await fetch(`/api/custom-search/pipeline-status/${projectId}`, {
                method: "GET",
                headers,
            });

            if (!response.ok) {
                // If 404, the pipeline doesn't exist - stop polling
                if (response.status === 404) {
                    console.log("Pipeline not found, stopping polling");
                    stopPolling();
                    setIsFindingKeywordsFromWebsite(false);
                    setIsGeneratingKeywords(false);
                    return;
                }
                throw new Error("Failed to fetch pipeline status");
            }

            const data = await response.json();

            if (data.status === 'error') {
                // Pipeline error
                setKeywordProgress(prev => prev ? {
                    ...prev,
                    stage: 'error',
                } : {
                    stage: 'error',
                    seedsGenerated: 0,
                    keywordsGenerated: 0,
                    duplicatesFound: 0,
                    existingKeywordsFound: 0,
                    newKeywordsCollected: 0,
                });

                const errorMessage = data.progress?.error || "Unknown error occurred";
                toast({
                    title: "Pipeline Error",
                    description: errorMessage,
                    variant: "destructive",
                    duration: 10000,
                });

                stopPolling();
                setIsFindingKeywordsFromWebsite(false);
                setIsGeneratingKeywords(false);
                return;
            }

            if (data.progress) {
                const progress = data.progress;
                const stage = progress.currentStage || progress.stage || '';

                // Update progress state
                setKeywordProgress(prev => ({
                    ...prev,
                    stage: stage,
                    currentStage: stage,
                    seedsGenerated: progress.seedsGenerated || prev?.seedsGenerated || 0,
                    keywordsGenerated: progress.keywordsGenerated || prev?.keywordsGenerated || 0,
                    duplicatesFound: progress.duplicatesFound || prev?.duplicatesFound || 0,
                    existingKeywordsFound: progress.existingKeywordsFound || prev?.existingKeywordsFound || 0,
                    newKeywordsCollected: progress.newKeywordsCollected || prev?.newKeywordsCollected || 0,
                    newKeywords: progress.newKeywords || prev?.newKeywords || [],
                }));

                // Track step start times - only set if stage doesn't exist yet
                // Use functional update to ensure we have the latest state
                setStepStartTimes(prev => {
                    if (stage && !prev[stage]) {
                        const newTimes = { ...prev, [stage]: Date.now() };
                        // Update ref immediately so timer can use it
                        stepStartTimesRef.current = newTimes;
                        return newTimes;
                    }
                    return prev;
                });

                // Update stats
                if (progress.keywordsFetchedCount !== undefined) {
                    setDataForSEOStats({
                        keywordsWithData: progress.keywordsFetchedCount,
                        totalKeywords: progress.newKeywords?.length || 0,
                        keywordsWithoutData: (progress.newKeywords?.length || 0) - progress.keywordsFetchedCount,
                    });
                }

                if (progress.metricsProcessedCount !== undefined) {
                    setMetricsStats({
                        processedCount: progress.metricsProcessedCount,
                        totalKeywords: progress.newKeywords?.length || 0,
                    });
                }

                // Update generated keywords if available
                if (progress.newKeywords && Array.isArray(progress.newKeywords)) {
                    setGeneratedKeywords(progress.newKeywords);
                }
            }

            // Handle report if available (only for current project)
            if (data.report && projectId === currentProjectId) {
                setReportData(data.report);
                reportProjectIdRef.current = projectId;
                if (data.report.newKeywords && Array.isArray(data.report.newKeywords)) {
                    setGeneratedKeywords(data.report.newKeywords);
                }
            }

            // If pipeline is complete, stop polling
            if (data.status === 'complete') {
                // Only set report data if it's for the current project
                if (data.report && projectId === currentProjectId) {
                    setReportData(data.report);
                    reportProjectIdRef.current = projectId;
                }

                // Only show success toast if we transitioned from a non-complete status to complete
                // This prevents showing the toast on page refresh when the pipeline was already complete
                const wasRunning = previousPipelineStatusRef.current !== null &&
                    previousPipelineStatusRef.current !== 'complete' &&
                    previousPipelineStatusRef.current !== 'error';

                if (wasRunning) {
                    toast({
                        title: "Success!",
                        description: `Successfully found keywords from website with ${data.report?.totalKeywords || 0} keywords`,
                    });
                }

                stopPolling();
                setIsFindingKeywordsFromWebsite(false);
                setIsGeneratingKeywords(false);

                // Clear progress state after a short delay to allow report to render
                setTimeout(() => {
                    setKeywordProgress(null);
                    setStepStartTimes({});
                    setElapsedTimes({});
                }, 500);
            }

            // Update previous status for next poll
            previousPipelineStatusRef.current = data.status;
        } catch (error) {
            console.error("Error polling pipeline status:", error);
            // Don't stop polling on transient errors - continue trying
        }
    };

    // URL validation function
    const validateAndNormalizeUrl = (url: string): { isValid: boolean; normalizedUrl?: string; error?: string } => {
        if (!url || url.trim().length === 0) {
            return { isValid: false, error: "Please enter a website URL" };
        }

        const trimmedUrl = url.trim();

        // Remove any leading/trailing whitespace and common prefixes
        let normalizedUrl = trimmedUrl
            .replace(/^https?:\/\//i, '') // Remove http:// or https://
            .replace(/^www\./i, '') // Remove www.
            .replace(/\/$/, ''); // Remove trailing slash

        // Basic domain validation
        // Check if it looks like a valid domain (contains at least one dot and valid characters)
        const domainPattern = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

        if (!domainPattern.test(normalizedUrl)) {
            return {
                isValid: false,
                error: "Please enter a valid website URL (e.g., example.com or www.example.com)"
            };
        }

        // Try to construct a valid URL
        try {
            // If it doesn't have a protocol, add https://
            const urlWithProtocol = normalizedUrl.includes('://')
                ? normalizedUrl
                : `https://${normalizedUrl}`;

            const urlObj = new URL(urlWithProtocol);

            // Validate it's http or https
            if (!['http:', 'https:'].includes(urlObj.protocol)) {
                return {
                    isValid: false,
                    error: "URL must use http:// or https:// protocol"
                };
            }

            // Return the normalized domain (without protocol for consistency)
            return {
                isValid: true,
                normalizedUrl: urlObj.hostname.replace(/^www\./i, '')
            };
        } catch (error) {
            return {
                isValid: false,
                error: "Please enter a valid website URL (e.g., example.com)"
            };
        }
    };

    const handleFindKeywordsFromWebsite = async (resume: boolean = false) => {
        let normalizedUrl: string | undefined;

        // When resuming, skip URL validation (API may have already been called)
        if (!resume) {
            if (!websiteUrl || websiteUrl.trim().length === 0) {
                toast({
                    title: "Error",
                    description: "Please enter a website URL",
                    variant: "destructive",
                });
                return;
            }

            // Validate and normalize the URL
            const validation = validateAndNormalizeUrl(websiteUrl);
            if (!validation.isValid) {
                toast({
                    title: "Invalid URL",
                    description: validation.error || "Please enter a valid website URL",
                    variant: "destructive",
                });
                return;
            }

            // Store the normalized URL for use in the API call
            normalizedUrl = validation.normalizedUrl;

            // Update the websiteUrl with the normalized version if it changed
            if (normalizedUrl && normalizedUrl !== websiteUrl.trim()) {
                setWebsiteUrl(normalizedUrl);
            }
        }

        // Ensure project exists before proceeding
        const projectId = await ensureProjectExists();
        if (!projectId) {
            toast({
                title: "Error",
                description: "Failed to create project. Please try again.",
                variant: "destructive",
            });
            return;
        }

        setIsFindingKeywordsFromWebsite(true);
        setIsGeneratingKeywords(true);
        setShowQuadrantPopup(false);

        // Stop any existing polling
        stopPolling();

        // If resuming, restore progress state from savedProgress
        if (resume && savedProgress) {
            setKeywordProgress({
                stage: savedProgress.currentStage || savedProgress.stage || 'creating-task',
                seedsGenerated: savedProgress.seedsGenerated || 0,
                keywordsGenerated: savedProgress.keywordsGenerated || 0,
                duplicatesFound: savedProgress.duplicatesFound || 0,
                existingKeywordsFound: savedProgress.existingKeywordsFound || 0,
                newKeywordsCollected: savedProgress.newKeywordsCollected || 0,
                newKeywords: savedProgress.newKeywords || [],
            });
            if (savedProgress.newKeywords) {
                setGeneratedKeywords(savedProgress.newKeywords);
            }
        } else {
            // Initialize progress state for fresh start
            setKeywordProgress({
                stage: 'creating-task',
                seedsGenerated: 0,
                keywordsGenerated: 0,
                duplicatesFound: 0,
                existingKeywordsFound: 0,
                newKeywordsCollected: 0,
            });
            setGeneratedKeywords([]);
            setDataForSEOStats(null);
            setMetricsStats(null);
            setStepStartTimes({});
            setElapsedTimes({});
        }

        try {
            // Get Supabase session token
            const { data: { session } } = await supabase.auth.getSession();

            const headers: Record<string, string> = { "Content-Type": "application/json" };
            if (session?.access_token) {
                headers["Authorization"] = `Bearer ${session.access_token}`;
            }

            // When resuming, target is optional (API may have already been called)
            // Use savedProgress target if available, otherwise use websiteUrl
            // For new requests, use the normalized URL from validation
            const targetToSend = resume && savedProgress?.dataForSEOSiteResults
                ? (savedProgress.target || websiteUrl?.trim() || '')
                : (normalizedUrl || websiteUrl?.trim() || '');

            // Ensure all values are serializable (primitives only)
            const requestBody = {
                projectId: String(projectId || ''),
                target: String(targetToSend || ''),
                location_code: selectedLocation?.code != null ? Number(selectedLocation.code) : undefined,
                location_name: selectedLocation?.name ? String(selectedLocation.name) : undefined,
                resume: Boolean(resume),
            };

            const response = await fetch("/api/custom-search/find-keywords-from-website", {
                method: "POST",
                headers,
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: "Unknown error" }));
                throw new Error(errorData.message || "Failed to start pipeline");
            }

            const result = await response.json();

            // Initialize previous status to 'running' so we can detect completion
            previousPipelineStatusRef.current = 'running';

            // Start polling immediately
            pollPipelineStatus(projectId);

            // Set up polling interval (poll every 2 seconds)
            pollingIntervalRef.current = setInterval(() => {
                pollPipelineStatus(projectId);
            }, 2000);

        } catch (error) {
            console.error("Error starting pipeline:", error);
            const errorMessage = error instanceof Error ? error.message : "Failed to start pipeline";

            // Update progress to show error state
            setKeywordProgress(prev => prev ? {
                ...prev,
                stage: 'error',
            } : {
                stage: 'error',
                seedsGenerated: 0,
                keywordsGenerated: 0,
                duplicatesFound: 0,
                existingKeywordsFound: 0,
                newKeywordsCollected: 0,
            });

            toast({
                title: "Error Starting Pipeline",
                description: errorMessage,
                variant: "destructive",
                duration: 10000,
            });

            stopPolling();
            setIsFindingKeywordsFromWebsite(false);
            setIsGeneratingKeywords(false);
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
                stage: 'calling-api',
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
            // Reset step start times for fresh generation
            setStepStartTimes({});
            setElapsedTimes({});
        }

        // Validate query keywords - skip validation when resuming (API may have already been called)
        if (!resume && (!queryKeywords || queryKeywords.length === 0 || queryKeywords.length > 20)) {
            toast({
                title: "Error",
                description: "Please provide 1-20 query keywords for keyword discovery",
                variant: "destructive",
            });
            setIsGeneratingKeywords(false);
            return;
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
                    queryKeywords: queryKeywords.length > 0 ? queryKeywords : undefined,
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

                                // Track step start times for elapsed time calculation
                                const stageMap: Record<string, string> = {
                                    'calling-api': 'calling-api',
                                    'fetching-dataforseo': 'fetching-dataforseo',
                                    'computing-metrics': 'computing-metrics',
                                    'generating-report': 'generating-report'
                                };

                                const stepKey = stageMap[currentStage] || currentStage;
                                // Only set start time if step key exists and we don't already have a start time for it
                                // This prevents resetting the start time when progress updates come in periodically
                                if (stepKey && !stepStartTimes[stepKey]) {
                                    setStepStartTimes(prev => {
                                        // Double-check to avoid race conditions
                                        if (!prev[stepKey]) {
                                            return { ...prev, [stepKey]: Date.now() };
                                        }
                                        return prev;
                                    });
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
                                // Final completion - report is ready (only for current project)
                                if (data.report && currentProjectId) {
                                    setReportData(data.report);
                                    reportProjectIdRef.current = currentProjectId;
                                    setDisplayedKeywordCount(10);
                                    setShowOnlyFullData(false);
                                }
                                if (data.newKeywords && Array.isArray(data.newKeywords)) {
                                    setGeneratedKeywords(data.newKeywords);
                                }

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

                                // Clear progress state after a short delay to allow report to render
                                setTimeout(() => {
                                    setKeywordProgress(null);
                                    setStepStartTimes({});
                                    setElapsedTimes({});
                                }, 500);
                            } else if (data.type === "error") {
                                const errorMessage = data.error || "Unknown error";
                                console.error("Error from server:", errorMessage);
                                toast({
                                    title: "Error",
                                    description: errorMessage,
                                    variant: "destructive",
                                });
                                setIsGeneratingKeywords(false);
                                return; // Stop processing SSE events
                            }
                        } catch (e) {
                            console.error("Error parsing SSE data:", e);
                            if (e instanceof Error) {
                                toast({
                                    title: "Error",
                                    description: e.message,
                                    variant: "destructive",
                                });
                            }
                            setIsGeneratingKeywords(false);
                            return; // Stop processing SSE events
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
            // Reset step start times when generation completes or fails
            setStepStartTimes({});
            setElapsedTimes({});
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
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => setShowHelpDialog(true)}
                        className="flex items-center gap-2"
                        title="Help"
                    >
                        <HelpCircle className="h-4 w-4" />
                        Help
                    </Button>
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
                    <Button
                        type="button"
                        onClick={handleSave}
                        disabled={isSaving || createProjectMutation.isPending || updateProjectMutation.isPending}
                        className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 ml-auto"
                    >
                        {isSaving ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Saving...
                            </>
                        ) : (
                            <>
                                <Save className="h-4 w-4" />
                                Save
                            </>
                        )}
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

            {/* Help Dialog */}
            <Dialog open={showHelpDialog} onOpenChange={setShowHelpDialog}>
                <DialogContent className="max-w-2xl max-h-[80vh] bg-gray-900 border-gray-700">
                    <DialogHeader>
                        <DialogTitle className="text-white">How to Use Custom Search</DialogTitle>
                        <DialogDescription className="text-white/60">
                            Learn how to use the custom search features to find keywords and analyze trends
                        </DialogDescription>
                    </DialogHeader>
                    <div className="mt-4 max-h-[60vh] overflow-y-auto space-y-6 text-white/90">
                        <div className="space-y-2">
                            <h3 className="text-lg font-semibold text-white">1. Start with Your Idea</h3>
                            <p className="text-sm text-white/80">
                                Write a one or two sentence pitch describing your business idea in the <strong>Idea Pitch</strong> field.
                                You can use the{" "}
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-yellow-300/10 border border-yellow-300/20">
                                    <Sparkles className="h-3.5 w-3.5 text-yellow-300" />
                                    <strong className="text-yellow-300">Generate New</strong>
                                </span>{" "}
                                button to get AI-generated ideas, or{" "}
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-300/10 border border-blue-300/20">
                                    <Sparkles className="h-3.5 w-3.5 text-blue-300" />
                                    <strong className="text-blue-300">Expand Current</strong>
                                </span>{" "}
                                to enhance your existing pitch.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <h3 className="text-lg font-semibold text-white">2. Find Competitors</h3>
                            <p className="text-sm text-white/80">
                                Click the{" "}
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-purple-600/20 border border-purple-500/30">
                                    <Search className="h-3.5 w-3.5 text-purple-400" />
                                    <strong className="text-purple-400">Find Competitors</strong>
                                </span>{" "}
                                button to discover companies similar to your idea.
                                The system will analyze your pitch and return a list of competitors with their descriptions and websites.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <h3 className="text-lg font-semibold text-white">3. Generate Keywords from Website</h3>
                            <p className="text-sm text-white/80">
                                Enter a website URL (yours or a competitor's) in the search field. Optionally select a{" "}
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/10 border border-white/20">
                                    <MapPin className="h-3.5 w-3.5 text-white/80" />
                                    <strong>Location</strong>
                                </span>{" "}
                                to focus on specific regions. Click{" "}
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gradient-to-r from-blue-600/20 to-cyan-600/20 border border-blue-500/30">
                                    <Search className="h-3.5 w-3.5 text-blue-400" />
                                    <strong className="text-blue-400">Get Keywords</strong>
                                </span>{" "}
                                to extract relevant keywords that the website targets.
                                You can click the{" "}
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-cyan-500/20 border border-cyan-500/30">
                                    <Search className="h-3 w-3 text-cyan-400" />
                                </span>{" "}
                                search icon on any competitor card to quickly use their URL.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <h3 className="text-lg font-semibold text-white">4. Refine Your Search (Optional)</h3>
                            <p className="text-sm text-white/80">
                                Use the <strong>Topics</strong>, <strong>Personas</strong>, <strong>Pain Points</strong>, and <strong>Features</strong> sections
                                to add more context. These help generate more targeted keywords and improve search relevance.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <h3 className="text-lg font-semibold text-white">What Results to Expect</h3>
                            <ul className="text-sm text-white/80 space-y-2 list-disc list-inside">
                                <li><strong>Keywords List:</strong> A curated list of relevant keywords with search volume, competition, and trend data</li>
                                <li><strong>Trend Charts:</strong> Visual representations showing how keyword popularity changes over time</li>
                                <li><strong>Metrics Cards:</strong> Key statistics including average search volume, competition levels, and trend indicators</li>
                                <li><strong>SEO Report:</strong> Detailed analysis of keyword opportunities, difficulty scores, and recommendations</li>
                                <li><strong>Competitor Analysis:</strong> Insights into what keywords your competitors are targeting</li>
                            </ul>
                        </div>

                        <div className="space-y-2 pt-2 border-t border-white/10">
                            <p className="text-sm text-white/70">
                                <strong>Tip:</strong> Use the{" "}
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-purple-600/20 border border-purple-500/30">
                                    <Save className="h-3.5 w-3.5 text-purple-400" />
                                    <strong className="text-purple-400">Save</strong>
                                </span>{" "}
                                button to preserve your work. Projects auto-save after 2 seconds of inactivity.
                            </p>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <form className="space-y-6">
                {/* Idea Pitch */}
                <div className="space-y-2">
                    <label className="text-sm font-medium text-white">
                        Idea Pitch <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                        <Textarea
                            {...(() => {
                                const registration = form.register("pitch");
                                return {
                                    ...registration,
                                    ref: (e: HTMLTextAreaElement | null) => {
                                        pitchTextareaRef.current = e;
                                        if (typeof registration.ref === 'function') {
                                            registration.ref(e);
                                        } else if (registration.ref) {
                                            (registration.ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = e;
                                        }
                                    },
                                    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => {
                                        registration.onChange(e);
                                        resizePitchTextarea();
                                    }
                                };
                            })()}
                            placeholder="Write a one or two sentence pitch for your idea"
                            className="min-h-[52px] bg-white/5 border-white/10 text-white placeholder:text-white/40 pr-56 pb-10 resize-none overflow-hidden"
                            onInput={resizePitchTextarea}
                            rows={2}
                        />
                        <div className="absolute left-2 bottom-2 flex items-center gap-1">
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
                        </div>
                        <div className="absolute right-2 bottom-2 flex items-center">
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={handleFindCompetitors}
                                disabled={
                                    !pitch ||
                                    pitch.trim().length === 0 ||
                                    isFindingCompetitors
                                }
                                className="h-8 gap-1.5 px-4 text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-full"
                                title="Find competitors"
                            >
                                {isFindingCompetitors ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin stroke-[2.5]" />
                                        <span className="text-xs">Finding...</span>
                                    </>
                                ) : (
                                    <>
                                        <Search className="h-4 w-4 stroke-[2.5]" />
                                        <span className="text-xs">Find Competitors</span>
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Competitors Section */}
                <div className="space-y-6 mt-6">
                    {/* Progress Steps for Find Competitors */}
                    {isFindingCompetitors && competitorProgress && (
                        <div className="mt-4 flex items-center justify-center gap-2">
                            <Loader2 className="h-4 w-4 text-blue-500 animate-spin flex-shrink-0" />
                            <div className="text-sm font-medium text-blue-400 whitespace-nowrap">
                                {competitorProgress.stage === 'generating-queries' && 'Generating search queries...'}
                                {competitorProgress.stage === 'searching' && 'Searching for competitors...'}
                                {competitorProgress.stage === 'extracting' && 'Extracting competitors from results...'}
                                {competitorProgress.stage === 'validating' && `Validating competitors (${competitorProgress.completedCount || 0}/${competitorProgress.totalCount || 0})...`}
                                {competitorProgress.stage === 'llm-generating' && 'Generating competitors with AI...'}
                                {!['generating-queries', 'searching', 'extracting', 'validating', 'llm-generating'].includes(competitorProgress.stage) &&
                                    competitorProgress.stage.split('-').map((word: string) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                            </div>
                            {competitorElapsedTime > 0 && (
                                <div className="text-xs text-white/60 flex-shrink-0">
                                    {competitorElapsedTime}s
                                </div>
                            )}
                        </div>
                    )}

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
                                    {competitors.map((competitor, index) => {
                                        // Helper function to normalize URLs for comparison
                                        const normalizeUrl = (url: string): string => {
                                            if (!url) return '';
                                            try {
                                                // Add protocol if missing
                                                const urlWithProtocol = url.startsWith('http') ? url : `https://${url}`;
                                                const urlObj = new URL(urlWithProtocol);
                                                // Get hostname and remove www.
                                                return urlObj.hostname.replace(/^www\./, '').toLowerCase();
                                            } catch {
                                                // If URL parsing fails, just clean it up
                                                return url.replace(/^https?:\/\//, '').replace(/^www\./, '').toLowerCase().split('/')[0];
                                            }
                                        };

                                        // Check if this competitor's URL matches the target website used for keyword generation
                                        const keywordTarget = savedProgress?.target || '';
                                        const competitorUrlNormalized = competitor.url ? normalizeUrl(competitor.url) : '';
                                        const targetNormalized = keywordTarget ? normalizeUrl(keywordTarget) : '';
                                        const hasKeywordsGenerated = competitorUrlNormalized && targetNormalized && competitorUrlNormalized === targetNormalized;

                                        return (
                                            <div
                                                key={index}
                                                className={`bg-white/5 hover:bg-white/10 border rounded-lg p-3 transition-colors ${hasKeywordsGenerated ? 'border-cyan-500/50 bg-cyan-500/5' : 'border-white/10'
                                                    }`}
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                            <h4 className="text-sm font-medium text-white">
                                                                {competitor.name}
                                                            </h4>
                                                            {competitor.url && (
                                                                <>
                                                                    <a
                                                                        href={competitor.url}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="text-primary hover:text-primary/80 transition-colors"
                                                                        onClick={(e) => e.stopPropagation()}
                                                                    >
                                                                        <ExternalLink className="h-3.5 w-3.5" />
                                                                    </a>
                                                                    <button
                                                                        type="button"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            if (competitor.url) {
                                                                                // Extract domain from URL
                                                                                try {
                                                                                    const url = new URL(competitor.url.startsWith('http') ? competitor.url : `https://${competitor.url}`);
                                                                                    setWebsiteUrl(url.hostname.replace('www.', ''));
                                                                                } catch {
                                                                                    // If URL parsing fails, use the URL as-is
                                                                                    setWebsiteUrl(competitor.url.replace(/^https?:\/\//, '').replace(/^www\./, ''));
                                                                                }
                                                                            }
                                                                        }}
                                                                        className="text-cyan-500 hover:text-cyan-400 transition-colors p-1 hover:bg-white/10 rounded"
                                                                        title="Use this URL for keyword search"
                                                                    >
                                                                        <Search className="h-3.5 w-3.5" />
                                                                    </button>
                                                                </>
                                                            )}
                                                            {hasKeywordsGenerated && (
                                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded">
                                                                    <Sparkles className="h-3 w-3" />
                                                                    Keywords Generated
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="text-xs text-white/60 line-clamp-2">
                                                            {competitor.description}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Find Keywords from Website */}
                    <div className="space-y-2 pt-4 border-t border-white/10">

                        <div className="flex gap-0">
                            <div className="[&_button]:rounded-l-full [&_button]:rounded-r-none [&_button]:border-r-0 [&_button]:h-10">
                                <LocationSelector
                                    value={selectedLocation}
                                    onChange={setSelectedLocation}
                                    inline={true}
                                />
                            </div>
                            <Input
                                type="text"
                                placeholder="Enter your landing page URL or pick one from competitors (e.g., example.com)"
                                value={websiteUrl}
                                onChange={(e) => setWebsiteUrl(e.target.value)}
                                disabled={isFindingKeywordsFromWebsite || isGeneratingKeywords}
                                className="flex-1 bg-white/5 border-white/10 text-white placeholder:text-white/40 rounded-none border-l-0 border-r-0 h-10"
                            />
                            <Button
                                type="button"
                                onClick={() => handleFindKeywordsFromWebsite()}
                                disabled={
                                    !websiteUrl ||
                                    websiteUrl.trim().length === 0 ||
                                    isFindingKeywordsFromWebsite ||
                                    isGeneratingKeywords ||
                                    createProjectMutation.isPending
                                }
                                className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 rounded-r-full rounded-l-none border-l-0 h-10"
                            >
                                {isFindingKeywordsFromWebsite ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Finding...
                                    </>
                                ) : (
                                    <>
                                        <Search className="mr-2 h-4 w-4" />
                                        Get Keywords
                                    </>
                                )}
                            </Button>
                        </div>

                        {/* Show resume option if progress exists and is incomplete (website search) - only show if NOT currently running */}
                        {savedProgress &&
                            !isFindingKeywordsFromWebsite &&
                            savedProgress.currentStage !== 'complete' &&
                            savedProgress.reportGenerated !== true &&
                            savedProgress.currentStage !== undefined &&
                            ['creating-task', 'polling-task', 'extracting-keywords', 'fetching-dataforseo', 'generating-report'].includes(savedProgress.currentStage) && (
                                <div className="mt-3 bg-yellow-500/20 border border-yellow-500/30 rounded-lg p-3">
                                    <div className="text-sm text-yellow-200 mb-2">
                                        Website search in progress: {savedProgress.newKeywordsCollected || 0} keywords found
                                    </div>
                                    <div className="flex gap-2">
                                        <Button
                                            type="button"
                                            onClick={() => handleFindKeywordsFromWebsite(true)}
                                            disabled={isFindingKeywordsFromWebsite || isGeneratingKeywords}
                                            className="flex-1 bg-yellow-600 hover:bg-yellow-700"
                                        >
                                            {isFindingKeywordsFromWebsite ? (
                                                <>
                                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                    Resuming...
                                                </>
                                            ) : (
                                                <>
                                                    <Search className="mr-2 h-4 w-4" />
                                                    Resume Website Search
                                                </>
                                            )}
                                        </Button>
                                    </div>
                                </div>
                            )}

                        {/* Progress Steps - Always display when pipeline is running or has progress, but hide if report is completed */}
                        {(isFindingKeywordsFromWebsite || (keywordProgress && keywordProgress.stage && keywordProgress.stage !== 'idle' && keywordProgress.stage !== 'complete')) &&
                            savedProgress?.reportGenerated !== true &&
                            savedProgress?.currentStage !== 'complete' &&
                            keywordProgress?.stage !== 'complete' &&
                            !reportData && (() => {
                                // Use savedProgress.currentStage as primary source, fallback to keywordProgress.stage
                                const currentStage = savedProgress?.currentStage || keywordProgress?.stage || '';
                                const stages = [
                                    {
                                        key: 'creating-task',
                                        label: 'Creating task',
                                        description: 'Submitting request to find keywords for the website...',
                                        estimate: 3,
                                    },
                                    {
                                        key: 'polling-task',
                                        label: 'Waiting for results',
                                        description: 'Analyzing the website. This may take 10-30 seconds (or 1-5 minutes if using task API)...',
                                        estimate: 30,
                                    },
                                    {
                                        key: 'extracting-keywords',
                                        label: 'Extracting keywords',
                                        description: 'Processing keywords from the website analysis...',
                                        estimate: 2,
                                    },
                                    {
                                        key: 'fetching-dataforseo',
                                        label: 'Fetching keywords metrics',
                                        description: 'Retrieving search volume, competition, and CPC data...',
                                        estimate: 5,
                                    },
                                    {
                                        key: 'generating-report',
                                        label: 'Generating report',
                                        description: 'Creating final keyword report with insights...',
                                        estimate: 3,
                                    },
                                    {
                                        key: 'computing-metrics',
                                        label: 'Computing metrics',
                                        description: 'Calculating growth, volatility, and opportunity scores...',
                                        estimate: 10,
                                    },
                                ];

                                const hasError = currentStage === 'error';
                                const errorMessage = savedProgress?.error || '';

                                // Find the current active stage, or create a fallback for unknown stages
                                const activeStage = stages.find(s => s.key === currentStage) ||
                                    (currentStage && currentStage !== 'complete' && currentStage !== 'idle' ? {
                                        key: currentStage,
                                        label: currentStage.split('-').map((word: string) => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
                                        description: '',
                                        estimate: 0,
                                    } : null);
                                const elapsed = activeStage ? (elapsedTimes[activeStage.key] || 0) : 0;

                                // Show error message if there's an error
                                if (hasError && errorMessage) {
                                    return (
                                        <div className="mt-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg">
                                            <div className="text-sm font-medium text-red-400 mb-1">
                                                Error
                                            </div>
                                            <div className="text-xs text-red-300 whitespace-pre-wrap">
                                                {errorMessage}
                                            </div>
                                        </div>
                                    );
                                }

                                // Show current step with time
                                if (currentStage && currentStage !== 'complete' && currentStage !== 'idle' && !hasError) {
                                    return (
                                        <div className="mt-4 flex items-center justify-center gap-2">
                                            <Loader2 className="h-4 w-4 text-blue-500 animate-spin flex-shrink-0" />
                                            <div className="text-sm font-medium text-blue-400 whitespace-nowrap">
                                                {activeStage?.label || currentStage.split('-').map((word: string) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                                            </div>
                                            {elapsed > 0 && (
                                                <div className="text-xs text-white/60 flex-shrink-0">
                                                    {elapsed}s
                                                </div>
                                            )}
                                        </div>
                                    );
                                }

                                // Show error state
                                if (hasError && currentStage) {
                                    return (
                                        <div className="mt-4 flex items-center justify-center gap-2">
                                            <div className="h-4 w-4 rounded-full border-2 border-red-500 flex items-center justify-center flex-shrink-0">
                                                <span className="text-red-500 text-xs">✕</span>
                                            </div>
                                            <div className="text-sm font-medium text-red-400 whitespace-nowrap">
                                                {activeStage?.label || currentStage.split('-').map((word: string) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')} - Failed
                                            </div>
                                        </div>
                                    );
                                }

                                return null;
                            })()}

                        {/* Loading Report - Show after progress completes but before report is loaded */}
                        {(() => {
                            const currentStage = savedProgress?.currentStage || keywordProgress?.stage || '';
                            const isProgressComplete = currentStage === 'complete' ||
                                savedProgress?.currentStage === 'complete' ||
                                keywordProgress?.stage === 'complete';
                            const shouldShowLoadingReport = isProgressComplete &&
                                !reportData &&
                                (isLoadingReport || savedProgress?.reportGenerated === true);

                            if (shouldShowLoadingReport) {
                                return (
                                    <div className="mt-4 flex items-center justify-center gap-2">
                                        <Loader2 className="h-4 w-4 text-blue-500 animate-spin flex-shrink-0" />
                                        <div className="text-sm font-medium text-blue-400 whitespace-nowrap">
                                            Loading report...
                                        </div>
                                    </div>
                                );
                            }
                            return null;
                        })()}
                    </div>
                </div>
            </form>

            {/* Tab 2: Custom Keywords - Commented out for future use */}
            {false && (
                <TabsContent value="custom-keywords" className="space-y-6 mt-6">
                    <div className="grid grid-cols-2 gap-6">
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
                                onBadgeClick={handleAddToQueryKeywords}
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
                                onBadgeClick={handleAddToQueryKeywords}
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
                                onBadgeClick={handleAddToQueryKeywords}
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
                                onBadgeClick={handleAddToQueryKeywords}
                            />
                        </div>
                    </div>

                    {/* Query Keywords (5th field) */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-white">
                            Query Keywords <span className="text-white/60 text-xs">(1-20 keywords)</span>
                        </label>
                        <ListInput
                            value={queryKeywords}
                            onChange={setQueryKeywords}
                            placeholder="Add 1-20 query keywords for keyword discovery"
                            onGenerate={handleGenerateQueryKeywords}
                            isGenerating={isGeneratingQueryKeywords}
                            generateLabel="Generate from Pitch"
                            getBadgeColor={getQueryKeywordBadgeColor}
                            maxItems={20}
                        />
                    </div>

                    {/* Find Custom Keywords Button */}
                    <div className="pt-4 border-t border-white/10">
                        <Button
                            type="button"
                            onClick={() => handleGenerateFullReport(false)}
                            disabled={
                                !pitch ||
                                pitch.trim().length === 0 ||
                                !queryKeywords ||
                                queryKeywords.length === 0 ||
                                queryKeywords.length > 20 ||
                                isGeneratingKeywords ||
                                !currentProjectId
                            }
                            className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
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

                        {/* Show resume option if progress exists and is incomplete - only show if NOT currently running */}
                        {savedProgress && !isGeneratingKeywords && savedProgress.currentStage !== 'complete' && savedProgress.reportGenerated !== true && savedProgress.currentStage !== undefined && (
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

                        {/* Loading Report */}
                        {isLoadingReport && !reportData && (
                            <div className="pt-8 border-t border-white/10 space-y-4">
                                <div className="flex flex-col items-center justify-center py-12 space-y-4">
                                    <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
                                    <div className="text-center">
                                        <h3 className="text-lg font-semibold text-white/90 mb-2">
                                            Loading Report
                                        </h3>
                                        <p className="text-sm text-white/60">
                                            Fetching report data...
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Report Display in Competitors Tab */}
                        {reportData && reportData.keywords && reportData.keywords.length > 0 && (() => {
                            // Count total keywords with data (volume, competition, cpc, or topPageBid)
                            const totalKeywordsWithData = reportData.keywords.filter((k: any) => {
                                const hasVolume = k.volume !== null && k.volume !== undefined && k.volume !== '';
                                const hasCompetition = k.competition !== null && k.competition !== undefined && k.competition !== '';
                                const hasCpc = k.cpc !== null && k.cpc !== undefined && k.cpc !== '';
                                const hasTopPageBid = k.topPageBid !== null && k.topPageBid !== undefined && k.topPageBid !== '';
                                return hasVolume || hasCompetition || hasCpc || hasTopPageBid;
                            }).length;

                            // Filter keywords with full data if checkbox is checked
                            const filteredKeywords = showOnlyFullData
                                ? reportData.keywords.filter((k: any) => {
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

                                    let cpc: number | null = null;
                                    if (k.cpc !== null && k.cpc !== undefined && k.cpc !== '') {
                                        const parsed = parseFloat(k.cpc);
                                        cpc = !isNaN(parsed) && parsed > 0 ? parsed : null;
                                    }
                                    const hasCpc = cpc !== null && cpc > 0;

                                    let topPageBid: number | null = null;
                                    if (k.topPageBid !== null && k.topPageBid !== undefined && k.topPageBid !== '') {
                                        const parsed = parseFloat(k.topPageBid);
                                        topPageBid = !isNaN(parsed) && parsed > 0 ? parsed : null;
                                    }
                                    const hasTopPageBid = topPageBid !== null && topPageBid > 0;

                                    return hasVolume && hasCompetition && hasCpc && hasTopPageBid;
                                })
                                : reportData.keywords;

                            const displayedKeywords = filteredKeywords.slice(0, displayedKeywordCount);
                            const hasMoreToShow = displayedKeywordCount < filteredKeywords.length;

                            return (
                                <div className="pt-8 border-t border-white/10 space-y-4">
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h3 className="text-xl font-semibold text-white/90 mb-2">
                                                    {totalKeywordsWithData} generated keywords
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
                                                        setDisplayedKeywordCount(10);
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
                                            metricsPending={savedProgress?.metricsComputed === false}
                                        />
                                    </div>

                                    {selectedKeyword &&
                                        displayedKeywords.find(
                                            (k: any) => k.keyword === selectedKeyword,
                                        ) && (
                                            <div className="grid grid-cols-1 lg:grid-cols-[1fr_175px] gap-4 pt-8">
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

                                    <div className="pt-8 space-y-4">
                                        <h3 className="text-xl font-semibold text-white/90">
                                            Aggregated KPIs
                                        </h3>
                                        <MetricsCards keywords={displayedKeywords as Keyword[]} />
                                    </div>

                                    <div className="pt-8">
                                        <AverageTrendChart keywords={displayedKeywords as Keyword[]} />
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                </TabsContent>
            )
            }

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
                            (quadrantPopupType === 'seeds' && (!keywordProgress?.seeds || keywordProgress?.seeds.length === 0)) ||
                            (quadrantPopupType === 'keywords' && (!keywordProgress?.allKeywords || keywordProgress?.allKeywords.length === 0)) ||
                            (quadrantPopupType === 'duplicates' && (!keywordProgress?.duplicates || keywordProgress?.duplicates.length === 0)) ||
                            (quadrantPopupType === 'existing' && (!keywordProgress?.existingKeywords || keywordProgress?.existingKeywords.length === 0))
                        ) && (
                                <div className="text-center text-white/60 py-8">
                                    No items to display yet.
                                </div>
                            )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Report Display - Moved to Competitors Tab */}
            {isLoadingReport && !reportData && (
                <div className="space-y-4 mt-8">
                    <div className="flex flex-col items-center justify-center py-12 space-y-4">
                        <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
                        <div className="text-center">
                            <h3 className="text-lg font-semibold text-white/90 mb-2">
                                Loading Report
                            </h3>
                            <p className="text-sm text-white/60">
                                Fetching report data...
                            </p>
                        </div>
                    </div>
                </div>
            )}
            {
                reportData && reportData.keywords && reportData.keywords.length > 0 && (() => {
                    // Count total keywords with data (volume, competition, cpc, or topPageBid)
                    const totalKeywordsWithData = reportData.keywords.filter((k: any) => {
                        const hasVolume = k.volume !== null && k.volume !== undefined && k.volume !== '';
                        const hasCompetition = k.competition !== null && k.competition !== undefined && k.competition !== '';
                        const hasCpc = k.cpc !== null && k.cpc !== undefined && k.cpc !== '';
                        const hasTopPageBid = k.topPageBid !== null && k.topPageBid !== undefined && k.topPageBid !== '';
                        return hasVolume || hasCompetition || hasCpc || hasTopPageBid;
                    }).length;

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
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="text-xl font-semibold text-white/90 mb-2">
                                            {totalKeywordsWithData} generated keywords
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
                                    metricsPending={savedProgress?.metricsComputed === false}
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
