import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initDebugConsoleIfEnabled } from "./lib/debugConsole";

// Phantom is dark on every device. Marking the whole document dark (not just each page) means
// dialogs, sheets, menus and toasts, which render outside the page, get the dark colours too.
document.documentElement.classList.add("dark");
initDebugConsoleIfEnabled();
createRoot(document.getElementById("root")!).render(<App />);
