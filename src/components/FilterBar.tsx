"use client";

export default function FilterBar({
  label,
  active,
  onToggle,
  passingCount,
  totalCount,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
  passingCount: number;
  totalCount: number;
}) {
  return (
    <button
      onClick={onToggle}
      className={`pointer-events-auto flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold shadow-lg ring-1 backdrop-blur transition ${
        active
          ? "bg-emerald-600 text-white ring-emerald-700"
          : "bg-white/95 text-slate-700 ring-black/10 hover:bg-white"
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded border ${
          active ? "border-white bg-white" : "border-slate-400"
        }`}
      >
        {active && (
          <svg viewBox="0 0 16 16" className="h-3 w-3 text-emerald-600">
            <path
              fill="currentColor"
              d="M6.4 11.2 3.2 8l1.1-1.1 2.1 2.1 5-5L12.5 5z"
            />
          </svg>
        )}
      </span>
      {label}
      <span className={active ? "text-emerald-100" : "text-slate-400"}>
        ({passingCount}/{totalCount})
      </span>
    </button>
  );
}
