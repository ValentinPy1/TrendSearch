import * as React from "react";
import { Check, ChevronsUpDown, X, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";

interface Location {
    code: number;
    name: string;
    parentCode: number | null;
    countryCode: string;
    type: string;
    path?: string[];
}

interface LocationSelectorProps {
    value: { code: number; name: string } | null;
    onChange: (location: { code: number; name: string } | null) => void;
    className?: string;
    inline?: boolean;
}

export function LocationSelector({ value, onChange, className, inline = false }: LocationSelectorProps) {
    const [open, setOpen] = React.useState(false);
    const [searchQuery, setSearchQuery] = React.useState("");
    const [locations, setLocations] = React.useState<Location[]>([]);
    const [isLoading, setIsLoading] = React.useState(false);
    const [currentParentCode, setCurrentParentCode] = React.useState<number | null>(null);
    const [breadcrumbs, setBreadcrumbs] = React.useState<Location[]>([]);

    // Fetch locations
    const fetchLocations = React.useCallback(async (search?: string, parentCode?: number | null) => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams();
            if (search) {
                params.append("search", search);
            } else if (parentCode !== undefined) {
                params.append("parentCode", parentCode?.toString() || "");
            }
            
            const response = await fetch(`/api/locations?${params.toString()}`);
            const data = await response.json();
            setLocations(data.locations || []);
        } catch (error) {
            console.error("Error fetching locations:", error);
            setLocations([]);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Initial load: fetch root locations (countries)
    React.useEffect(() => {
        if (open && !searchQuery) {
            fetchLocations(undefined, currentParentCode);
        }
    }, [open, currentParentCode, searchQuery, fetchLocations]);

    // Search debounce
    React.useEffect(() => {
        if (!open) return;
        
        const timeoutId = setTimeout(() => {
            if (searchQuery) {
                setCurrentParentCode(null);
                setBreadcrumbs([]);
                fetchLocations(searchQuery);
            } else {
                fetchLocations(undefined, currentParentCode);
            }
        }, 300);

        return () => clearTimeout(timeoutId);
    }, [searchQuery, open, currentParentCode, fetchLocations]);

    const handleSelect = async (location: Location, event?: React.MouseEvent) => {
        // Check if user wants to drill down (click on chevron button) or select directly (click on item)
        const isChevronClick = event !== undefined;
        
        // Check if location has children by fetching them
        try {
            const response = await fetch(`/api/locations?parentCode=${location.code}`);
            const data = await response.json();
            const children = data.locations || [];
            
            if (children.length > 0 && isChevronClick) {
                // User clicked chevron button, navigate into it
                setCurrentParentCode(location.code);
                setBreadcrumbs(prev => [...prev, location]);
                setSearchQuery("");
                fetchLocations(undefined, location.code);
            } else {
                // User clicked on item or no children, select it directly
                onChange({ code: location.code, name: location.name });
                setOpen(false);
                setSearchQuery("");
                setCurrentParentCode(null);
                setBreadcrumbs([]);
            }
        } catch (error) {
            // On error, select it directly
            onChange({ code: location.code, name: location.name });
            setOpen(false);
            setSearchQuery("");
            setCurrentParentCode(null);
            setBreadcrumbs([]);
        }
    };

    const handleBreadcrumbClick = (index: number) => {
        const newBreadcrumbs = breadcrumbs.slice(0, index + 1);
        const targetLocation = newBreadcrumbs[newBreadcrumbs.length - 1];
        setBreadcrumbs(newBreadcrumbs);
        setCurrentParentCode(targetLocation.code);
        setSearchQuery("");
        fetchLocations(undefined, targetLocation.code);
    };

    const handleClear = () => {
        onChange(null);
        setOpen(false);
        setSearchQuery("");
        setCurrentParentCode(null);
        setBreadcrumbs([]);
    };

    const getLocationPath = (location: Location): string => {
        if (location.path && location.path.length > 0) {
            return location.path.join(" > ");
        }
        return location.name;
    };

    const getTypeBadgeColor = (type: string): string => {
        switch (type) {
            case "Country":
                return "bg-blue-600/80 text-blue-100 border-blue-500/50";
            case "State":
            case "Province":
                return "bg-purple-600/80 text-purple-100 border-purple-500/50";
            case "City":
                return "bg-green-600/80 text-green-100 border-green-500/50";
            case "Region":
                return "bg-orange-600/80 text-orange-100 border-orange-500/50";
            default:
                return "bg-gray-600/80 text-gray-100 border-gray-500/50";
        }
    };

    return (
        <div className={cn(inline ? "" : "space-y-2", className)}>
            {!inline && (
                <label className="text-sm font-medium text-white">
                    Location <span className="text-white/60 text-xs">(optional - global if not selected)</span>
                </label>
            )}
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={open}
                        className={cn(
                            "justify-between bg-white/5 border-white/10 text-white hover:bg-white/10",
                            inline ? "w-auto min-w-[200px]" : "w-full"
                        )}
                    >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                            <MapPin className="h-4 w-4 shrink-0 text-white/60" />
                            <span className="truncate">
                                {value ? value.name : inline ? "Location (optional)" : "Select location (optional)"}
                            </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                            {value && (
                                <X
                                    className="h-4 w-4 text-white/60 hover:text-white"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleClear();
                                    }}
                                />
                            )}
                            <ChevronsUpDown className="h-4 w-4 shrink-0 text-white/60" />
                        </div>
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0 bg-gray-900 border-gray-700" align="start">
                    <Command className="bg-gray-900">
                        <CommandInput
                            placeholder="Search locations..."
                            value={searchQuery}
                            onValueChange={setSearchQuery}
                            className="bg-gray-900 border-gray-700 text-white"
                        />
                        <CommandList className="max-h-[300px]">
                            {breadcrumbs.length > 0 && (
                                <div className="px-2 py-1.5 border-b border-gray-700">
                                    <div className="flex items-center gap-1 flex-wrap">
                                        <button
                                            onClick={() => {
                                                setCurrentParentCode(null);
                                                setBreadcrumbs([]);
                                                setSearchQuery("");
                                                fetchLocations(undefined, null);
                                            }}
                                            className="text-xs text-white/60 hover:text-white px-1.5 py-0.5 rounded"
                                        >
                                            All Locations
                                        </button>
                                        {breadcrumbs.map((crumb, index) => (
                                            <React.Fragment key={crumb.code}>
                                                <span className="text-white/40">/</span>
                                                <button
                                                    onClick={() => handleBreadcrumbClick(index)}
                                                    className="text-xs text-white/60 hover:text-white px-1.5 py-0.5 rounded"
                                                >
                                                    {crumb.name}
                                                </button>
                                            </React.Fragment>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {isLoading ? (
                                <div className="py-6 text-center text-sm text-white/60">
                                    Loading...
                                </div>
                            ) : locations.length === 0 ? (
                                <CommandEmpty className="text-white/60">No locations found.</CommandEmpty>
                            ) : (
                                <CommandGroup>
                                    {locations.map((location) => {
                                        const isSelected = value?.code === location.code;
                                        const path = getLocationPath(location);

                                        const hasPotentialChildren = location.type === "Country" || location.type === "State" || location.type === "Province" || location.type === "Region";
                                        
                                        return (
                                            <CommandItem
                                                key={location.code}
                                                value={location.name}
                                                onSelect={() => {
                                                    // Select location directly when clicking on the item
                                                    handleSelect(location);
                                                }}
                                                className="text-white hover:bg-white/10 cursor-pointer"
                                            >
                                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                                    <Check
                                                        className={cn(
                                                            "h-4 w-4 shrink-0",
                                                            isSelected ? "opacity-100" : "opacity-0"
                                                        )}
                                                    />
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="truncate">{location.name}</span>
                                                            <Badge
                                                                className={cn(
                                                                    "text-xs shrink-0",
                                                                    getTypeBadgeColor(location.type)
                                                                )}
                                                            >
                                                                {location.type}
                                                            </Badge>
                                                        </div>
                                                        {path !== location.name && (
                                                            <div className="text-xs text-white/50 truncate">
                                                                {path}
                                                            </div>
                                                        )}
                                                    </div>
                                                    {hasPotentialChildren && (
                                                        <button
                                                            type="button"
                                                            className="chevron-button shrink-0 p-1 hover:bg-white/10 rounded transition-colors"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                e.preventDefault();
                                                                // Navigate into subdivisions
                                                                handleSelect(location, e);
                                                            }}
                                                            title="Browse subdivisions"
                                                        >
                                                            <ChevronsUpDown className="h-4 w-4 text-white/60 hover:text-white" />
                                                        </button>
                                                    )}
                                                </div>
                                            </CommandItem>
                                        );
                                    })}
                                </CommandGroup>
                            )}
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>
            {!inline && value && (
                <div className="text-xs text-white/60 flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    <span>Searching in: {value.name}</span>
                </div>
            )}
        </div>
    );
}

