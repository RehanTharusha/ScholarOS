import { getGreeting } from "@/lib/greeting";

export function Greeting() {
  const { greeting, emoji } = getGreeting();
  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col items-center justify-center gap-4 px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground/80 sm:text-3xl md:text-4xl">
        {greeting}, Scholar <span aria-hidden>{emoji}</span>
      </h1>
      <p className="text-sm text-muted-foreground">What are we working on?</p>
    </div>
  );
}
