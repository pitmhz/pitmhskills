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
import { MandateScreen } from "./features/agents/Mandate.tsx";
import { TrashScreen, ChangesScreen } from "./features/trash/Trash.tsx";

const PENDING: Record<string, { title: string; slice: string }> = {
  triage: { title: "Triage", slice: "S6 ingest + triage" },
  clusters: { title: "Clusters", slice: "S7 clusters + eval" },
  eval: { title: "Eval", slice: "S7 clusters + eval" },
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
        {loc.screen === "mandate" && <MandateScreen />}
        {loc.screen === "trash" && <TrashScreen />}
        {loc.screen === "changes" && <ChangesScreen />}
        {pending && (
          <Page title={pending.title}>
            <Empty action={<a className="text-[13px] text-accent underline" href="#/library">Open Library</a>}>
              This screen is built in slice {pending.slice}. Library, Playground, Mandate, Trash, and Changes are live.
            </Empty>
          </Page>
        )}
      </Shell>
      <Palette open={palette} onClose={() => setPalette(false)} />
    </AppProvider>
  );
}
