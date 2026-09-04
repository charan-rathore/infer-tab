import Link from "next/link";

export function ExperimentNav({ current }: { current: "kv" | "prefill" }) {
  return (
    <nav className="exp-nav" aria-label="Experiments">
      <Link href="/" className={current === "kv" ? "active" : ""}>
        01 · Why a cache?
      </Link>
      <Link
        href="/prefill-vs-decode"
        className={current === "prefill" ? "active" : ""}
      >
        02 · Read, then write
      </Link>
    </nav>
  );
}
