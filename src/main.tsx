import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initDebugConsoleIfEnabled } from "./lib/debugConsole";

initDebugConsoleIfEnabled();
createRoot(document.getElementById("root")!).render(<App />);
