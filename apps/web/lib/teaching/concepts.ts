export type ConceptId =
  | "token"
  | "position"
  | "hidden-representation"
  | "query"
  | "key"
  | "value"
  | "causal-dependency"
  | "attention"
  | "prefill"
  | "decode"
  | "recomputation"
  | "kv-cache"
  | "cache-growth"
  | "tensor-shape"
  | "flop"
  | "flop-per-second"
  | "bit"
  | "byte"
  | "dtype"
  | "logical-payload"
  | "arithmetic-intensity"
  | "bandwidth"
  | "memory-capacity"
  | "hbm"
  | "sram"
  | "roofline"
  | "batching"
  | "fragmentation"
  | "paging"
  | "prefix-reuse"
  | "kv-quantization"
  | "speculative-decoding"
  | "distributed-inference";

export type MisconceptionId =
  | "kv-cache-is-chat-memory"
  | "future-token-changes-earlier-state"
  | "float16-reduces-symbolic-flops"
  | "flop-equals-flop-per-second"
  | "bits-equal-bytes"
  | "less-arithmetic-means-little-data";

export type KnowledgeNodeId = ConceptId | `misconception:${MisconceptionId}`;
export type KnowledgeNodeKind = "concept" | "misconception";
export type ConceptStatus = "current" | "future";
export type ProvenanceKind =
  "RECORDED" | "DERIVED" | "AUTHORED" | "RESEARCH_SUPPORTED";
export type ConceptRelation =
  | "prerequisite"
  | "causes"
  | "solves"
  | "creates-bottleneck"
  | "contrasts-with"
  | "derived-from"
  | "analogy-for"
  | "misconception-about"
  | "next-question";

export type ExplanationStrategyId =
  | "physical-shelf"
  | "work-receipts"
  | "synchronized-comparison"
  | "causal-invariant"
  | "causal-edges"
  | "timeline-viewpoint"
  | "triangle-transformation"
  | "tensor-shape-derivation"
  | "unit-analogy"
  | "dtype-payload"
  | "work-versus-data"
  | "symbolic-derivation";

export interface ConceptProvenance {
  kind: ProvenanceKind;
  source: string;
}

export interface KnowledgeNode {
  id: KnowledgeNodeId;
  kind: KnowledgeNodeKind;
  label: string;
  status: ConceptStatus;
  provenance: ConceptProvenance;
}

export interface ConceptEdge {
  id: string;
  from: KnowledgeNodeId;
  to: KnowledgeNodeId;
  relation: ConceptRelation;
  provenance: ConceptProvenance;
}

export interface ExplanationStrategy {
  id: ExplanationStrategyId;
  concept: ConceptId;
  label: string;
  representation:
    "spatial" | "accounting" | "comparison" | "causal" | "units" | "symbolic";
}

/** Construct an authored node without repeating provenance boilerplate in the fixed curriculum. */
function current(id: ConceptId, label: string): KnowledgeNode {
  return {
    id,
    kind: "concept",
    label,
    status: "current",
    provenance: { kind: "AUTHORED", source: "InferTab curriculum" },
  };
}

/** Construct a locked node that records future scope without making it teachable today. */
function future(id: ConceptId, label: string): KnowledgeNode {
  return {
    id,
    kind: "concept",
    label,
    status: "future",
    provenance: { kind: "AUTHORED", source: "InferTab future curriculum" },
  };
}

/** Represent a misconception as a typed graph node so policy rules can traverse it explicitly. */
function misconception(id: MisconceptionId, label: string): KnowledgeNode {
  return {
    id: `misconception:${id}`,
    kind: "misconception",
    label,
    status: "current",
    provenance: { kind: "AUTHORED", source: "InferTab misconception catalog" },
  };
}

