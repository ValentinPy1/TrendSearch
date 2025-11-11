import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { GlassmorphicCard } from "./glassmorphic-card";
import { Loader2, Trash2, FileText, Calendar, Search, TrendingUp } from "lucide-react";
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
    const [deletingId, setDeletingId] = useState<string | null>(null);

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

    const { data, isLoading, error } = useQuery<{ projects: ProjectWithStats[] }>({
        queryKey: ["/api/custom-search/projects"],
        queryFn: async () => {
            const res = await apiRequest("GET", "/api/custom-search/projects");
            return res.json();
        },
        enabled: open,
    });

    const deleteMutation = useMutation({
        mutationFn: async (projectId: string) => {
            const res = await apiRequest("DELETE", `/api/custom-search/projects/${projectId}`);
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/custom-search/projects"] });
            toast({
                title: "Project Deleted",
                description: "Project has been deleted successfully.",
            });
            setDeletingId(null);
        },
        onError: (error) => {
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "Failed to delete project",
                variant: "destructive",
            });
            setDeletingId(null);
        },
    });

    const handleDelete = async (projectId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (confirm("Are you sure you want to delete this project?")) {
            setDeletingId(projectId);
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
                                            disabled={deletingId === project.id}
                                        >
                                            {deletingId === project.id ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                                <Trash2 className="h-4 w-4" />
                                            )}
                                        </Button>
                                    </div>
                                </GlassmorphicCard>
                            ))}
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

