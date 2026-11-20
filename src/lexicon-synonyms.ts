// Domain synonyms data split from lexicon.ts for the 200-line cap.
// The user says "router", the card says "route". Stem-keying in lexicon.ts
// makes the match symmetric. Data only, no logic, so no import cycle.
export const SYNONYM_GROUPS: string[][] = [
  ["demo", "mockup", "mock", "prototype"],
  ["a11y", "accessibility", "wcag"],
  ["i18n", "internationalization", "localization", "locale"],
  ["ui", "interface"],
  ["wizard", "stepper", "multistep", "onboarding"],
  ["slop", "templated", "generic"],
  ["copy", "writing", "microcopy"],
  ["perf", "performance", "fps"],
  ["route", "router", "routing", "routed"],
  ["render", "renderer", "rendering"],
  ["deploy", "deployment", "deploying", "deployed"],
  ["js", "javascript"],
  ["scrape", "crawl"],
  ["remember", "recall"],
];
