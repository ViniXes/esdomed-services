import type { LucideIcon } from "lucide-react";

export function IsbmPageHeading({ title, description, icon: Icon }: {
  title: string;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-blue-100 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-cyan-300">
        <Icon size={21} strokeWidth={1.8} aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-blue-800 dark:text-cyan-300">Convenios ISBM</p>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">{title}</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{description}</p>
      </div>
    </div>
  );
}
