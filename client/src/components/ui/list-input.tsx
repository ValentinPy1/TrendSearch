import * as React from "react";
import { X } from "lucide-react";
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
}

export function ListInput({
    value,
    onChange,
    placeholder = "Add items...",
    className,
    onGenerate,
    isGenerating = false,
    generateLabel = "Generate",
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
            <div className="flex gap-2">
                <Input
                    value={inputValue}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    className="flex-1"
                />
                {onGenerate && (
                    <Button
                        type="button"
                        variant="outline"
                        onClick={onGenerate}
                        disabled={isGenerating}
                        className="whitespace-nowrap"
                    >
                        {isGenerating ? "Generating..." : generateLabel}
                    </Button>
                )}
            </div>
            {value.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {value.map((item) => (
                        <Badge
                            key={item}
                            variant="secondary"
                            className="flex items-center gap-1 pr-1"
                        >
                            <span>{item}</span>
                            <button
                                type="button"
                                onClick={() => handleRemoveItem(item)}
                                className="ml-1 rounded-full hover:bg-secondary/80 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
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
