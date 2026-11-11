import { useState } from "react";
import { AppProvider } from "./lib/ctx.tsx";
import { useLoc } from "./lib/route.ts";
import { useKeys } from "./lib/keys.ts";
import { Shell } from "./shell.tsx";
import { Palette } from "./features/palette.tsx";
import { Overview } from "./features/overview/Overview.tsx";
import { LibraryScreen } from "./features/library/Library.tsx";
import { Playground } from "./features/playground/Playground.tsx";
import { MandateScreen } from "./features/agents/Mandate.tsx";
import { TrashScreen, ChangesScreen } from "./features/trash/Trash.tsx";
import { IngestWizard } from "./features/ingest/Ingest.tsx";
import { TriageQueue } from "./features/triage/Triage.tsx";
import { ClustersScreen, EvalScreen } from "./features/clusters/Clusters.tsx";
import { ConfigScreen } from "./features/config/Config.tsx";

export function App() {
  const loc = useLoc();
  const [palette, setPalette] = useState(false);
  useKeys({ "mod+k": () => setPalette(true) });

  return (
    <AppProvider>
      <Shell loc={loc} onSearch={() => setPalette(true)}>
        {loc.screen === "overview" && <Overview />}
        {loc.screen === "library" && <LibraryScreen loc={loc} />}
        {loc.screen === "playground" && <Playground loc={loc} />}
        {loc.screen === "mandate" && <MandateScreen />}
        {loc.screen === "trash" && <TrashScreen />}
        {loc.screen === "changes" && <ChangesScreen />}
        {loc.screen === "ingest" && <IngestWizard />}
        {loc.screen === "triage" && <TriageQueue />}
        {loc.screen === "clusters" && <ClustersScreen />}
        {loc.screen === "eval" && <EvalScreen />}
        {loc.screen === "config" && <ConfigScreen />}
      </Shell>
      <Palette open={palette} onClose={() => setPalette(false)} />
    </AppProvider>
  );
}
