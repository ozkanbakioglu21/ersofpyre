import { memo, useLayoutEffect, useRef } from "react";
import { MARKER_POOL, type HudSnapshot } from "../types";
import type { HudBridge } from "./bridge";

/**
 * Oyun içi HUD.
 *
 * Buradaki her parça DOM'unu BİR KEZ render eder ve sonra köprüye bir
 * "painter" kaydeder: değerler her karede doğrudan style üzerinden yazılır.
 * React yeniden render'ı yalnız hedef listesi/altyazı gibi seyrek değişen
 * şeyler için çalışır.
 */

const pct = (v: number) => `${Math.max(0, Math.min(100, v))}%`;

/* ------------------------------------------------------------------ *
 * Barlar
 * ------------------------------------------------------------------ */

function Bar({
  label,
  color,
  bridge,
  pick,
  glowAt,
}: {
  label: string;
  color: string;
  bridge: HudBridge;
  pick: (f: import("../types").HudFrame) => number;
  glowAt?: number;
}) {
  const fill = useRef<HTMLDivElement | null>(null);
  const wrap = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(
    () =>
      bridge.register((f) => {
        const el = fill.current;
        if (!el) return;
        const v = pick(f);
        el.style.width = pct(v);
        if (glowAt !== undefined && wrap.current) {
          wrap.current.style.opacity =
            v >= glowAt ? String(0.75 + Math.sin(performance.now() * 0.012) * 0.25) : "1";
        }
      }),
    [bridge, pick, glowAt],
  );
  return (
    <div ref={wrap} className="flex items-center gap-2">
      <span className="w-9 text-[10px] uppercase tracking-widest text-foreground/70">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-background/70 ring-1 ring-foreground/10">
        <div ref={fill} className={`h-full rounded-full ${color}`} style={{ width: "100%" }} />
      </div>
    </div>
  );
}

const pickHp = (f: import("../types").HudFrame) => f.hp;
const pickStm = (f: import("../types").HudFrame) => f.stamina;
const pickHeat = (f: import("../types").HudFrame) => f.heat;
const pickRage = (f: import("../types").HudFrame) => f.rage;