export const CONCEPT_NODES: readonly KnowledgeNode[] = [
  current("token", "Token"),
  current("position", "Position"),
  current("hidden-representation", "Hidden representation"),
  current("query", "Query"),
  current("key", "Key"),
  current("value", "Value"),
  current("causal-dependency", "Causal dependency"),
  current("attention", "Attention"),
  current("prefill", "Prefill"),
  current("decode", "Decode"),
  current("recomputation", "Repeated computation"),
  current("kv-cache", "KV cache"),
  current("cache-growth", "Cache growth"),
  current("tensor-shape", "Tensor shape"),
  current("flop", "FLOP"),
  current("flop-per-second", "FLOP/s"),
  current("bit", "Bit"),
  current("byte", "Byte"),
  current("dtype", "Dtype"),
  current("logical-payload", "Logical payload"),
  current("arithmetic-intensity", "Arithmetic intensity"),
  future("bandwidth", "Bandwidth"),
  future("memory-capacity", "Memory capacity"),
  future("hbm", "HBM"),
  future("sram", "SRAM"),
  future("roofline", "Roofline"),
  future("batching", "Batching"),
  future("fragmentation", "Fragmentation"),
  future("paging", "Paging"),
  future("prefix-reuse", "Prefix reuse"),
  future("kv-quantization", "KV quantization"),
  future("speculative-decoding", "Speculative decoding"),
  future("distributed-inference", "Distributed inference"),
  misconception("kv-cache-is-chat-memory", "KV cache is generic chat memory"),
  misconception(
    "future-token-changes-earlier-state",
    "A future token can change an earlier causal state",
  ),
  misconception(
    "float16-reduces-symbolic-flops",
    "Float16 automatically reduces symbolic FLOPs",
  ),
  misconception(
    "flop-equals-flop-per-second",
    "FLOP and FLOP/s are interchangeable",
  ),
  misconception("bits-equal-bytes", "Bits and bytes are interchangeable"),
  misconception(
    "less-arithmetic-means-little-data",
    "Less arithmetic guarantees little data",
  ),
] as const;

const AUTHORED = {
  kind: "AUTHORED",
  source: "InferTab concept model",
} as const;
const TRACE_DERIVED = {
  kind: "DERIVED",
  source: "validated traces and semantic adapters",
} as const;
const TRACE_RECORDED = {
  kind: "RECORDED",
  source: "validated Experiment 02 trace shapes",
} as const;
const SCALING_BOOK = {
  kind: "RESEARCH_SUPPORTED",
  source: "JAX Scaling Book, transformer inference",
} as const;
const SERVING_SYSTEMS = {
  kind: "RESEARCH_SUPPORTED",
  source: "vLLM and LMCache KV lifecycle documentation",
} as const;

