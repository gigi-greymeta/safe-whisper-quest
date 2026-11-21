import { cn } from "@/lib/utils";

const TypingIndicator = ({ name }: { name: string }) => {
  return (
    <div className="flex w-full mb-2 justify-start">
      <div className="max-w-[80%] rounded-2xl px-4 py-2.5 bg-card border rounded-bl-md">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">{name}</span>
          <div className="flex gap-0.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={cn(
                  "inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/60",
                  "animate-bounce"
                )}
                style={{ animationDelay: `${i * 150}ms`, animationDuration: "0.8s" }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TypingIndicator;
