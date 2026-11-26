import { useLocation, useNavigate } from "react-router-dom";
import { MessageSquare, Settings, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { path: "/chats", label: "Chats", Icon: MessageSquare },
  { path: "/contacts", label: "Contacts", Icon: Users },
  { path: "/settings", label: "Settings", Icon: Settings },
] as const;

/** Bottom navigation on the main screens. Sticks to the bottom of the page, above the home indicator. */
const AppTabBar = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <nav className="sticky bottom-0 z-40 grid grid-cols-3 border-t bg-card/95 backdrop-blur-sm" aria-label="Main">
      {TABS.map(({ path, label, Icon }) => {
        const active = pathname === path || pathname.startsWith(`${path}/`);
        return (
          <button
            key={path}
            type="button"
            onClick={() => navigate(path, { replace: true })}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex flex-col items-center gap-0.5 py-2 text-[11px] transition-colors",
              active ? "text-primary" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-5 w-5" />
            {label}
          </button>
        );
      })}
    </nav>
  );
};

export default AppTabBar;
