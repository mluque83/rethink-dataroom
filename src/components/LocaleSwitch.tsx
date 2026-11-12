import { setLocaleAction } from "@/app/locale-actions";

export function LocaleSwitch({ current }: { current: "es" | "en" }) {
  return (
    <form action={setLocaleAction} className="flex gap-1 text-sm" aria-label="Idioma / Language">
      {(["es", "en"] as const).map((l) => (
        <button key={l} name="locale" value={l} className={`px-2 py-1 rounded ${l === current ? "bg-navy text-white" : "text-navy"}`} aria-pressed={l === current}>
          {l.toUpperCase()}
        </button>
      ))}
    </form>
  );
}
