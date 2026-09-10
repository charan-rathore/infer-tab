/** Learn-view sentences. Keep each paragraph to two or three short sentences. */

export const LEARN_01 = {
  question: "The model needs one more token. What should it do with the past?",
  rebuild: "Rebuild the past",
  keep: "Keep finished work",
  rebuildHint: "Every old block walks back to the bench and is made again.",
  keepHint: "Finished blocks stay on a shelf. Only the newest one is built.",
  waste: "Watch how much work is done again.",
  reveal:
    "Those still blocks were not rebuilt. The model read numbers it had already stored. You just created a KV cache.",
  bothLead: "Same prompt. Same weights. Two policies.",
  mathLead: "Add the rows that were built on each step.",
};

export const LEARN_02 = {
  ask: "Click a word. Which earlier words may it read?",
  future: "That later word does not exist yet for this question.",
  decodeAsk: "Now only one new question is asked. The shelf is still long.",
  grow: "A longer prompt makes a larger square. The next word stays one row.",
};

export const LEARN_03 = {
  mathAsk: "How much new math is this step doing?",
  dataAsk: "How much stored data must that math use?",
  divideAsk: "A divided by B means how much A for one B.",
  intensityName: "Arithmetic intensity = math work / data supplied",
};

export const JOURNEY = [
  {
    id: "kv" as const,
    href: "/repeating-work",
    num: "01",
    title: "Repeating work",
    problem: "Each new word looks at every word so far.",
    action: "Choose whether to rebuild the past or keep finished work.",
    insight: "Keeping finished work is a cache.",
  },
  {
    id: "prefill" as const,
    href: "/prefill-vs-decode",
    num: "02",
    title: "Read vs write",
    problem: "The prompt already exists. The next word does not.",
    action: "Click a word and see which past it may read.",
    insight: "Reading the room is a square. Writing one word is a row.",
  },
  {
    id: "arithmetic" as const,
    href: "/arithmetic-vs-memory",
    num: "03",
    title: "Math vs data",
    problem: "A step can do little new math and still need a lot of stored data.",
    action: "Change length, number size, and job. Watch both piles.",
    insight: "Work per byte is their ratio.",
  },
];
