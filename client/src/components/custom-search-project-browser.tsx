import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { GlassmorphicCard } from "./glassmorphic-card";
import { Loader2, Trash2, FileText, Calendar, Search, TrendingUp, ChevronLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { CustomSearchProject } from "@shared/schema";

interface CustomSearchProjectBrowserProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSelectProject: (project: CustomSearchProject) => void;
    onCreateNew: () => void;
}

export function CustomSearchProjectBrowser({
    open,
    onOpenChange,
    onSelectProject,
    onCreateNew,
}: CustomSearchProjectBrowserProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [currentPage, setCurrentPage] = useState(1);
    const projectsPerPage = 10;

    interface ProjectWithStats extends CustomSearchProject {
        keywordCount?: number;
        progress?: {
            stage: string;
            label: string;
            newKeywordsCollected?: number;
            keywordsFetchedCount?: number;
            metricsProcessedCount?: number;
            seedsGenerated?: number;
        } | null;
    }

    interface ProjectsResponse {
        projects: ProjectWithStats[];
        total?: number;
        page?: number;
        limit?: number;
        totalPages?: number;
    }

    const { data, isLoading, error } = useQuery<ProjectsResponse>({
        queryKey: ["/api/custom-search/projects", currentPage, projectsPerPage],
        queryFn: async () => {
            const res = await apiRequest("GET", `/api/custom-search/projects?page=${currentPage}&limit=${projectsPerPage}`);
            return res.json();
        },
        enabled: open,
    });

    // Reset to page 1 when dialog opens
    useEffect(() => {
        if (open) {
            setCurrentPage(1);
        }
    }, [open]);

    const deleteMutation = useMutation({
        mutationFn: async (projectId: string) => {
            const res = await apiRequest("DELETE", `/api/custom-search/projects/${projectId}`);
            return res.json();
        },
        onMutate: async (projectId: string) => {
            // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
            await queryClient.cancelQueries({ queryKey: ["/api/custom-search/projects"] });

            // Snapshot the previous value
            const previousData = queryClient.getQueryData<ProjectsResponse>(["/api/custom-search/projects", currentPage, projectsPerPage]);

            // Optimistically update to the new value
            if (previousData) {
                const updatedProjects = previousData.projects.filter(p => p.id !== projectId);
                const updatedTotal = previousData.total !== undefined ? previousData.total - 1 : undefined;
                const updatedTotalPages = updatedTotal !== undefined ? Math.ceil(updatedTotal / projectsPerPage) : undefined;
                
                queryClient.setQueryData<ProjectsResponse>(["/api/custom-search/projects", currentPage, projectsPerPage], {
                    ...previousData,
                    projects: updatedProjects,
                    total: updatedTotal,
                    totalPages: updatedTotalPages,
                });
            }

            // Return a context object with the snapshotted value
            return { previousData };
        },
        onSuccess: () => {
            // Invalidate all paginated queries to ensure we have the latest data
            queryClient.invalidateQueries({ queryKey: ["/api/custom-search/projects"] });
            toast({
                title: "Project Deleted",
                description: "Project has been deleted successfully.",
            });
            
            // If current page becomes empty and not on page 1, go to previous page
            if (data && data.projects.length === 1 && currentPage > 1) {
                setCurrentPage(currentPage - 1);
            }
        },
        onError: (error, projectId, context) => {
            // If the mutation fails, use the context returned from onMutate to roll back
            if (context?.previousData) {
                queryClient.setQueryData(["/api/custom-search/projects", currentPage, projectsPerPage], context.previousData);
            }
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "Failed to delete project",
                variant: "destructive",
            });
        },
    });

    const handleDelete = async (projectId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (confirm("Are you sure you want to delete this project?")) {
            // Optimistically remove from UI immediately
            deleteMutation.mutate(projectId);
        }
    };

    const handleSelect = (project: ProjectWithStats) => {
        onSelectProject(project);
        onOpenChange(false);
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric', 
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const truncateText = (text: string | null, maxLength: number = 100) => {
        if (!text) return "No description";
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + "...";
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col bg-background border-white/10">
                <DialogHeader>
                    <DialogTitle className="text-white text-xl">Your Custom Search Projects</DialogTitle>
                    <DialogDescription className="text-white/60">
                        Select an existing project or create a new one to get started
                    </DialogDescription>
                </DialogHeader>
                
                <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                    {isLoading && (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-white/60" />
                        </div>
                    )}

                    {error && (
                        <div className="text-center py-8 text-red-400">
                            Failed to load projects. Please try again.
                        </div>
                    )}

                    {!isLoading && !error && (!data?.projects || data.projects.length === 0) && (
                        <div className="text-center py-8 space-y-4">
                            <FileText className="h-12 w-12 mx-auto text-white/40" />
                            <p className="text-white/60">No projects found</p>
                            <Button onClick={onCreateNew} variant="default">
                                Create New Project
                            </Button>
                        </div>
                    )}

                    {!isLoading && !error && data?.projects && data.projects.length > 0 && (
                        <>
                            {data.projects.map((project) => (
                                <GlassmorphicCard
                                    key={project.id}
                                    className="p-4 hover:bg-white/10 transition-colors cursor-pointer"
                                    onClick={() => handleSelect(project)}
                                >
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-2">
                                                <h3 className="text-base font-semibold text-white">
                                                    {project.name || "Untitled Project"}
                                                </h3>
                                            </div>
                                            <p className="text-sm text-white/60 mb-3 line-clamp-2">
                                                {truncateText(project.pitch)}
                                            </p>
                                            <div className="flex items-center gap-4 text-xs text-white/40 mb-2">
                                                <div className="flex items-center gap-1">
                                                    <Calendar className="h-3 w-3" />
                                                    <span>Updated {formatDate(project.updatedAt)}</span>
                                                </div>
                                                {project.topics && project.topics.length > 0 && (
                                                    <span>{project.topics.length} topics</span>
                                                )}
                                                {project.competitors && project.competitors.length > 0 && (
                                                    <span>{project.competitors.length} competitors</span>
                                                )}
                                            </div>
                                            {/* Keyword count and progress */}
                                            <div className="flex items-center gap-4 text-xs">
                                                {(project.keywordCount !== undefined && project.keywordCount > 0) && (
                                                    <div className="flex items-center gap-1.5 text-white/70">
                                                        <Search className="h-3.5 w-3.5" />
                                                        <span className="font-medium">{project.keywordCount} {project.keywordCount === 1 ? 'keyword' : 'keywords'}</span>
                                                    </div>
                                                )}
                                                {project.progress && (
                                                    <div className="flex items-center gap-1.5">
                                                        <TrendingUp className="h-3.5 w-3.5 text-blue-400" />
                                                        <span className={`font-medium ${
                                                            project.progress.stage === 'complete' 
                                                                ? 'text-green-400' 
                                                                : 'text-blue-400'
                                                        }`}>
                                                            {project.progress.label}
                                                            {project.progress.newKeywordsCollected !== undefined && project.progress.newKeywordsCollected > 0 && (
                                                                <span className="text-white/60 ml-1">
                                                                    ({project.progress.newKeywordsCollected})
                                                                </span>
                                                            )}
                                                            {project.progress.keywordsFetchedCount !== undefined && project.progress.keywordsFetchedCount > 0 && (
                                                                <span className="text-white/60 ml-1">
                                                                    ({project.progress.keywordsFetchedCount} fetched)
                                                                </span>
                                                            )}
                                                            {project.progress.metricsProcessedCount !== undefined && project.progress.metricsProcessedCount > 0 && (
                                                                <span className="text-white/60 ml-1">
                                                                    ({project.progress.metricsProcessedCount} processed)
                                                                </span>
                                                            )}
                                                            {project.progress.seedsGenerated !== undefined && project.progress.seedsGenerated > 0 && (
                                                                <span className="text-white/60 ml-1">
                                                                    ({project.progress.seedsGenerated} seeds)
                                                                </span>
                                                            )}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="text-red-400 hover:text-red-300 hover:bg-red-500/20"
                                            onClick={(e) => handleDelete(project.id, e)}
                                            disabled={deleteMutation.isPending}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </GlassmorphicCard>
                            ))}
                            
                            {/* Pagination Controls - inside scroll section */}
                            {data && data.totalPages && data.totalPages > 1 && (
                                <div className="flex items-center justify-between pt-4 mt-4 border-t border-white/10">
                                    <div className="text-sm text-white/60">
                                        Page {data.page || currentPage} of {data.totalPages} ({data.total} total)
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                            disabled={currentPage === 1}
                                        >
                                            <ChevronLeft className="h-4 w-4" />
                                            Previous
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setCurrentPage(p => Math.min(data.totalPages || 1, p + 1))}
                                            disabled={currentPage >= (data.totalPages || 1)}
                                        >
                                            Next
                                            <ChevronRight className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t border-white/10">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={onCreateNew}>
                        Create New Project
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

