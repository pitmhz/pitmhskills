import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { Tooltip } from "radix-ui";
import "./styles/tokens.css";
import { App } from "./app.tsx";

createRoot(document.getElementById("root")!).render(
  <Tooltip.Provider delayDuration={300}>
    <App />
    <Toaster position="bottom-right" toastOptions={{ className: "!bg-surface !text-ink !border-line !rounded-[8px] !text-[13px]" }} />
  </Tooltip.Provider>,
);
