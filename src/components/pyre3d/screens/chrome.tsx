import type { ReactNode } from "react";

/**
 * Oyun kabuğunun ortak parçaları.
 *
 * shadcn `button`'ı kullanmıyoruz: bu oyunun tipografisi Cinzel + geniş harf
 * aralıklı büyük harf ve kor kenarlık üzerine kurulu; varsayılanları ezmek
 * doğrudan yazmaktan uzun sürüyordu.
 */

export function PyreButton({
  children,
  onClick,
  variant = "ghost",
  disabled,
  full,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "danger";
  disabled?: boolean;
  full?: boolean;
}) {
  const base =
    "inline-flex items-center justify-center rounded-md px-5 py-2.5 font-display text-xs font-bold uppercase tracking-[0.2em] transition-all disabled:cursor-not-allowed disabled:opacity-35";
  const styles =
    variant === "primary"
      ? "bg-primary text-primary-foreground shadow-[var(--shadow-ember)] hover:opacity-90"
      : variant === "danger"
        ? "border border-destructive/50 text-destructive hover:bg-destructive/15"
        : "border border-foreground/25 text-foreground/85 hover:border-primary hover:text-primary";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${styles} ${full ? "w-full" : ""}`}
    >
      {children}
    </button>
  );
}

export function PyrePanel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-border bg-card/90 p-6 backdrop-blur ${className}`}>
      {children}
    </div>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="font-display text-[10px] font-bold uppercase tracking-[0.45em] text-primary">
      {children}
    </p>
  );
}

export function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-background/50 px-3 py-2">
      <p className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p
        className={`mt-0.5 font-display text-lg font-black ${accent ? "text-primary" : "text-foreground"}`}
      >
        {value}
      </p>
    </div>
  );
}

/** Kül sürüklenmesi: menüde WebGL bağlamı açmadan atmosfer. */
export function AshBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0" style={{ backgroundImage: "var(--gradient-ash)" }} />
      {Array.from({ length: 36 }, (_, i) => (
        <span
          key={i}
          className="absolute block rounded-full bg-foreground/20"
          style={{
            left: `${(i * 37) % 100}%`,
            top: `${(i * 61) % 100}%`,
            width: `${1 + (i % 3)}px`,
            height: `${1 + (i % 3)}px`,
            animation: `pyre-drift ${16 + (i % 9) * 3}s linear ${-i * 0.7}s infinite`,
          }}
        />
      ))}
      <style>{`@keyframes pyre-drift {
        0% { transform: translate3d(0,-12vh,0); opacity: 0; }
        12% { opacity: .55; }
        88% { opacity: .35; }
        100% { transform: translate3d(-6vw,112vh,0); opacity: 0; }
      }`}</style>
    </div>
  );
}