export const CONCEPT_EDGES: readonly ConceptEdge[] = [
  {
    id: "token-position",
    from: "token",
    to: "position",
    relation: "prerequisite",
    provenance: AUTHORED,
  },
  {
    id: "token-hidden",
    from: "token",
    to: "hidden-representation",
    relation: "causes",
    provenance: SCALING_BOOK,
  },
  {
    id: "position-causality",
    from: "position",
    to: "causal-dependency",
    relation: "prerequisite",
    provenance: AUTHORED,
  },
  {
    id: "hidden-query",
    from: "hidden-representation",
    to: "query",
    relation: "causes",
    provenance: SCALING_BOOK,
  },
  {
    id: "hidden-key",
    from: "hidden-representation",
    to: "key",
    relation: "causes",
    provenance: SCALING_BOOK,
  },
  {
    id: "hidden-value",
    from: "hidden-representation",
    to: "value",
    relation: "causes",
    provenance: SCALING_BOOK,
  },
  {
    id: "query-attention",
    from: "query",
    to: "attention",
    relation: "prerequisite",
    provenance: SCALING_BOOK,
  },
  {
    id: "key-attention",
    from: "key",
    to: "attention",
    relation: "prerequisite",
    provenance: SCALING_BOOK,
  },
  {
    id: "value-attention",
    from: "value",
    to: "attention",
    relation: "prerequisite",
    provenance: SCALING_BOOK,
  },
  {
    id: "causal-attention",
    from: "causal-dependency",
    to: "attention",
    relation: "prerequisite",
    provenance: AUTHORED,
  },
  {
    id: "attention-prefill",
    from: "attention",
    to: "prefill",
    relation: "prerequisite",
    provenance: AUTHORED,
  },
  {
    id: "attention-decode",
    from: "attention",
    to: "decode",
    relation: "prerequisite",
    provenance: AUTHORED,
  },
  {
    id: "prefill-contrast-decode",
    from: "prefill",
    to: "decode",
    relation: "contrasts-with",
    provenance: TRACE_DERIVED,
  },
  {
    id: "recompute-solved",
    from: "kv-cache",
    to: "recomputation",
    relation: "solves",
    provenance: TRACE_DERIVED,
  },
  {
    id: "cache-stores-keys",
    from: "key",
    to: "kv-cache",
    relation: "prerequisite",
    provenance: SCALING_BOOK,
  },
  {
    id: "cache-stores-values",
    from: "value",
    to: "kv-cache",
    relation: "prerequisite",
    provenance: SCALING_BOOK,
  },
  {
    id: "cache-growth",
    from: "kv-cache",
    to: "cache-growth",
    relation: "creates-bottleneck",
    provenance: SCALING_BOOK,
  },
  {
    id: "cache-capacity",
    from: "cache-growth",
    to: "memory-capacity",
    relation: "next-question",
    provenance: SCALING_BOOK,
  },
  {
    id: "cache-prefix",
    from: "kv-cache",
    to: "prefix-reuse",
    relation: "next-question",
    provenance: SERVING_SYSTEMS,
  },
  {
    id: "cache-paging",
    from: "cache-growth",
    to: "paging",
    relation: "next-question",
    provenance: SERVING_SYSTEMS,
  },
  {
    id: "paging-fragmentation",
    from: "paging",
    to: "fragmentation",
    relation: "solves",
    provenance: SERVING_SYSTEMS,
  },
  {
    id: "shape-prefill",
    from: "tensor-shape",
    to: "prefill",
    relation: "derived-from",
    provenance: TRACE_RECORDED,
  },
  {
    id: "shape-decode",
    from: "tensor-shape",
    to: "decode",
    relation: "derived-from",
    provenance: TRACE_RECORDED,
  },
  {
    id: "flop-rate",
    from: "flop",
    to: "flop-per-second",
    relation: "contrasts-with",
    provenance: AUTHORED,
  },
  {
    id: "bit-byte",
    from: "bit",
    to: "byte",
    relation: "prerequisite",
    provenance: AUTHORED,
  },
  {
    id: "byte-dtype",
    from: "byte",
    to: "dtype",
    relation: "prerequisite",
    provenance: AUTHORED,
  },
  {
    id: "dtype-before-payload",
    from: "dtype",
    to: "logical-payload",
    relation: "prerequisite",
    provenance: AUTHORED,
  },
  {
    id: "dtype-payload",
    from: "dtype",
    to: "logical-payload",
    relation: "causes",
    provenance: TRACE_DERIVED,
  },
  {
    id: "flop-intensity",
    from: "flop",
    to: "arithmetic-intensity",
    relation: "prerequisite",
    provenance: TRACE_DERIVED,
  },
  {
    id: "payload-intensity",
    from: "logical-payload",
    to: "arithmetic-intensity",
    relation: "prerequisite",
    provenance: TRACE_DERIVED,
  },
  {
    id: "intensity-roofline",
    from: "arithmetic-intensity",
    to: "roofline",
    relation: "next-question",
    provenance: SCALING_BOOK,
  },
  {
    id: "bandwidth-roofline",
    from: "bandwidth",
    to: "roofline",
    relation: "prerequisite",
    provenance: SCALING_BOOK,
  },
  {
    id: "hbm-bandwidth",
    from: "hbm",
    to: "bandwidth",
    relation: "causes",
    provenance: SCALING_BOOK,
  },
  {
    id: "sram-hbm",
    from: "sram",
    to: "hbm",
    relation: "contrasts-with",
    provenance: SERVING_SYSTEMS,
  },
  {
    id: "batch-cache",
    from: "batching",
    to: "cache-growth",
    relation: "causes",
    provenance: SCALING_BOOK,
  },
  {
    id: "quant-cache",
    from: "kv-quantization",
    to: "cache-growth",
    relation: "solves",
    provenance: SCALING_BOOK,
  },
  {
    id: "spec-decode",
    from: "speculative-decoding",
    to: "decode",
    relation: "next-question",
    provenance: AUTHORED,
  },
  {
    id: "distributed-cache",
    from: "distributed-inference",
    to: "kv-cache",
    relation: "next-question",
    provenance: SCALING_BOOK,
  },
  {
    id: "m-kv",
    from: "misconception:kv-cache-is-chat-memory",
    to: "kv-cache",
    relation: "misconception-about",
    provenance: AUTHORED,
  },
  {
    id: "m-causal",
    from: "misconception:future-token-changes-earlier-state",
    to: "causal-dependency",
    relation: "misconception-about",
    provenance: AUTHORED,
  },
  {
    id: "m-f16",
    from: "misconception:float16-reduces-symbolic-flops",
    to: "dtype",
    relation: "misconception-about",
    provenance: AUTHORED,
  },
  {
    id: "m-rate",
    from: "misconception:flop-equals-flop-per-second",
    to: "flop-per-second",
    relation: "misconception-about",
    provenance: AUTHORED,
  },
  {
    id: "m-byte",
    from: "misconception:bits-equal-bytes",
    to: "byte",
    relation: "misconception-about",
    provenance: AUTHORED,
  },
  {
    id: "m-data",
    from: "misconception:less-arithmetic-means-little-data",
    to: "logical-payload",
    relation: "misconception-about",
    provenance: AUTHORED,
  },
] as const;

