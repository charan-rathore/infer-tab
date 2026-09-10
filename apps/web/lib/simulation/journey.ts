import type { Lesson, Prediction } from "./model";

export const LESSON_PATHS: Record<Lesson, string> = {
  "01": "/repeating-work",
  "02": "/prefill-vs-decode",
  "03": "/arithmetic-vs-memory",
};

/** Map a deep-room pathname onto its lens; the catalog at `/` has no lesson. */
export function lessonFromPath(pathname: string): Lesson | null {
  const found = (Object.entries(LESSON_PATHS) as [Lesson, string][]).find(
    ([, path]) => path === pathname,
  );
  return found ? found[0] : null;
}

/** Declarative lesson copy labels the same state contract across all three lenses. */
export const JOURNEY: Record<
  Lesson,
  {
    title: string;
    problem: string;
    start: string;
    question: string;
    answers: Array<{ id: Prediction; label: string }>;
    mechanism: string;
    term: string;
    bottleneck: string;
    next?: { href: string; label: string };
  }
> = {
  "01": {
    title: "Why build the same past again?",
    problem:
      "Make one word. Then decide which finished work the next word needs.",
    start: "Build the first word",
    question: "For the next word, how many blocks will this machine build?",
    answers: [
      { id: "one", label: "Only the newest block" },
      { id: "all", label: "Every block so far" },
    ],
    mechanism: "Keep finished work",
    term: "You made a KV cache. K means key: a label to match. V means value: the contents to gather. The cache keeps those numbers for later questions.",
    bottleneck:
      "Keeping a block saves building it again. But the next question still reads the growing shelf. Are reading a whole prompt and writing one word the same job?",
    next: { href: "/prefill-vs-decode", label: "Follow the shelf into 02" },
  },
  "02": {
    title: "Which questions can happen together?",
    problem:
      "Choose a question. Try to make it read a word from its future.",
    start: "Inspect the first question",
    question: "May the first question read the word at position 1?",
    answers: [
      { id: "yes", label: "Yes, the prompt already exists" },
      { id: "no", label: "No, it is later than this question" },
    ],
    mechanism: "Ask all existing questions together",
    term: "Reading the existing prompt together is prefill. Asking with one newly generated token is decode. Both retain the same causal read restriction.",
    bottleneck:
      "The new question is just one row, yet it reaches every stored position. Does less new math mean little data is needed?",
    next: {
      href: "/arithmetic-vs-memory",
      label: "Follow the same shelf into 03",
    },
  },
  "03": {
    title: "One question. How much stored data?",
    problem:
      "Keep the calculation fixed. Find out what changes when each number takes less space.",
    start: "Count this question’s math",
    question:
      "If each number occupies 2 bytes instead of 4, what shrinks in this symbolic model?",
    answers: [
      { id: "math", label: "The arithmetic" },
      { id: "bytes", label: "The stored payload" },
      { id: "both", label: "Both quantities" },
    ],
    mechanism: "Use 2-byte numbers",
    term: "Work per byte is arithmetic intensity. Here it divides attention arithmetic by the logical Q, K, and V payloads for one head.",
    bottleneck:
      "To know what limits a real machine, we need its arithmetic throughput and actual memory traffic. This logical account tells us what to investigate, not how fast a GPU runs.",
  },
};
