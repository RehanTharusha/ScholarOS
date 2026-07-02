"use client";

import * as React from "react";
import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { motion } from "motion/react";
import { Check, Plus, Search, X, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface TagsDropdownProps {
  availableTags: string[];
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  onCreateTag?: (tag: string) => void;
  placeholder?: string;
}

export function TagsDropdown({
  availableTags,
  selectedTags,
  onTagsChange,
  onCreateTag,
  placeholder = "Tags",
}: TagsDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const searchLower = search.toLowerCase().trim();

  const filteredTags = useMemo(() => {
    if (!searchLower) return availableTags;
    return availableTags.filter((tag) =>
      tag.toLowerCase().includes(searchLower)
    );
  }, [availableTags, searchLower]);

  const exactMatch = useMemo(() => {
    return availableTags.some(
      (tag) => tag.toLowerCase() === searchLower
    );
  }, [availableTags, searchLower]);

  const showCreateOption =
    search.trim().length > 0 && !exactMatch && !!onCreateTag;

  const totalItems = filteredTags.length + (showCreateOption ? 1 : 0);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [search]);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      setSearch("");
    }
  }, [open]);

  const toggleTag = useCallback(
    (tag: string) => {
      if (selectedTags.includes(tag)) {
        onTagsChange(selectedTags.filter((t) => t !== tag));
      } else {
        onTagsChange([...selectedTags, tag]);
      }
    },
    [selectedTags, onTagsChange]
  );

  const createAndSelectTag = useCallback(
    (tag: string) => {
      const trimmed = tag.trim();
      if (!trimmed) return;
      onCreateTag?.(trimmed);
      if (!selectedTags.includes(trimmed)) {
        onTagsChange([...selectedTags, trimmed]);
      }
      setSearch("");
    },
    [onCreateTag, selectedTags, onTagsChange]
  );

  const removeTag = useCallback(
    (tag: string, e: React.MouseEvent) => {
      e.stopPropagation();
      onTagsChange(selectedTags.filter((t) => t !== tag));
    },
    [selectedTags, onTagsChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedIndex((i) => (i + 1) % totalItems);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightedIndex((i) => (i - 1 + totalItems) % totalItems);
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (showCreateOption && highlightedIndex === filteredTags.length) {
          createAndSelectTag(search);
        } else if (filteredTags[highlightedIndex]) {
          toggleTag(filteredTags[highlightedIndex]);
        }
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    },
    [
      totalItems,
      highlightedIndex,
      filteredTags,
      showCreateOption,
      search,
      createAndSelectTag,
      toggleTag,
    ]
  );

  // Scroll highlighted item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.querySelector(`[data-index="${highlightedIndex}"]`);
    item?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-1.5 text-sm",
            "hover:bg-accent/50 transition-colors outline-none",
            "focus-visible:ring-2 focus-visible:ring-ring/50",
            selectedTags.length === 0 && "text-muted-foreground"
          )}
        >
          <div className="flex flex-wrap items-center gap-1">
            {selectedTags.length === 0 ? (
              <span>{placeholder}</span>
            ) : (
              selectedTags.map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="rounded-full text-xs gap-1 pr-1"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={(e) => removeTag(tag, e)}
                    className="ml-0.5 rounded-full hover:bg-foreground/10 p-0.5"
                    aria-label={`Remove ${tag}`}
                  >
                    <X className="size-2.5" />
                  </button>
                </Badge>
              ))
            )}
          </div>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-64 p-0 rounded-xl border-border"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* Search input */}
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search className="size-3.5 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search tags..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="rounded-full hover:bg-accent p-0.5"
              >
                <X className="size-3 text-muted-foreground" />
              </button>
            )}
          </div>

          {/* Tag list */}
          <div
            ref={listRef}
            className="max-h-48 overflow-y-auto p-1"
            role="listbox"
          >
            {filteredTags.length === 0 && !showCreateOption ? (
              <div className="py-6 text-center text-xs text-muted-foreground">
                No tags found
              </div>
            ) : (
              <>
                {filteredTags.map((tag, index) => {
                  const isSelected = selectedTags.includes(tag);
                  const isHighlighted = index === highlightedIndex;
                  return (
                    <button
                      key={tag}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      data-index={index}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors",
                        "hover:bg-accent/50 outline-none",
                        isHighlighted && "bg-accent/50"
                      )}
                      onClick={() => toggleTag(tag)}
                      onMouseEnter={() => setHighlightedIndex(index)}
                    >
                      <span className="flex-1 truncate">{tag}</span>
                      {isSelected && (
                        <Check className="size-3.5 shrink-0 text-primary" />
                      )}
                    </button>
                  );
                })}

                {/* Create new tag option */}
                {showCreateOption && (
                  <button
                    type="button"
                    role="option"
                    data-index={filteredTags.length}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors",
                      "hover:bg-accent/50 outline-none",
                      highlightedIndex === filteredTags.length && "bg-accent/50"
                    )}
                    onClick={() => createAndSelectTag(search)}
                    onMouseEnter={() =>
                      setHighlightedIndex(filteredTags.length)
                    }
                  >
                    <Plus className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate">
                      Create &ldquo;{search.trim()}&rdquo;
                    </span>
                  </button>
                )}
              </>
            )}
          </div>
        </motion.div>
      </PopoverContent>
    </Popover>
  );
}
