import * as React from 'react';
import { useRef, useEffect } from 'react';
import { ArrowUp, ArrowDown, ArrowUpDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { SortDirection } from '@/hooks/useSortState';

export interface SortOption {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

export interface SortDropdownProps {
  /** Available sort options */
  options: SortOption[];
  /** Currently active sort field */
  currentSort: string;
  /** Current sort direction */
  currentDirection: SortDirection;
  /** Called when user selects a sort option or toggles direction */
  onSortChange: (sortId: string, direction: SortDirection) => void;
  /** Optional trigger button label override */
  triggerLabel?: string;
  /** Optional class name for the trigger button */
  triggerClassName?: string;
  /** Optional alignment for the dropdown content */
  align?: 'start' | 'center' | 'end';
  /** Optional side for the dropdown content */
  side?: 'top' | 'bottom';
}

function SortDropdown({
  options,
  currentSort,
  currentDirection,
  onSortChange,
  triggerLabel,
  triggerClassName,
  align = 'end',
  side = 'bottom',
}: SortDropdownProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  // Scroll active item into view when dropdown opens
  useEffect(() => {
    if (!contentRef.current) return;
    const activeItem = contentRef.current.querySelector('[data-active="true"]');
    if (activeItem) {
      activeItem.scrollIntoView({ block: 'nearest' });
    }
  }, [currentSort]);

  const handleSelectOption = (optionId: string) => {
    // If clicking the already-active option, toggle direction
    if (optionId === currentSort) {
      onSortChange(optionId, currentDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // Default direction for new selection
      const defaultDir = optionId === 'name' ? 'asc' : 'desc';
      onSortChange(optionId, defaultDir);
    }
  };

  const handleToggleDirection = (e: React.MouseEvent, optionId: string) => {
    e.stopPropagation();
    onSortChange(optionId, currentDirection === 'asc' ? 'desc' : 'asc');
  };

  const activeOption = options.find((o) => o.id === currentSort);
  const displayLabel = triggerLabel || (activeOption ? activeOption.label : 'Sort');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'gap-1.5 text-muted-foreground hover:text-foreground',
            triggerClassName
          )}
        >
          <ArrowUpDown className="size-3.5" />
          <span className="text-xs font-medium">{displayLabel}</span>
          <span className="text-[10px] text-muted-foreground/70">
            {currentDirection === 'asc' ? '↑' : '↓'}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        ref={contentRef}
        align={align}
        side={side}
        sideOffset={8}
        className="w-56 bg-card border-border"
      >
        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal px-2">
          Sort by
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-border" />
        {options.map((option) => {
          const isActive = option.id === currentSort;
          return (
            <DropdownMenuItem
              key={option.id}
              data-active={isActive}
              className={cn(
                'flex items-center justify-between gap-2 px-2 py-1.5 cursor-pointer',
                isActive && 'bg-accent text-accent-foreground'
              )}
              onClick={() => handleSelectOption(option.id)}
            >
              <div className="flex items-center gap-2 min-w-0">
                {option.icon && (
                  <span className="size-4 shrink-0 text-muted-foreground">
                    {option.icon}
                  </span>
                )}
                <span className="text-sm truncate">{option.label}</span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {isActive && (
                  <>
                    <button
                      type="button"
                      className="p-0.5 rounded hover:bg-background/50 transition-colors"
                      onClick={(e) => handleToggleDirection(e, option.id)}
                      aria-label={`Toggle sort direction for ${option.label}`}
                    >
                      {currentDirection === 'asc' ? (
                        <ArrowUp className="size-3" />
                      ) : (
                        <ArrowDown className="size-3" />
                      )}
                    </button>
                    <Check className="size-3.5 text-primary" />
                  </>
                )}
              </div>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { SortDropdown };
