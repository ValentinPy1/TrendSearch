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
    const [queryKeywords, setQueryKeywords] = useState<string[]>([]);
    const [isGeneratingTopics, setIsGeneratingTopics] = useState(false);
    const [isGeneratingPersonas, setIsGeneratingPersonas] = useState(false);
    const [isGeneratingPainPoints, setIsGeneratingPainPoints] =
        useState(false);
    const [isGeneratingFeatures, setIsGeneratingFeatures] = useState(false);
    const [isGeneratingQueryKeywords, setIsGeneratingQueryKeywords] = useState(false);
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
        if (currentProjectId && projectsData?.projects) {
            const currentProject = projectsData.projects.find(p => p.id === currentProjectId);
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
    }, [projectsData, currentProjectId]);

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
                        currentStage: currentStage,
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
        }
    };

    // Update elapsed times every second for active steps
    useEffect(() => {
        if (!isGeneratingKeywords || Object.keys(stepStartTimes).length === 0) {
            return;
        }

        const interval = setInterval(() => {
            const currentTimes: Record<string, number> = {};
            Object.entries(stepStartTimes).forEach(([stepKey, startTime]) => {
                const currentStage = keywordProgress?.stage || keywordProgress?.currentStage || '';
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
                    const lastElapsed = elapsedTimes[stepKey];
                    if (lastElapsed !== undefined && lastElapsed > 0) {
                        currentTimes[stepKey] = lastElapsed;
                    }
                }
            });
            
            // Always update elapsed times to preserve them across progress updates
            if (Object.keys(currentTimes).length > 0) {
                setElapsedTimes(prev => ({ ...prev, ...currentTimes }));
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [isGeneratingKeywords, stepStartTimes, keywordProgress, elapsedTimes]);

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

    // Auto-save function with debouncing
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

        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }

        saveTimeoutRef.current = setTimeout(() => {
            // Double-check we're still not loading (race condition protection)
            if (isLoadingProject || createProjectMutation.isPending || isInitialLoadRef.current || isCreatingProjectRef.current) return;
            
            if (!currentProjectId) {
                // Create new project if none exists
                // Set guard to prevent concurrent creation
                if (isCreatingProjectRef.current) return;
                isCreatingProjectRef.current = true;
                
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
                    },
                    onError: () => {
                        isCreatingProjectRef.current = false;
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
        if (!projectsData || hasAutoLoadedRef.current || isCreatingProjectRef.current) return;

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
            isCreatingProjectRef.current = true; // Set guard to prevent concurrent creation
            
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
                    isCreatingProjectRef.current = false; // Clear guard
                    setTimeout(() => {
                        setIsLoadingProject(false);
                        isInitialLoadRef.current = false;
                    }, 200);
                },
                onError: () => {
                    isCreatingProjectRef.current = false; // Clear guard on error
                    setIsLoadingProject(false);
                    isInitialLoadRef.current = false;
                },
            });
        } else if (projectsData.projects.length > 0 && !currentProjectId && !isLoadingProject) {
            // Load most recent project
            hasAutoLoadedRef.current = true; // Mark as auto-loaded
            const mostRecent = projectsData.projects[0];
            loadProject(mostRecent);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectsData, currentProjectId, createProjectMutation.isPending, isLoadingProject]);

    // Load project data into form
    const loadProject = async (project: CustomSearchProject) => {
        // Clear any pending auto-save operations first
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = null;
        }
        
        // Clear report data when switching projects
        setReportData(null);
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

        // Load query keywords from project or saved progress
        if (projectWithProgress.queryKeywords && Array.isArray(projectWithProgress.queryKeywords)) {
            setQueryKeywords(projectWithProgress.queryKeywords);
        } else if (projectWithProgress.keywordGenerationProgress?.queryKeywords && Array.isArray(projectWithProgress.keywordGenerationProgress.queryKeywords)) {
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

            // If report is already generated, try to load it (even if metrics aren't computed yet)
            // Also try to load if we have keywords with data, as the report might have been generated
            const shouldLoadReport = savedProgress?.reportGenerated || 
                                   savedProgress?.currentStage === 'complete' ||
                                   (status.hasDataForSEO && status.keywordsWithData > 0);
            
            if (shouldLoadReport) {
                console.log("Loading report for project:", {
                    projectId: project.id,
                    reportGenerated: savedProgress?.reportGenerated,
                    currentStage: savedProgress?.currentStage,
                    hasKeywords: status.keywordList?.length > 0,
                    keywordsCount: status.keywordList?.length
                });
                try {
                    const reportRes = await apiRequest("POST", `/api/custom-search/generate-report`, {
                        projectId: project.id,
                    });
                    const reportResult = await reportRes.json();
                    console.log("Report load result:", {
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
                    console.error("Error loading report:", reportError);
                    // Don't show error, just continue
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

    // Polling mechanism for pipeline status
    const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const stopPolling = () => {
        if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
        }
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
                setKeywordProgress(prev => ({
                    ...prev,
                    stage: 'error',
                    currentStage: 'error',
                }));
                
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

                // Track step start times
                if (stage && !stepStartTimes[stage]) {
                    setStepStartTimes(prev => ({ ...prev, [stage]: Date.now() }));
                }

                // Update elapsed times
                if (stage && stepStartTimes[stage]) {
                    const elapsed = Math.floor((Date.now() - stepStartTimes[stage]) / 1000);
                    setElapsedTimes(prev => ({ ...prev, [stage]: elapsed }));
                }

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
                setKeywordProgress(prev => ({
                    ...prev,
                    stage: 'complete',
                    currentStage: 'complete',
                }));

                // Only set report data if it's for the current project
                if (data.report && projectId === currentProjectId) {
                    setReportData(data.report);
                    reportProjectIdRef.current = projectId;
                }

                toast({
                    title: "Success!",
                    description: `Successfully found keywords from website with ${data.report?.totalKeywords || 0} keywords`,
                });

                stopPolling();
                setIsFindingKeywordsFromWebsite(false);
                setIsGeneratingKeywords(false);
            }
        } catch (error) {
            console.error("Error polling pipeline status:", error);
            // Don't stop polling on transient errors - continue trying
        }
    };

    const handleFindKeywordsFromWebsite = async (resume: boolean = false) => {
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
        }

        if (!currentProjectId) {
            toast({
                title: "Error",
                description: "Please save your project first",
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
            const targetToSend = resume && savedProgress?.dataForSEOSiteResults 
                ? (savedProgress.target || websiteUrl?.trim() || '') 
                : websiteUrl?.trim() || '';

            // Ensure all values are serializable (primitives only)
            const requestBody = {
                projectId: String(currentProjectId || ''),
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
            
            // Start polling immediately
            pollPipelineStatus(currentProjectId);
            
            // Set up polling interval (poll every 2 seconds)
            pollingIntervalRef.current = setInterval(() => {
                pollPipelineStatus(currentProjectId);
            }, 2000);

        } catch (error) {
            console.error("Error starting pipeline:", error);
            const errorMessage = error instanceof Error ? error.message : "Failed to start pipeline";
            
            // Update progress to show error state
            setKeywordProgress(prev => ({
                ...prev,
                stage: 'error',
                currentStage: 'error',
            }));

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
                                setKeywordProgress(prev => prev ? { ...prev, stage: 'complete', currentStage: 'complete' } : null);
                                // Reset step start times
                                setStepStartTimes({});
                                setElapsedTimes({});
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

                {/* Location Selector */}
                <LocationSelector
                    value={selectedLocation}
                    onChange={setSelectedLocation}
                />

                {/* Sub-Tabs Section */}
                <Tabs value={activeSubTab} onValueChange={setActiveSubTab} className="w-full">
                    <TabsList className="flex gap-8 bg-transparent p-0 h-auto mb-6 border-b border-white/10">
                        <TabsTrigger 
                            value="competitors" 
                            className="bg-transparent text-white/60 data-[state=active]:text-white data-[state=active]:bg-transparent px-0 py-2 rounded-none border-b-2 border-transparent data-[state=active]:border-white/40 hover:text-white/80 transition-colors"
                        >
                            Competitors
                        </TabsTrigger>
                        <TabsTrigger 
                            value="custom-keywords" 
                            className="bg-transparent text-white/60 data-[state=active]:text-white data-[state=active]:bg-transparent px-0 py-2 rounded-none border-b-2 border-transparent data-[state=active]:border-white/40 hover:text-white/80 transition-colors"
                        >
                            Custom Keywords
                        </TabsTrigger>
                    </TabsList>

                    {/* Tab 1: Competitors */}
                    <TabsContent value="competitors" className="space-y-6 mt-6">
                        {/* Find Competitors Button */}
                        <div className="space-y-4">
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
                                        Find Competitors
                                    </>
                                )}
                            </Button>

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

                            {/* Find Keywords from Website */}
                            <div className="space-y-2 pt-4 border-t border-white/10">
                                <label className="text-sm font-medium text-white">
                                    Find Keywords from Website
                                </label>
                                <div className="flex gap-2">
                                    <Input
                                        type="text"
                                        placeholder="Enter website URL (e.g., dataforseo.com)"
                                        value={websiteUrl}
                                        onChange={(e) => setWebsiteUrl(e.target.value)}
                                        disabled={isFindingKeywordsFromWebsite || isGeneratingKeywords}
                                        className="flex-1 bg-white/5 border-white/10 text-white placeholder:text-white/40"
                                    />
                                    <Button
                                        type="button"
                                        onClick={handleFindKeywordsFromWebsite}
                                        disabled={
                                            !websiteUrl ||
                                            websiteUrl.trim().length === 0 ||
                                            isFindingKeywordsFromWebsite ||
                                            isGeneratingKeywords ||
                                            !currentProjectId
                                        }
                                        className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700"
                                    >
                                        {isFindingKeywordsFromWebsite ? (
                                            <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                Finding...
                                            </>
                                        ) : (
                                            <>
                                                <Search className="mr-2 h-4 w-4" />
                                                Find from Website
                                            </>
                                        )}
                                    </Button>
                                </div>

                                {/* Show resume option if progress exists and is incomplete (website search) */}
                                {savedProgress && 
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
                                {(isFindingKeywordsFromWebsite || (keywordProgress && keywordProgress.stage && keywordProgress.stage !== 'idle')) && 
                                 savedProgress?.reportGenerated !== true && (
                                    <div className="mt-4 space-y-3 bg-white/5 rounded-lg p-4 border border-white/10">
                                        <div className="text-sm font-medium text-white mb-3">
                                            Progress
                                        </div>
                                        {(() => {
                                            const currentStage = keywordProgress?.stage || keywordProgress?.currentStage || '';
                                            const stages = [
                                                {
                                                    key: 'creating-task',
                                                    label: 'Creating DataForSEO task',
                                                    description: 'Submitting request to find keywords for the website...',
                                                    estimate: 3,
                                                },
                                                {
                                                    key: 'polling-task',
                                                    label: 'Waiting for results',
                                                    description: 'DataForSEO is analyzing the website. This may take 10-30 seconds (or 1-5 minutes if using task API)...',
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
                                                    label: 'Fetching keyword metrics',
                                                    description: 'Retrieving search volume, competition, and CPC data...',
                                                    estimate: 5,
                                                },
                                                {
                                                    key: 'generating-report',
                                                    label: 'Generating report',
                                                    description: 'Creating final keyword report with insights...',
                                                    estimate: 3,
                                                },
                                            ];

                                            const hasError = currentStage === 'error';
                                            const errorMessage = savedProgress?.error || '';
                                            
                                            return (
                                                <div className="space-y-2">
                                                    {/* Explicit error display */}
                                                    {hasError && errorMessage && (
                                                        <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg">
                                                            <div className="text-sm font-medium text-red-400 mb-1">
                                                                Error
                                                            </div>
                                                            <div className="text-xs text-red-300 whitespace-pre-wrap">
                                                                {errorMessage}
                                                            </div>
                                                        </div>
                                                    )}
                                                    
                                                    {stages.map((stage, index) => {
                                                        const isActive = currentStage === stage.key && !hasError;
                                                        const isCompleted = hasError ? false : stages.findIndex(s => s.key === currentStage) > index;
                                                        const isPending = stages.findIndex(s => s.key === currentStage) < index;
                                                        // Show error on the current stage if error occurred
                                                        const isError = hasError && currentStage === stage.key;
                                                        const elapsed = elapsedTimes[stage.key] || 0;

                                                        return (
                                                            <div key={stage.key} className="flex items-start gap-3">
                                                                <div className="mt-0.5">
                                                                    {isError ? (
                                                                        <div className="h-5 w-5 rounded-full border-2 border-red-500 flex items-center justify-center">
                                                                            <span className="text-red-500 text-xs">✕</span>
                                                                        </div>
                                                                    ) : isCompleted ? (
                                                                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                                                                    ) : isActive ? (
                                                                        <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
                                                                    ) : (
                                                                        <div className="h-5 w-5 rounded-full border-2 border-white/30 flex items-center justify-center">
                                                                            {isPending && (
                                                                                <div className="h-2 w-2 rounded-full bg-white/30" />
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <div className="flex-1 min-w-0">
                                                                    <div className={`text-sm font-medium ${
                                                                        isError ? 'text-red-400' :
                                                                        isCompleted ? 'text-green-400' : 
                                                                        isActive ? 'text-blue-400' : 
                                                                        'text-white/60'
                                                                    }`}>
                                                                        {stage.label}
                                                                    </div>
                                                                    <div className={`text-xs mt-0.5 ${
                                                                        isError ? 'text-red-300' :
                                                                        isActive ? 'text-white/80' : 'text-white/50'
                                                                    }`}>
                                                                        {isError ? 'Failed' : (
                                                                            isActive ? stage.description : (
                                                                                isCompleted ? 'Completed' : 'Pending'
                                                                            )
                                                                        )}
                                                                    </div>
                                                                    {isActive && elapsed > 0 && !isError && (
                                                                        <div className="text-xs text-white/60 mt-1">
                                                                            {elapsed}s elapsed
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                )}
                            </div>
                        </div>
                    </TabsContent>

                    {/* Tab 2: Custom Keywords */}
                    <TabsContent value="custom-keywords" className="space-y-6 mt-6">
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

                            {/* Show resume option if progress exists and is incomplete */}
                            {savedProgress && savedProgress.currentStage !== 'complete' && savedProgress.reportGenerated !== true && savedProgress.currentStage !== undefined && (
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
                                        <div className="text-center pb-4">
                                            <h2 className="text-2xl md:text-3xl font-bold text-white leading-tight max-w-3xl mx-auto">
                                                {name || "Custom Search Report"}
                                            </h2>
                                            {pitch && (
                                                <p className="text-lg text-white/70 mt-4 max-w-2xl mx-auto">
                                                    {pitch}
                                                </p>
                                            )}
                                        </div>

                                        <div className="pt-8 space-y-4">
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
                </Tabs>
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

            {/* Report Display - Moved to Competitors Tab */}
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
