import * as React from "react";
import { X, Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface ListInputProps {
    value: string[];
    onChange: (value: string[]) => void;
    placeholder?: string;
    className?: string;
    onGenerate?: () => void;
    isGenerating?: boolean;
    generateLabel?: string;
    badgeColor?: string; // Custom badge color classes
}

export function ListInput({
    value,
    onChange,
    placeholder = "Add items...",
    className,
    onGenerate,
    isGenerating = false,
    generateLabel = "Generate",
    badgeColor,
}: ListInputProps) {
    const [inputValue, setInputValue] = React.useState("");

    const handleAddItem = (item: string) => {
        const trimmed = item.trim();
        if (trimmed && !value.includes(trimmed)) {
            onChange([...value, trimmed]);
        }
    };

    const handleRemoveItem = (itemToRemove: string) => {
        onChange(value.filter((item) => item !== itemToRemove));
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.preventDefault();
            if (inputValue.includes(",")) {
                // Handle comma-separated input
                const items = inputValue
                    .split(",")
                    .map((item) => item.trim())
                    .filter((item) => item.length > 0);
                items.forEach((item) => handleAddItem(item));
                setInputValue("");
            } else {
                handleAddItem(inputValue);
                setInputValue("");
            }
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setInputValue(e.target.value);
    };

    return (
        <div className={cn("space-y-2", className)}>
            <div className="relative w-full">
                <Input
                    value={inputValue}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    className={cn(
                        "bg-white/5 border-white/10 text-white placeholder:text-white/40 w-full",
                        onGenerate ? "pr-12" : ""
                    )}
                />
                {onGenerate && (
                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={onGenerate}
                            disabled={isGenerating}
                            className="h-8 w-8 text-yellow-300 hover:bg-transparent"
                            title={generateLabel}
                        >
                            {isGenerating ? (
                                <Loader2 className="h-4 w-4 animate-spin stroke-[2.5]" />
                            ) : (
                                <Sparkles className="h-4 w-4 stroke-[2.5]" />
                            )}
                        </Button>
                    </div>
                )}
            </div>
            {value.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {value.map((item) => (
                        <Badge
                            key={item}
                            variant={badgeColor ? undefined : "secondary"}
                            className={cn(
                                "flex items-center gap-1 pr-1",
                                badgeColor || "bg-secondary text-secondary-foreground"
                            )}
                        >
                            <span>{item}</span>
                            <button
                                type="button"
                                onClick={() => handleRemoveItem(item)}
                                className={cn(
                                    "ml-1 rounded-full focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
                                    badgeColor
                                        ? "hover:opacity-80"
                                        : "hover:bg-secondary/80"
                                )}
                                aria-label={`Remove ${item}`}
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </Badge>
                    ))}
                </div>
            )}
        </div>
    );
}
