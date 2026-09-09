import type { SemanticCaption as Caption } from "@/lib/visual/projection";

/** Keep one semantic caption mounted; emphasis follows the recorded observation rather than a wall-clock timer. */
export function SemanticCaption({ caption }: { caption: Caption }) {
  return (
    <div
      className="semantic-caption"
      data-caption-id={caption.id}
      data-caption-kind={caption.kind}
    >
      <small aria-hidden="true">{caption.kind.replaceAll("_", " ")}</small>
      <p role="status" aria-live="polite" aria-atomic="true">
        {caption.lead} <strong>{caption.emphasis}</strong>
        {caption.after}
      </p>
      <details>
        <summary>Caption evidence</summary>
        <code className="trace-path">{caption.source}</code>
      </details>
    </div>
  );
}
