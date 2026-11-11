import { useState } from "react";
import { AppProvider } from "./lib/ctx.tsx";
import { useLoc } from "./lib/route.ts";
import { useKeys } from "./lib/keys.ts";
import { Page, Shell } from "./shell.tsx";
import { Empty } from "./ui/controls.tsx";
import { Palette } from "./features/palette.tsx";
import { Overview } from "./features/overview/Overview.tsx";
import { LibraryScreen } from "./features/library/Library.tsx";
import { Playground } from "./features/playground/Playground.tsx";

// Screens not built yet name the slice that builds them instead of faking behavior.
const PENDING: Record<string, { title: string; slice: string }> = {
  triage: { title: "Triage", slice: "S6 ingest + triage" },
  clusters: { title: "Clusters", slice: "S7 clusters + eval" },
  eval: { title: "Eval", slice: "S7 clusters + eval" },
  mandate: { title: "Mandate", slice: "S5 mandate editor" },
  trash: { title: "Trash", slice: "S3 write core" },
  changes: { title: "Changes", slice: "S3 write core" },
};

export function App() {
  const loc = useLoc();
  const [palette, setPalette] = useState(false);
  useKeys({ "mod+k": () => setPalette(true) });
  const pending = PENDING[loc.screen];
  return (
    <AppProvider>
      <Shell loc={loc} onSearch={() => setPalette(true)}>
        {loc.screen === "overview" && <Overview />}
        {loc.screen === "library" && <LibraryScreen loc={loc} />}
        {loc.screen === "playground" && <Playground loc={loc} />}
        {pending && (
          <Page title={pending.title}>
            <Empty action={<a className="text-[13px] text-accent underline" href="#/library">Open Library</a>}>
              This screen is built in slice {pending.slice}. Library and Playground work now.
            </Empty>
          </Page>
        )}
      </Shell>
      <Palette open={palette} onClose={() => setPalette(false)} />
    </AppProvider>
  );
}
