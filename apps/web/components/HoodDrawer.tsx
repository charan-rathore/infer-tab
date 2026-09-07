import type { ReactNode } from "react";

export function HoodDrawer({
  title = "How do we know?",
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <details className="hood">
      <summary>{title}</summary>
      <div className="hood-body">{children}</div>
    </details>
  );
}
