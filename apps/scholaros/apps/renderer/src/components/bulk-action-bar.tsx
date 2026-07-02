import { motion, AnimatePresence } from 'motion/react';
import { Archive, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface BulkActionBarProps {
  /** Number of currently selected items */
  selectedCount: number;
  /** Called when archive action is triggered */
  onArchive?: () => void;
  /** Called when delete action is triggered */
  onDelete?: () => void;
  /** Called when clear selection action is triggered */
  onClearSelection: () => void;
  /** Whether the current view is archived (swaps archive to unarchive) */
  isArchived?: boolean;
}

function BulkActionBar({
  selectedCount,
  onArchive,
  onDelete,
  onClearSelection,
  isArchived = false,
}: BulkActionBarProps) {
  return (
    <AnimatePresence>
      {selectedCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{
            type: 'spring',
            stiffness: 400,
            damping: 30,
          }}
          className={cn(
            'fixed bottom-6 left-1/2 -translate-x-1/2 z-50',
            'flex items-center gap-2 px-4 py-2',
            'bg-foreground text-background',
            'rounded-xl shadow-lg',
            'border border-border/20'
          )}
        >
          {/* Selection count */}
          <span className="text-sm font-medium tabular-nums whitespace-nowrap">
            {selectedCount} selected
          </span>

          {/* Separator */}
          <div className="w-px h-4 bg-background/20" />

          {/* Action buttons */}
          {onArchive && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onArchive}
              className={cn(
                'gap-1.5 text-background hover:bg-background/15',
                'hover:text-background'
              )}
            >
              <Archive className="size-3.5" />
              <span className="text-xs font-medium">
                {isArchived ? 'Unarchive' : 'Archive'}
              </span>
            </Button>
          )}

          {onDelete && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              className={cn(
                'gap-1.5 text-background hover:bg-destructive/80',
                'hover:text-white'
              )}
            >
              <Trash2 className="size-3.5" />
              <span className="text-xs font-medium">Delete</span>
            </Button>
          )}

          {/* Separator before clear */}
          <div className="w-px h-4 bg-background/20" />

          {/* Clear selection */}
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onClearSelection}
            className="text-background hover:bg-background/15 hover:text-background"
            aria-label="Clear selection"
          >
            <X className="size-3.5" />
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export { BulkActionBar };
export type { BulkActionBarProps };