export const EXPLANATION_STRATEGIES: readonly ExplanationStrategy[] = [
  {
    id: "physical-shelf",
    concept: "kv-cache",
    label: "Physical shelf",
    representation: "spatial",
  },
  {
    id: "work-receipts",
    concept: "kv-cache",
    label: "Work receipts",
    representation: "accounting",
  },
  {
    id: "synchronized-comparison",
    concept: "kv-cache",
    label: "Synchronized comparison",
    representation: "comparison",
  },
  {
    id: "causal-invariant",
    concept: "kv-cache",
    label: "Causal invariant",
    representation: "causal",
  },
  {
    id: "causal-edges",
    concept: "causal-dependency",
    label: "Causal edges",
    representation: "causal",
  },
  {
    id: "timeline-viewpoint",
    concept: "causal-dependency",
    label: "Timeline viewpoint",
    representation: "spatial",
  },
  {
    id: "triangle-transformation",
    concept: "causal-dependency",
    label: "Triangle transformation",
    representation: "spatial",
  },
  {
    id: "tensor-shape-derivation",
    concept: "causal-dependency",
    label: "Tensor shape derivation",
    representation: "symbolic",
  },
  {
    id: "unit-analogy",
    concept: "arithmetic-intensity",
    label: "Unit analogy",
    representation: "units",
  },
  {
    id: "dtype-payload",
    concept: "arithmetic-intensity",
    label: "Dtype payload",
    representation: "spatial",
  },
  {
    id: "work-versus-data",
    concept: "arithmetic-intensity",
    label: "Work versus data",
    representation: "comparison",
  },
  {
    id: "symbolic-derivation",
    concept: "arithmetic-intensity",
    label: "Symbolic derivation",
    representation: "symbolic",
  },
] as const;

const NODE_BY_ID = new Map(CONCEPT_NODES.map((node) => [node.id, node]));

