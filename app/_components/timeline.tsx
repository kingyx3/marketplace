import type { TimelineItem } from "@/app/_data/marketplace-fixtures";

const stateClasses: Record<TimelineItem["state"], string> = {
  complete: "border-emerald-600 bg-emerald-600",
  current: "border-sky-600 bg-white",
  upcoming: "border-zinc-300 bg-white",
  error: "border-rose-600 bg-rose-600",
};

export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <ol className="grid gap-4">
      {items.map((item) => (
        <li key={`${item.label}-${item.date}`} className="grid grid-cols-[1rem_1fr] gap-3">
          <span className={`mt-1 size-3 rounded-full border-2 ${stateClasses[item.state]}`} />
          <span>
            <span className="block text-sm font-semibold text-zinc-900">{item.label}</span>
            <span className="mt-1 block text-sm text-zinc-500">{item.date}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
