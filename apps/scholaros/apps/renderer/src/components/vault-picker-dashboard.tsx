import { useState } from "react";
import { FolderPlus, FolderOpen, Loader2, RotateCcw } from "lucide-react";
import { getGreeting } from "@/lib/greeting";
import { AcademicCard } from "@/components/academic/academic-shell";

export function VaultPickerDashboard({
  onRunOnboarding,
}: {
  onRunOnboarding?: () => void;
}) {
  const [busy, setBusy] = useState<"create" | "add" | null>(null);
  const { greeting } = getGreeting();

  const handleCreate = async () => {
    setBusy("create");
    try {
      const result = await window.ipc.invoke("vault:create", null);
      if (result.success && result.id) {
        await window.ipc.invoke("vault:switch", { id: result.id });
      }
    } catch (e) {
      console.error("Failed to create vault:", e);
    } finally {
      setBusy(null);
    }
  };

  const handleAdd = async () => {
    setBusy("add");
    try {
      const result = await window.ipc.invoke("vault:add", null);
      if (result.success && result.id) {
        await window.ipc.invoke("vault:switch", { id: result.id });
      }
    } catch (e) {
      console.error("Failed to add vault:", e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-8 px-6">
      <div className="text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-foreground">
          {greeting}, Scholar
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          Get started with your knowledge vault
        </p>
      </div>
      <div className="flex w-full max-w-lg flex-col gap-4">
        <button
          type="button"
          onClick={handleCreate}
          disabled={busy !== null}
          className="w-full text-left"
        >
          <AcademicCard className="group flex items-center gap-4 p-6 transition-all hover:border-primary/50 hover:shadow-md active:scale-[0.98]">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-border bg-muted text-muted-foreground transition-colors group-hover:border-primary/30 group-hover:text-primary">
              {busy === "create" ? (
                <Loader2 className="size-6 animate-spin" />
              ) : (
                <FolderPlus className="size-6" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-base font-medium text-foreground">
                Create New Vault
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Set up a new vault in an empty folder
              </p>
            </div>
          </AcademicCard>
        </button>
        <button
          type="button"
          onClick={handleAdd}
          disabled={busy !== null}
          className="w-full text-left"
        >
          <AcademicCard className="group flex items-center gap-4 p-6 transition-all hover:border-primary/50 hover:shadow-md active:scale-[0.98]">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-border bg-muted text-muted-foreground transition-colors group-hover:border-primary/30 group-hover:text-primary">
              {busy === "add" ? (
                <Loader2 className="size-6 animate-spin" />
              ) : (
                <FolderOpen className="size-6" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-base font-medium text-foreground">
                Select Existing Folder
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Choose a folder that already has your notes
              </p>
            </div>
          </AcademicCard>
        </button>
      </div>
      {onRunOnboarding && (
        <button
          type="button"
          onClick={onRunOnboarding}
          className="mt-6 inline-flex items-center gap-2 rounded-xl border border-border/60 bg-muted/30 px-4 py-2.5 text-sm font-medium text-muted-foreground transition-all hover:border-border hover:bg-muted/60 hover:text-foreground active:scale-[0.97]"
        >
          <RotateCcw className="size-4" />
          Run onboarding again
        </button>
      )}
    </div>
  );
}