/** Return one graph node by stable ID, failing loudly for an invalid curriculum reference. */
export function conceptNode(id: KnowledgeNodeId): KnowledgeNode {
  const node = NODE_BY_ID.get(id);
  if (!node) throw new Error(`Unknown concept node: ${id}`);
  return node;
}

/** Traverse typed outgoing relationships without building a general graph runtime. */
export function outgoingConceptEdges(
  id: KnowledgeNodeId,
  relation?: ConceptRelation,
): ConceptEdge[] {
  return CONCEPT_EDGES.filter(
    (edge) => edge.from === id && (!relation || edge.relation === relation),
  );
}

/** Return the full prerequisite closure in deterministic curriculum order. */
export function prerequisiteClosure(id: ConceptId): ConceptId[] {
  const found = new Set<ConceptId>();
  const visit = (target: ConceptId) => {
    for (const edge of CONCEPT_EDGES) {
      if (edge.to !== target || edge.relation !== "prerequisite") continue;
      const source = conceptNode(edge.from);
      if (source.kind !== "concept" || found.has(source.id as ConceptId))
        continue;
      found.add(source.id as ConceptId);
      visit(source.id as ConceptId);
    }
  };
  visit(id);
  return CONCEPT_NODES.filter(
    (node): node is KnowledgeNode & { id: ConceptId } =>
      node.kind === "concept" && found.has(node.id as ConceptId),
  ).map((node) => node.id);
}

/** Answer what a solution solves or what bottleneck it creates using typed edges. */
export function relatedConcepts(
  id: ConceptId,
  relation: "solves" | "creates-bottleneck" | "next-question",
): ConceptId[] {
  return outgoingConceptEdges(id, relation)
    .map((edge) => conceptNode(edge.to))
    .filter((node) => node.kind === "concept")
    .map((node) => node.id as ConceptId);
}

/** List the validated representations authored for one concept. */
export function strategiesForConcept(id: ConceptId): ExplanationStrategy[] {
  return EXPLANATION_STRATEGIES.filter((strategy) => strategy.concept === id);
}

/** Resolve a misconception through its typed graph edge to the validated strategies for that concept. */
export function strategiesForMisconception(
  id: MisconceptionId,
): ExplanationStrategy[] {
  const edge = CONCEPT_EDGES.find(
    (candidate) =>
      candidate.from === `misconception:${id}` &&
      candidate.relation === "misconception-about",
  );
  if (!edge) return [];
  const target = conceptNode(edge.to);
  return target.kind === "concept"
    ? strategiesForConcept(target.id as ConceptId)
    : [];
}

/** Validate IDs, endpoints, provenance, and strategy references once at session startup. */
export function validateConceptGraph(): void {
  if (NODE_BY_ID.size !== CONCEPT_NODES.length)
    throw new Error("Concept graph contains duplicate node IDs.");
  const edgeIds = new Set<string>();
  for (const edge of CONCEPT_EDGES) {
    if (edgeIds.has(edge.id))
      throw new Error(`Duplicate concept edge: ${edge.id}`);
    edgeIds.add(edge.id);
    conceptNode(edge.from);
    conceptNode(edge.to);
    if (!edge.provenance.source)
      throw new Error(`Concept edge lacks provenance: ${edge.id}`);
  }
  const strategyIds = new Set<ExplanationStrategyId>();
  for (const strategy of EXPLANATION_STRATEGIES) {
    if (strategyIds.has(strategy.id))
      throw new Error(`Duplicate explanation strategy: ${strategy.id}`);
    strategyIds.add(strategy.id);
    const concept = conceptNode(strategy.concept);
    if (concept.status !== "current")
      throw new Error(`Strategy targets locked concept: ${strategy.id}`);
  }
  for (const node of CONCEPT_NODES.filter(
    (candidate) => candidate.kind === "misconception",
  )) {
    const targets = outgoingConceptEdges(node.id, "misconception-about");
    if (targets.length !== 1)
      throw new Error(`Misconception must target one concept: ${node.id}`);
  }
}
