import { cn } from "@/lib/utils";
import { motion } from "motion/react";

function SkeletonShimmer({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton-shimmer"
      className={cn("relative overflow-hidden rounded-md bg-muted/70", className)}
      {...props}
    >
      <motion.div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-r from-transparent via-background/40 to-transparent"
        animate={{ x: ["-100%", "100%"] }}
        transition={{
          duration: 1.8,
          ease: "easeInOut",
          repeat: Number.POSITIVE_INFINITY,
        }}
      />
    </div>
  );
}

function SkeletonShimmerCard({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border/50 bg-card p-4 shadow-sm",
        className,
      )}
      {...props}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 space-y-2.5">
          <SkeletonShimmer className="h-3 w-1/3" />
          <SkeletonShimmer className="h-5 w-1/2" />
        </div>
        <SkeletonShimmer className="size-10 rounded-xl" />
      </div>
    </div>
  );
}

function SkeletonShimmerLine({
  width = "full",
  className,
}: {
  width?: "full" | "3/4" | "1/2" | "1/3" | "1/4";
  className?: string;
}) {
  return (
    <SkeletonShimmer
      className={cn(
        "h-4",
        width === "full" && "w-full",
        width === "3/4" && "w-3/4",
        width === "1/2" && "w-1/2",
        width === "1/3" && "w-1/3",
        width === "1/4" && "w-1/4",
        className,
      )}
    />
  );
}

export { SkeletonShimmer, SkeletonShimmerCard, SkeletonShimmerLine };
