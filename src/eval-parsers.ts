import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { parseFrontmatter } from "./card.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export interface ParserGolden {
  id: string;
  frontmatter: string;
  expect_name?: string;
  expect_contains?: string;
  expect_exact?: string;
  expect_not?: string;
  crlf?: boolean;
}

export function loadParserGoldens(): ParserGolden[] {
  const p = join(ROOT, "evals", "golden-parsers.yaml");
  if (!existsSync(p)) return [];
  const raw = readFileSync(p, "utf8");
  const data = yaml.load(raw) as Record<string, unknown>[] | null;
  if (!Array.isArray(data)) return [];
  return data
    .filter((d) => d && typeof d === "object" && typeof (d as Record<string, unknown>)["frontmatter"] === "string")
    .map((d) => {
      const r = d as Record<string, unknown>;
      return {
        id: String(r["id"] ?? "parser-case"),
        frontmatter: String(r["frontmatter"]),
        expect_name: r["expect_name"] != null ? String(r["expect_name"]) : undefined,
        expect_contains: r["expect_contains"] != null ? String(r["expect_contains"]) : undefined,
        expect_exact: r["expect_exact"] != null ? String(r["expect_exact"]) : undefined,
        expect_not: r["expect_not"] != null ? String(r["expect_not"]) : undefined,
        crlf: r["crlf"] === true,
      };
    });
}

export function runParserGoldens(): { pass: number; total: number; fails: string[] } {
  const cases = loadParserGoldens();
  const fails: string[] = [];
  let pass = 0;
  for (const g of cases) {
    const input = g.crlf ? g.frontmatter.replace(/\n/g, "\r\n") : g.frontmatter;
    const fakePath = `fake/${g.id}/SKILL.md`;
    let got: { name: string; description: string };
    try {
      got = parseFrontmatter(input, fakePath);
    } catch (e) {
      fails.push(`${g.id}: threw ${(e as Error).message}`);
      continue;
    }
    const problems: string[] = [];
    if (g.expect_name !== undefined && got.name !== g.expect_name) {
      problems.push(`name ${JSON.stringify(got.name)} !== ${JSON.stringify(g.expect_name)}`);
    }
    if (g.expect_exact !== undefined && got.description !== g.expect_exact) {
      problems.push(`description ${JSON.stringify(got.description.slice(0, 120))} !== exact ${JSON.stringify(g.expect_exact.slice(0, 120))}`);
    }
    if (g.expect_contains !== undefined && !got.description.includes(g.expect_contains)) {
      problems.push(`description missing ${JSON.stringify(g.expect_contains)} (got ${JSON.stringify(got.description.slice(0, 120))})`);
    }
    if (g.expect_not !== undefined && (got.description === g.expect_not || got.description.includes(g.expect_not) && g.expect_not.length <= 2)) {
      problems.push(`description still corrupted ${JSON.stringify(got.description.slice(0, 40))}`);
    }
    if (problems.length) fails.push(`${g.id}: ${problems.join("; ")}`);
    else pass++;
  }
  return { pass, total: cases.length, fails };
}
