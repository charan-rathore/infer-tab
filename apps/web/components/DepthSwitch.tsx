export type Depth = "learn" | "inspect" | "prove";

const LEVELS: Array<{ id: Depth; label: string; hint: string }> = [
  { id: "learn", label: "Learn", hint: "Try it" },
  { id: "inspect", label: "Inspect", hint: "Shapes" },
  { id: "prove", label: "Prove", hint: "Why it holds" },
];

export function DepthSwitch({
  depth,
  onChange,
}: {
  depth: Depth;
  onChange: (next: Depth) => void;
}) {
  return (
    <div className="depth" role="tablist" aria-label="How deep to go">
      {LEVELS.map((level) => (
        <button
          key={level.id}
          type="button"
          role="tab"
          aria-selected={depth === level.id}
          className={depth === level.id ? "on" : ""}
          onClick={() => onChange(level.id)}
        >
          <strong>{level.label}</strong>
          <span>{level.hint}</span>
        </button>
      ))}
    </div>
  );
}
