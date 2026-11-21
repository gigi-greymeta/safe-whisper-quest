import phantomLogo from "@/assets/phantom-logo.jpg";

interface LogoMarkProps {
  size?: number;
  glow?: boolean;
  className?: string;
}

const LogoMark = ({ size = 64, glow = true, className }: LogoMarkProps) => (
  <div
    className={`group relative rounded-2xl transition-all duration-500 ease-out hover:scale-[1.03] ${className ?? ""}`}
    style={{ width: size, height: size }}
  >
    {glow && (
      <div
        aria-hidden
        className="absolute -inset-3 rounded-3xl opacity-60 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
        style={{ background: "radial-gradient(closest-side, hsl(var(--primary) / 0.55), transparent 70%)" }}
      />
    )}
    <img
      src={phantomLogo}
      alt="Phantom Chat logo"
      width={size}
      height={size}
      className="relative h-full w-full rounded-2xl object-cover ring-1 ring-primary/20 transition-shadow duration-500 group-hover:ring-primary/60"
      style={{ boxShadow: "0 0 0 1px hsl(var(--primary) / 0.15), 0 10px 40px -10px hsl(var(--primary) / 0.45)" }}
    />
  </div>
);

export default LogoMark;
