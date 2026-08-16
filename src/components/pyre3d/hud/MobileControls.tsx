import { useLayoutEffect, useRef } from "react";
import type { Ctrl, HudFrame } from "../types";
import type { HudBridge } from "./bridge";

/**
 * Dokunmatik kontroller.
 *
 * Önceden mobilde irtifa, takla, alev topu ve duraklatma tamamen erişilemezdi:
 * Q/E yalnız klavyedeydi, `roll` hiç okunmuyordu, alev topu yoktu. Eksik olan
 * her giriş burada bir denetime karşılık geliyor.
 *
 * Başparmak kaydırması sırasında React state'i güncellemiyoruz — eski kodda
 * `setJoy` her pointermove'da (saniyede 120'ye kadar) tüm oyunu yeniden
 * render ediyordu. Topuz doğrudan transform ile taşınıyor.
 */

const RADIUS = 34;

export function MobileControls({
  ctrl,
  bridge,
  onPause,
  abilities,
}: {
  ctrl: { current: Ctrl };
  bridge: HudBridge;
  onPause: () => void;
  abilities: { fireball: boolean; roll: boolean; shock: boolean; rage: boolean };
}) {
  const padRef = useRef<HTMLDivElement | null>(null);
  const knobRef = useRef<HTMLDivElement | null>(null);
  const joyId = useRef<number | null>(null);

  const altRef = useRef<HTMLDivElement | null>(null);
  const altKnob = useRef<HTMLDivElement | null>(null);
  const altId = useRef<number | null>(null);

  const rageBtn = useRef<HTMLButtonElement | null>(null);
  const fireBtn = useRef<HTMLButtonElement | null>(null);

  // Öfke butonu yalnız bar dolunca beliriyor; alev butonu aşırı ısınmada söner.
  useLayoutEffect(
    () =>
      bridge.register((f: HudFrame) => {
        if (rageBtn.current) {
          const ready = f.rage >= 100;
          rageBtn.current.style.opacity = ready ? "1" : "0";
          rageBtn.current.style.pointerEvents = ready ? "auto" : "none";
        }
        if (fireBtn.current) fireBtn.current.style.opacity = f.overheat > 0 ? "0.35" : "1";
      }),
    [bridge],
  );

  const moveJoy = (e: React.PointerEvent) => {
    const el = padRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const len = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, len) / len;
    const x = dx * k;
    const y = dy * k;
    ctrl.current.x = x;
    ctrl.current.y = y;
    ctrl.current.boost = Math.hypot(x, y) > 0.88;
    if (knobRef.current) {
      knobRef.current.style.transform = `translate(calc(-50% + ${x * RADIUS}px), calc(-50% + ${y * RADIUS}px))`;
    }
  };

  const endJoy = () => {
    joyId.current = null;
    ctrl.current.x = 0;
    ctrl.current.y = 0;
    ctrl.current.boost = false;
    if (knobRef.current) knobRef.current.style.transform = "translate(-50%, -50%)";
  };

  const moveAlt = (e: React.PointerEvent) => {
    const el = altRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const t = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const v = Math.max(-1, Math.min(1, -t));
    ctrl.current.alt = Math.abs(v) < 0.14 ? 0 : v;
    if (altKnob.current) {
      altKnob.current.style.transform = `translate(-50%, calc(-50% + ${-v * 46}px))`;
    }
  };

  const endAlt = () => {
    altId.current = null;
    ctrl.current.alt = 0;
    if (altKnob.current) altKnob.current.style.transform = "translate(-50%, -50%)";
  };

  const tap = (fn: () => void) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      fn();
    },
  });

  const btn =
    "touch-none rounded-full border font-display font-bold uppercase tracking-widest transition-colors";

  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      {/* duraklatma */}
      <button
        onPointerDown={(e) => {
          e.preventDefault();
          onPause();
        }}
        className="pointer-events-auto absolute right-4 top-4 h-9 w-9 touch-none rounded-md border border-foreground/25 bg-background/70 text-foreground/80 backdrop-blur active:bg-foreground/20 sm:hidden"
        aria-label="Duraklat"
      >
        ⏸
      </button>

      {/* yön çubuğu */}
      <div
        ref={padRef}
        onPointerDown={(e) => {
          joyId.current = e.pointerId;
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          moveJoy(e);
        }}
        onPointerMove={(e) => joyId.current === e.pointerId && moveJoy(e)}
        onPointerUp={endJoy}
        onPointerCancel={endJoy}
        className="pointer-events-auto absolute bottom-8 left-6 h-32 w-32 touch-none rounded-full border border-foreground/20 bg-foreground/5 backdrop-blur-[2px]"
        style={{
          marginBottom: "env(safe-area-inset-bottom)",
          marginLeft: "env(safe-area-inset-left)",
        }}
      >
        <div
          ref={knobRef}
          className="pointer-events-none absolute left-1/2 top-1/2 h-14 w-14 rounded-full border border-primary/60 bg-primary/25"
          style={{ transform: "translate(-50%, -50%)" }}
        />
      </div>

      {/* irtifa pedi — iki butondan daha iyi uçuş hissi veriyor */}
      <div
        ref={altRef}
        onPointerDown={(e) => {
          altId.current = e.pointerId;
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          moveAlt(e);
        }}
        onPointerMove={(e) => altId.current === e.pointerId && moveAlt(e)}
        onPointerUp={endAlt}
        onPointerCancel={endAlt}
        className="pointer-events-auto absolute bottom-44 left-6 h-32 w-14 touch-none rounded-full border border-foreground/20 bg-foreground/5 backdrop-blur-[2px]"
        style={{ marginLeft: "env(safe-area-inset-left)" }}
      >
        <span className="pointer-events-none absolute left-1/2 top-1.5 -translate-x-1/2 text-[10px] text-accent/70">
          ▲
        </span>
        <span className="pointer-events-none absolute bottom-1.5 left-1/2 -translate-x-1/2 text-[10px] text-accent/70">
          ▼
        </span>
        <div
          ref={altKnob}
          className="pointer-events-none absolute left-1/2 top-1/2 h-10 w-10 rounded-full border border-accent/60 bg-accent/20"
          style={{ transform: "translate(-50%, -50%)" }}
        />
      </div>

      {/* eylem kümesi */}
      <div
        className="pointer-events-auto absolute bottom-8 right-6 flex items-end gap-2.5"
        style={{
          marginBottom: "env(safe-area-inset-bottom)",
          marginRight: "env(safe-area-inset-right)",
        }}
      >
        <div className="flex flex-col gap-2.5">
          {abilities.rage && (
            <button
              ref={rageBtn}
              {...tap(() => (ctrl.current.rage = true))}
              style={{ opacity: 0, pointerEvents: "none" }}
              className={`${btn} h-12 w-12 border-ember/70 bg-ember/25 text-[9px] text-ember`}
            >
              Öfke
            </button>
          )}
          {abilities.shock && (
            <button
              {...tap(() => (ctrl.current.shock = true))}
              className={`${btn} h-14 w-14 border-accent/50 bg-accent/15 text-[10px] text-accent active:bg-accent/40`}
            >
              Şok
            </button>
          )}
        </div>
        <div className="flex flex-col gap-2.5">
          {abilities.roll && (
            <button
              {...tap(() => (ctrl.current.roll = ctrl.current.x >= 0 ? 1 : -1))}
              className={`${btn} h-14 w-14 border-foreground/40 bg-foreground/10 text-[10px] text-foreground/85 active:bg-foreground/25`}
            >
              Takla
            </button>
          )}
          {abilities.fireball && (
            <button
              {...tap(() => (ctrl.current.fireball = true))}
              className={`${btn} h-16 w-16 border-accent/70 bg-accent/20 text-[10px] text-accent active:bg-accent/45`}
            >
              Köz
            </button>
          )}
        </div>
        <button
          ref={fireBtn}
          onPointerDown={(e) => {
            e.preventDefault();
            ctrl.current.fire = true;
          }}
          onPointerUp={() => (ctrl.current.fire = false)}
          onPointerLeave={() => (ctrl.current.fire = false)}
          onPointerCancel={() => (ctrl.current.fire = false)}
          className={`${btn} h-24 w-24 border-2 border-primary/70 bg-primary/25 text-xs font-black text-primary active:bg-primary/50`}
        >
          Alev
        </button>
      </div>
    </div>
  );
}
