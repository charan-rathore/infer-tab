import type { KvBlock, TraceToken } from "@/lib/schema";

type ChipState = "idle" | "reconstructing" | "reused" | "fresh" | "ghost";

export function TokenChip({
  token,
  state = "idle",
}: {
  token: TraceToken | KvBlock;
  state?: ChipState;
}) {
  return (
    <span className={`chip ${state}`} title={`position ${token.position}`}>
      {token.text}
    </span>
  );
}
