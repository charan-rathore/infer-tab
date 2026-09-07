import Link from "next/link";
import { JOURNEY } from "@/lib/copy";

export function JourneyNav({
  current,
}: {
  current: "kv" | "prefill" | "arithmetic";
}) {
  return (
    <nav className="journey" aria-label="Learning journey">
      <ol>
        {JOURNEY.map((item, index) => (
          <li key={item.id}>
            {index > 0 && (
              <span className="journey-arrow" aria-hidden="true">
                →
              </span>
            )}
            <Link
              href={item.href}
              className={current === item.id ? "on" : ""}
              aria-current={current === item.id ? "page" : undefined}
            >
              <span className="journey-num">{item.num}</span>
              <strong>{item.title}</strong>
              <span className="journey-meta">
                <em>Problem.</em> {item.problem}
              </span>
              <span className="journey-meta">
                <em>You do.</em> {item.action}
              </span>
              <span className="journey-meta">
                <em>You unlock.</em> {item.insight}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function ExperimentNav({
  current,
}: {
  current: "kv" | "prefill" | "arithmetic";
}) {
  return <JourneyNav current={current} />;
}
