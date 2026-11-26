import { useState } from "react";
import { Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getBlocked, unblock } from "@/store/blocked";

/** Settings card listing blocked people, with Unblock. */
const BlockedPeople = () => {
  const [blocked, setBlocked] = useState(getBlocked);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Ban className="h-4 w-4 text-primary" /> Blocked people
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {blocked.length === 0 ? (
          <p className="text-xs text-muted-foreground">
       To block someone, open your chat with them and tap ⋮ → Block.
          </p>
        ) : (
          blocked.map((b) => (
            <div key={b.fingerprint} className="flex items-center justify-between gap-2">
              <span className="text-sm text-foreground truncate">{b.name || "Unknown"}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  unblock(b.fingerprint);
                  setBlocked(getBlocked());
                }}
              >
                Unblock
              </Button>
            </div>
          ))
        )}
        {blocked.length > 0 && (
          <p className="text-[11px] text-muted-foreground">You can add as a contact after unblocking.</p>
        )}
      </CardContent>
    </Card>
  );
};

export default BlockedPeople;
