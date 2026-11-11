// Calculates WCAG 2 contrast ratios for token pairs (PRD §6.1, §12.2 #2)
function lum(hex: string): number {
  const rgb = hex.replace("#", "").match(/.{2}/g)!.map((x) => parseInt(x, 16) / 255).map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  );
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}
function ratio(fg: string, bg: string): number {
  const l1 = lum(fg), l2 = lum(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
const tokens = {
  light: { bg: "#F7F6F3", surface: "#FFFFFF", surface2: "#EFEDE8", line: "#E1DED7", ink: "#1A1A18", ink2: "#5E5C55", accent: "#B4410F", ok: "#2F6B3F", bad: "#A12A2A" },
  dark: { bg: "#121212", surface: "#191919", surface2: "#222222", line: "#2C2C2C", ink: "#ECEAE4", ink2: "#A19E95", accent: "#E0662E", ok: "#6FB482", bad: "#E27D7D" },
};
let fails = 0;
for (const theme of ["light", "dark"] as const) {
  const t = tokens[theme];
  const checks = [
    { name: "body ink on surface", fg: t.ink, bg: t.surface, min: 4.5 },
    { name: "secondary ink2 on surface", fg: t.ink2, bg: t.surface, min: 4.5 },
    { name: "accent on surface", fg: t.accent, bg: t.surface, min: 3.0 },
    { name: "ok text on surface", fg: t.ok, bg: t.surface, min: 3.5 },
    { name: "bad text on surface", fg: t.bad, bg: t.surface, min: 3.5 },
  ];
  for (const c of checks) {
    const r = ratio(c.fg, c.bg);
    if (r < c.min) { console.log(`FAIL [${theme}] ${c.name}: ${r.toFixed(2)} < ${c.min}`); fails++; }
    else console.log(`ok   [${theme}] ${c.name}: ${r.toFixed(2)}:1`);
  }
}
if (fails) { console.log(`${fails} contrast failures`); process.exit(1); }
console.log("Tokens pass WCAG contrast.");