function Bars({ bridge }: { bridge: HudBridge }) {
  return (
    <div className="pointer-events-none absolute left-4 top-4 w-40 space-y-2">
      <Bar label="Can" color="bg-destructive" bridge={bridge} pick={pickHp} />
      <Bar label="Stm" color="bg-accent" bridge={bridge} pick={pickStm} />
      <Bar label="Isı" color="bg-primary" bridge={bridge} pick={pickHeat} glowAt={80} />
      <Bar label="Öfke" color="bg-ember" bridge={bridge} pick={pickRage} glowAt={100} />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Aşırı ısınma uyarısı
 * ------------------------------------------------------------------ */

function OverheatChip({ bridge }: { bridge: HudBridge }) {
  const box = useRef<HTMLDivElement | null>(null);
  const ring = useRef<SVGCircleElement | null>(null);
  useLayoutEffect(
    () =>
      bridge.register((f) => {
        const el = box.current;
        if (!el) return;
        const on = f.overheat > 0;
        el.style.opacity = on ? "1" : "0";
        if (on && ring.current) {
          const k = f.overheat / f.overheatMax;
          ring.current.style.strokeDashoffset = String(100 * (1 - k));
        }
      }),
    [bridge],
  );
  return (
    <div
      ref={box}
      style={{ opacity: 0, transition: "opacity .18s" }}
      className="pointer-events-none absolute left-1/2 top-24 flex -translate-x-1/2 items-center gap-2 rounded-full border border-destructive/60 bg-background/85 px-4 py-1.5 backdrop-blur"
    >
      <svg viewBox="0 0 36 36" className="h-5 w-5 -rotate-90">
        <circle
          cx="18"
          cy="18"
          r="15.9"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          className="text-destructive/25"
        />
        <circle
          ref={ring}
          cx="18"
          cy="18"
          r="15.9"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeDasharray="100"
          className="text-destructive"
        />
      </svg>
      <span className="font-display text-xs font-black uppercase tracking-[0.3em] text-destructive">
        Aşırı Isınma
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Kombo halkası
 * ------------------------------------------------------------------ */

function ComboRing({ bridge }: { bridge: HudBridge }) {
  const box = useRef<HTMLDivElement | null>(null);
  const num = useRef<HTMLSpanElement | null>(null);
  const ring = useRef<SVGCircleElement | null>(null);
  useLayoutEffect(
    () =>
      bridge.register((f) => {
        const el = box.current;
        if (!el) return;
        const on = f.combo > 1;
        el.style.opacity = on ? "1" : "0";
        el.style.transform = `scale(${on ? 1 : 0.85})`;
        if (!on) return;
        if (num.current) num.current.textContent = `x${f.combo}`;
        if (ring.current) ring.current.style.strokeDashoffset = String(100 * (1 - f.comboT / 5));
      }),
    [bridge],
  );
  return (
    <div
      ref={box}
      style={{ opacity: 0, transition: "opacity .15s, transform .15s" }}
      className="pointer-events-none absolute right-4 top-16 h-14 w-14"
    >
      <svg viewBox="0 0 36 36" className="absolute inset-0 h-full w-full -rotate-90">
        <circle
          cx="18"
          cy="18"
          r="15.9"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          className="text-primary/20"
        />
        <circle
          ref={ring}
          cx="18"
          cy="18"
          r="15.9"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeDasharray="100"
          className="text-primary"
        />
      </svg>
      <span
        ref={num}
        className="absolute inset-0 flex items-center justify-center font-display text-lg font-black text-primary"
      >
        x1
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Hedef işaretçileri — dünya büyük, bunlar olmadan hedef bulunmuyor
 * ------------------------------------------------------------------ */

const MARK_COLOR: Record<string, string> = {
  objective: "var(--primary)",
  optional: "var(--accent)",
  threat: "#7fe4ff",
  weakpoint: "#ffffff",
};

function TargetMarkers({ bridge }: { bridge: HudBridge }) {
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  useLayoutEffect(
    () =>
      bridge.register((f) => {
        for (let i = 0; i < MARKER_POOL; i++) {
          const el = refs.current[i];
          if (!el) continue;
          const m = f.markers[i]!;
          if (!m.active) {
            el.style.opacity = "0";
            continue;
          }
          el.style.opacity = m.onScreen ? "0.85" : "1";
          el.style.transform = `translate(${m.x}px, ${m.y}px) translate(-50%, -50%) rotate(${m.onScreen ? 45 : m.angle}deg)`;
          el.style.color = MARK_COLOR[m.kind] ?? "var(--primary)";
          el.style.borderRadius = m.onScreen ? "2px" : "0";
          el.style.clipPath = m.onScreen ? "none" : "polygon(100% 50%, 0 0, 25% 50%, 0 100%)";
          el.style.width = m.onScreen ? "9px" : "16px";
          el.style.height = m.onScreen ? "9px" : "14px";
          el.style.background = m.onScreen ? "transparent" : "currentColor";
          el.style.border = m.onScreen ? "2px solid currentColor" : "none";
        }
      }),
    [bridge],
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: MARKER_POOL }, (_, i) => (
        <div
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          className="absolute left-0 top-0"
          style={{ opacity: 0, willChange: "transform" }}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Vinyetler
 * ------------------------------------------------------------------ */

function Vignettes({ bridge }: { bridge: HudBridge }) {
  const hit = useRef<HTMLDivElement | null>(null);
  const rage = useRef<HTMLDivElement | null>(null);
  const mark = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(
    () =>
      bridge.register((f) => {
        if (hit.current) hit.current.style.opacity = String(Math.min(0.72, f.hitFlash * 0.72));
        if (rage.current) rage.current.style.opacity = f.rageActive > 0 ? "0.5" : "0";
        if (mark.current) mark.current.style.opacity = f.marked > 0 ? "0.35" : "0";
      }),
    [bridge],
  );
  return (
    <>
      <div
        ref={hit}
        className="pointer-events-none absolute inset-0"
        style={{
          opacity: 0,
          background:
            "radial-gradient(ellipse at center, transparent 45%, oklch(0.45 0.2 27 / 0.9) 100%)",
        }}
      />
      <div
        ref={rage}
        className="pointer-events-none absolute inset-0"
        style={{
          opacity: 0,
          transition: "opacity .4s",
          background:
            "radial-gradient(ellipse at center, transparent 30%, oklch(0.3 0.16 40 / 0.85) 100%)",
        }}
      />
      <div
        ref={mark}
        className="pointer-events-none absolute inset-0"
        style={{
          opacity: 0,
          transition: "opacity .25s",
          background: "linear-gradient(180deg, oklch(0.5 0.2 27 / 0.5), transparent 22%)",
        }}
      />
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Uçuş göstergesi
 * ------------------------------------------------------------------ */

function FlightChip({ bridge }: { bridge: HudBridge }) {
  const el = useRef<HTMLParagraphElement | null>(null);
  useLayoutEffect(
    () =>
      bridge.register((f) => {
        if (!el.current) return;
        el.current.textContent = `${Math.round(f.speed)} hız · ${Math.round(f.alt)} m · ${f.fps} fps`;
      }),
    [bridge],
  );
  return (
    <p
      ref={el}
      className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 font-mono text-[10px] uppercase tracking-widest text-foreground/40"
    />
  );
}

/* ------------------------------------------------------------------ *
 * React ile render edilen (seyrek değişen) parçalar
 * ------------------------------------------------------------------ */

const Objectives = memo(function Objectives({ s }: { s: HudSnapshot }) {
  if (!s.objectives.length) return null;
  return (
    <div className="pointer-events-none absolute right-4 top-32 w-52 space-y-1.5">
      {s.objectives.map((o) => (
        <div
          key={o.id}
          className="rounded border border-foreground/15 bg-background/60 px-2.5 py-1.5 backdrop-blur"
        >
          <div className="flex items-baseline justify-between gap-2">
            <span
              className={`text-[10px] uppercase tracking-widest ${
                o.done
                  ? "text-foreground/35 line-through"
                  : o.optional
                    ? "text-accent"
                    : "text-primary"
              }`}
            >
              {o.done ? "✓" : "▸"} {o.label}
            </span>
            <span className="font-display text-[10px] text-foreground/60">
              {o.have}/{o.need}
            </span>
          </div>
          <div className="mt-1 h-0.5 overflow-hidden rounded-full bg-foreground/10">
            <div
              className={`h-full rounded-full ${o.done ? "bg-foreground/30" : "bg-primary"}`}
              style={{ width: pct(o.need ? (o.have / o.need) * 100 : 0) }}
            />
          </div>
        </div>
      ))}
    </div>
  );
});

const BossBar = memo(function BossBar({ s }: { s: HudSnapshot }) {
  if (!s.boss) return null;
  return (
    <div className="pointer-events-none absolute left-1/2 top-4 w-[min(28rem,80vw)] -translate-x-1/2">
      <div className="flex items-baseline justify-between">
        <span className="font-display text-xs font-black uppercase tracking-[0.3em] text-primary">
          {s.boss.label}
        </span>
        <span className="text-[10px] uppercase tracking-widest text-foreground/50">
          {s.boss.modules.filter((m) => m.dead).length}/{s.boss.modules.length} modül
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-background/70 ring-1 ring-primary/30">
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: pct(s.boss.hp) }}
        />
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {s.boss.modules.map((m) => (
          <span
            key={m.label}
            className={`rounded px-1.5 py-0.5 text-[9px] uppercase tracking-widest ${
              m.dead
                ? "bg-foreground/10 text-foreground/30 line-through"
                : "bg-primary/15 text-primary"
            }`}
          >
            {m.label}
          </span>
        ))}
      </div>
    </div>
  );
});

const Subtitles = memo(function Subtitles({ s, onSkip }: { s: HudSnapshot; onSkip: () => void }) {
  if (!s.subtitle) return null;
  const who = s.subtitle.who;
  return (
    <div className="absolute bottom-28 left-1/2 w-[min(46rem,88vw)] -translate-x-1/2 sm:bottom-24">
      <button
        onClick={onSkip}
        className="w-full rounded-lg border border-foreground/15 bg-background/85 px-4 py-3 text-left backdrop-blur transition-colors hover:border-primary/50"
      >
        {who !== "sistem" && (
          <p className="font-display text-[10px] font-bold uppercase tracking-[0.35em] text-primary">
            {who}
          </p>
        )}
        <p
          className={`text-sm leading-snug ${who === "sistem" ? "italic text-foreground/70" : "text-foreground"}`}
        >
          {s.subtitle.text}
        </p>
      </button>
    </div>
  );
});

const HintToast = memo(function HintToast({ s }: { s: HudSnapshot }) {
  if (!s.hint) return null;
  return (
    <div className="pointer-events-none absolute left-1/2 top-14 flex -translate-x-1/2 items-center gap-2 rounded-full border border-accent/40 bg-background/85 px-4 py-1.5 backdrop-blur">
      <span className="text-[11px] uppercase tracking-widest text-accent">{s.hint.text}</span>
      {s.hint.keys.map((k) => (
        <kbd
          key={k}
          className="rounded border border-accent/50 bg-accent/15 px-1.5 py-0.5 font-mono text-[10px] text-accent"
        >
          {k}
        </kbd>
      ))}
    </div>
  );
});

const MarkedBanner = memo(function MarkedBanner({ s }: { s: HudSnapshot }) {
  if (!s.marked) return null;
  return (
    <p className="pointer-events-none absolute left-1/2 top-36 -translate-x-1/2 font-display text-xs font-black uppercase tracking-[0.4em] text-destructive">
      İşaretlendin
    </p>
  );
});

/* ------------------------------------------------------------------ *
 * Bileşik HUD
 * ------------------------------------------------------------------ */

export function Hud({
  bridge,
  s,
  onSkip,
}: {
  bridge: HudBridge;
  s: HudSnapshot;
  onSkip: () => void;
}) {
  return (
    <>
      <Vignettes bridge={bridge} />
      <Bars bridge={bridge} />
      <div className="pointer-events-none absolute right-4 top-4 text-right">
        <p className="font-display text-xl font-black text-foreground drop-shadow">
          {s.score.toLocaleString("tr-TR")}
        </p>
        <p className="text-[10px] uppercase tracking-widest text-primary">
          Yıkım {s.destroyed}/{s.goal}
        </p>
      </div>
      <ComboRing bridge={bridge} />
      <OverheatChip bridge={bridge} />
      <TargetMarkers bridge={bridge} />
      <BossBar s={s} />
      <Objectives s={s} />
      <HintToast s={s} />
      <MarkedBanner s={s} />
      <Subtitles s={s} onSkip={onSkip} />
      <FlightChip bridge={bridge} />
    </>
  );
}
