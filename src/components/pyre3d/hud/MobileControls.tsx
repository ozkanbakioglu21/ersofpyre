import { useLayoutEffect, useRef } from "react";
import type { Ctrl, HudFrame } from "../types";
import type { HudBridge } from "./bridge";

/**
 * Dokunmatik kontroller — tek başparmak uç, tek başparmak yak.
 *
 * Önceki şema telefonda oynanmıyordu ve sebebi düzen değil eşlemeydi:
 *
 *  - Sol çubuğun X ekseni `roll`'a bağlıydı. Roll yalnız gövdeyi yatırır,
 *    ejderhayı DÖNDÜRMEZ; oyuncu çubuğu sağa itip "neden dönmüyorum"
 *    diyordu. Dönüş, üzerinde ▲▼ okları çizili ayrı bir dikey pedin
 *    yukarı/aşağı sürüklenmesine bağlıydı — yani sol/sağ dönmek için
 *    yukarı/aşağı çekmek gerekiyordu.
 *  - İleri hız `|pitch| > 0.05` kapısının arkasındaydı: çubuk dikeyde
 *    boştayken hız sıfırdı, ejderha havada asılı kalıyordu.
 *
 * Şimdi tek çubuk var ve beklendiği gibi eşlenmiş: yana = dön, yukarı =
 * yüksel, aşağı = alçal. İleri uçuş her zaman açık (bkz. `flight.ts`),
 * çubuğu sonuna kadar itmek gaz veriyor. Çubuk sabit değil: sol yarıya
 * nereye basarsan orada doğuyor — küçük ekranda 128 pikselli bir daireyi
 * körlemesine bulmak zorunda kalmıyorsun.
 *
 * Başparmak kaydırması sırasında React state'i güncellemiyoruz — eski kodda
 * `setJoy` her pointermove'da (saniyede 120'ye kadar) tüm oyunu yeniden
 * render ediyordu. Topuz doğrudan transform ile taşınıyor.
 */

/** Topuzun merkezden azami sapması (piksel). */
const RADIUS = 44;
/** Topuz çapı. Taban çapı = 2·RADIUS + KNOB, böylece topuz tam kenarda durur. */
const KNOB = 56;
/** Bu eşiğin altındaki sapma yok sayılır — başparmak titremesi sürüklemesin. */
const DEADZONE = 0.14;
/** Çubuğun bu kadarını geçmek gaza basmak demek. */
const BOOST_AT = 0.9;
/** Boştayken taban bu oranda küçülüyor; parmak değince tam boya açılıyor. */
const REST_SCALE = 0.66;

/** Kısa dokunsal geri bildirim; desteklemeyen cihazda sessizce yok sayılır. */
function buzz(ms: number): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* iOS Safari desteklemiyor — sorun değil */
  }
}

/**
 * Merkeze yakın hassas, kenara doğru hızlı yanıt. Doğrusal eşleme mobilde
 * ya çok hantal ya çok savruk oluyor; 1.4'lük üs ikisinin arasını tutuyor.
 */
function curve(v: number): number {
  const t = Math.max(0, (Math.abs(v) - DEADZONE) / (1 - DEADZONE));
  return Math.sign(v) * Math.min(1, Math.pow(t, 1.35) * 1.15);
}

export type TouchAbilities = {
  fireball: boolean;
  roll: boolean;
  shock: boolean;
  rage: boolean;
};

export function MobileControls({
  ctrl,
  bridge,
  onPause,
  abilities,
  invertY,
}: {
  ctrl: { current: Ctrl };
  bridge: HudBridge;
  onPause: () => void;
  abilities: TouchAbilities;
  /** Uçuş simülasyonu alışkanlığı: aşağı çek = yüksel. */
  invertY: boolean;
}) {
  const zoneRef = useRef<HTMLDivElement | null>(null);
  const baseRef = useRef<HTMLDivElement | null>(null);
  const knobRef = useRef<HTMLDivElement | null>(null);
  const boostRef = useRef<HTMLDivElement | null>(null);
  const noseRef = useRef<HTMLDivElement | null>(null);

  const touchId = useRef<number | null>(null);
  const origin = useRef({ x: 0, y: 0 });
  /** Çubuk boştayken oturduğu yer; dokunma bırakılınca oraya dönüyor. */
  const rest = useRef({ x: 0, y: 0 });

  const invert = useRef(invertY);
  invert.current = invertY;

  /* Burun eğimi göstergesi: pitch artık parmağı çekince sıfırlanmıyor, bu
   * yüzden burnun nerede durduğu görünür olmalı. Çubuğun içindeki ufuk
   * çizgisi ejderhanın eğimiyle birlikte kayıyor. */
  useLayoutEffect(
    () =>
      bridge.register((f: HudFrame) => {
        const el = noseRef.current;
        if (!el) return;
        const p = Math.max(-1, Math.min(1, f.pitch));
        el.style.transform = `translate(-50%, -50%) translateY(${-p * 26}px)`;
        el.style.opacity = Math.abs(p) < 0.04 ? "0.25" : "0.85";
      }),
    [bridge],
  );

  /* Boştaki konumu ölç: sol alt köşe, güvenli alan payıyla. */
  useLayoutEffect(() => {
    const place = () => {
      const el = zoneRef.current;
      const base = baseRef.current;
      if (!el || !base) return;
      const r = el.getBoundingClientRect();
      // Taban dairesi ekran dışına taşmasın: yarıçapı kadar içeride dursun.
      const halo = RADIUS + KNOB / 2 + 8;
      rest.current = {
        x: Math.min(Math.max(halo, r.width * 0.38), Math.max(halo, r.width - halo)),
        y: r.height - halo - 26,
      };
      if (touchId.current === null) {
        base.style.transform = `translate(${rest.current.x}px, ${rest.current.y}px) translate(-50%, -50%) scale(${REST_SCALE})`;
      }
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("orientationchange", place);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("orientationchange", place);
    };
  }, []);

  const write = (nx: number, ny: number) => {
    const yawIn = curve(nx);
    const pitchIn = curve(ny);
    // Ekranda sağa it = sağa dön. `yaw` +1 sola döndürdüğü için ters işaret.
    ctrl.current.yaw = -yawIn;
    // Ekranda yukarı it = yüksel (ny yukarıda negatif).
    ctrl.current.pitch = invert.current ? pitchIn : -pitchIn;
    // Roll'u da hafifçe besliyoruz: virajda gövde yatması ve hafif yan
    // kayma güçlensin. Yatmanın asıl kaynağı `flight.ts`'teki otomatik bank.
    ctrl.current.roll = yawIn * 0.35;
    const push = Math.min(1, Math.hypot(nx, ny));
    const boosting = push > BOOST_AT;
    ctrl.current.throttle = boosting ? 1 : 0;
    if (boostRef.current) boostRef.current.style.opacity = boosting ? "1" : "0";
  };

  const moveStick = (clientX: number, clientY: number) => {
    const dx = clientX - origin.current.x;
    const dy = clientY - origin.current.y;
    const len = Math.hypot(dx, dy);
    const k = len > RADIUS ? RADIUS / len : 1;
    const kx = dx * k;
    const ky = dy * k;
    write(kx / RADIUS, ky / RADIUS);
    if (knobRef.current) {
      knobRef.current.style.transform = `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;
    }
  };

  const release = () => {
    touchId.current = null;
    const c = ctrl.current;
    c.yaw = 0;
    c.pitch = 0;
    c.roll = 0;
    c.throttle = 0;
    if (knobRef.current) knobRef.current.style.transform = "translate(-50%, -50%)";
    if (boostRef.current) boostRef.current.style.opacity = "0";
    if (baseRef.current) {
      baseRef.current.style.transition = "transform .18s ease-out, opacity .18s";
      baseRef.current.style.opacity = "0.45";
      baseRef.current.style.transform = `translate(${rest.current.x}px, ${rest.current.y}px) translate(-50%, -50%) scale(${REST_SCALE})`;
    }
  };

  const grab = (e: React.PointerEvent) => {
    if (touchId.current !== null) return;
    const el = zoneRef.current;
    if (!el) return;
    e.preventDefault();
    touchId.current = e.pointerId;
    el.setPointerCapture(e.pointerId);
    const r = el.getBoundingClientRect();
    origin.current = { x: e.clientX, y: e.clientY };
    if (baseRef.current) {
      baseRef.current.style.transition = "opacity .12s";
      baseRef.current.style.opacity = "1";
      baseRef.current.style.transform = `translate(${e.clientX - r.left}px, ${e.clientY - r.top}px) translate(-50%, -50%) scale(1)`;
    }
    moveStick(e.clientX, e.clientY);
  };

  /* ---------------- yetenek butonları ---------------- */

  const buttons: {
    key: string;
    label: string;
    size: number;
    tone: string;
    press: () => void;
    cd?: (f: HudFrame) => number;
    /** Öfke gibi yalnız hazırken beliren butonlar. */
    show?: (f: HudFrame) => boolean;
  }[] = [];

  if (abilities.fireball) {
    buttons.push({
      key: "koz",
      label: "Köz",
      size: 62,
      tone: "border-accent/70 bg-accent/20 text-accent",
      press: () => {
        ctrl.current.fireball = true;
        buzz(14);
      },
      cd: (f) => f.fireballCd,
    });
  }
  if (abilities.roll) {
    buttons.push({
      key: "takla",
      label: "Takla",
      size: 62,
      tone: "border-foreground/45 bg-foreground/12 text-foreground/90",
      press: () => {
        // Çubuk hangi yana yatıksa o yana kaç. `yaw` +1 sola döndürüyor,
        // takla yönü +1 de sol; işaretler bu yüzden aynı.
        ctrl.current.dodge = ctrl.current.yaw < -0.15 ? -1 : 1;
        buzz(10);
      },
      cd: (f) => f.rollCd,
    });
  }
  if (abilities.shock) {
    buttons.push({
      key: "sok",
      label: "Şok",
      size: 58,
      tone: "border-accent/50 bg-accent/15 text-accent",
      press: () => {
        ctrl.current.shock = true;
        buzz(18);
      },
      cd: (f) => f.shockCd,
    });
  }
  if (abilities.rage) {
    buttons.push({
      key: "ofke",
      label: "Öfke",
      size: 58,
      tone: "border-ember/75 bg-ember/30 text-ember",
      press: () => {
        ctrl.current.rage = true;
        buzz(26);
      },
      show: (f) => f.rage >= 100,
    });
  }

  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      {/* --- sol yarı: uçuş çubuğu --- */}
      <div
        ref={zoneRef}
        onPointerDown={grab}
        onPointerMove={(e) => {
          if (touchId.current !== e.pointerId) return;
          e.preventDefault();
          moveStick(e.clientX, e.clientY);
        }}
        onPointerUp={(e) => touchId.current === e.pointerId && release()}
        onPointerCancel={(e) => touchId.current === e.pointerId && release()}
        // Üst şerit altyazı/HUD'a ait: çubuk alanı oradan başlamıyor.
        className="pointer-events-auto absolute bottom-0 left-0 top-24 w-1/2 touch-none"
      >
        <div
          ref={baseRef}
          className="absolute left-0 top-0 flex items-center justify-center rounded-full border border-foreground/25 bg-background/25 backdrop-blur-[2px]"
          style={{ width: RADIUS * 2 + KNOB, height: RADIUS * 2 + KNOB, opacity: 0.45 }}
        >
          {/* gaz halkası */}
          <div
            ref={boostRef}
            className="absolute inset-[-6px] rounded-full border-2 border-primary"
            style={{ opacity: 0, transition: "opacity .1s" }}
          />
          <span className="absolute left-1/2 top-1.5 -translate-x-1/2 text-[9px] text-foreground/45">
            ▲
          </span>
          <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 text-[9px] text-foreground/45">
            ▼
          </span>
          <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[9px] text-foreground/45">
            ◀
          </span>
          <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-foreground/45">
            ▶
          </span>
          {/* ufuk çizgisi — burnun tutulan eğimi */}
          <div
            ref={noseRef}
            className="pointer-events-none absolute left-1/2 top-1/2 h-[2px] w-16 rounded-full bg-accent"
            style={{ transform: "translate(-50%, -50%)", opacity: 0.25 }}
          />
          <div
            ref={knobRef}
            className="absolute left-1/2 top-1/2 rounded-full border-2 border-primary/70 bg-primary/35 shadow-[0_0_18px_rgba(0,0,0,0.35)]"
            style={{ width: KNOB, height: KNOB, transform: "translate(-50%, -50%)" }}
          />
        </div>
      </div>

      {/* --- fren: çubuk alanının DIŞINDA bir kardeş, yoksa dokunuş çubuğa
              da gidip ejderhayı savuruyor. Basılı tutmak yerine geçiş:
              sağ başparmak ALEV'de kalırken frenlenebilsin. --- */}
      <BrakeButton bridge={bridge} ctrl={ctrl} />

      {/* --- sağ alt: eylemler --- */}
      <ActionCluster bridge={bridge} buttons={buttons} onFire={ctrl} />

      {/* --- duraklat --- */}
      <button
        onPointerDown={(e) => {
          e.preventDefault();
          onPause();
        }}
        className="pointer-events-auto absolute right-3 top-3 flex h-11 w-11 touch-none items-center justify-center rounded-lg border border-foreground/25 bg-background/70 text-foreground/80 backdrop-blur active:bg-foreground/25"
        style={{ marginTop: "env(safe-area-inset-top)", marginRight: "env(safe-area-inset-right)" }}
        aria-label="Duraklat"
      >
        <span className="flex gap-[3px]">
          <span className="block h-4 w-[3px] rounded-sm bg-current" />
          <span className="block h-4 w-[3px] rounded-sm bg-current" />
        </span>
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Fren
 * ------------------------------------------------------------------ */

/**
 * "DUR" — ileri hızı keser, dönüş ve irtifa serbest kalır. Hedefin önünde
 * durup alev konisini tutabilmek için. Stamina bitince oyun döngüsü freni
 * zorla kapatıyor; buton bu yüzden kendi state'ini tutmuyor, durumu her
 * karede köprüden okuyor.
 */
function BrakeButton({ bridge, ctrl }: { bridge: HudBridge; ctrl: { current: Ctrl } }) {
  const btn = useRef<HTMLButtonElement | null>(null);
  const on = useRef(false);

  useLayoutEffect(
    () =>
      bridge.register((f: HudFrame) => {
        const el = btn.current;
        if (!el) return;
        const active = f.braking > 0;
        if (active === on.current) return;
        on.current = active;
        el.style.borderColor = active ? "var(--accent)" : "rgba(255,255,255,0.28)";
        el.style.background = active
          ? "color-mix(in oklab, var(--accent) 35%, transparent)"
          : "rgba(0,0,0,0.35)";
        el.style.color = active ? "var(--accent)" : "rgba(255,255,255,0.75)";
      }),
    [bridge],
  );

  return (
    <button
      ref={btn}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        ctrl.current.brake = !ctrl.current.brake;
        buzz(ctrl.current.brake ? 18 : 8);
      }}
      style={{
        marginLeft: "env(safe-area-inset-left)",
        borderColor: "rgba(255,255,255,0.28)",
        background: "rgba(0,0,0,0.35)",
        transition: "background .12s, border-color .12s, color .12s",
      }}
      className="pointer-events-auto absolute bottom-[10.5rem] left-4 h-14 w-14 touch-none rounded-full border-2 font-display text-[10px] font-bold uppercase tracking-wider text-foreground/75 backdrop-blur-[2px]"
    >
      Dur
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * Eylem kümesi
 * ------------------------------------------------------------------ */

/** Alev butonunun merkezi (sağ-alt köşeden içeri). */
const PIVOT = 62;
/** İkincil butonların alev butonuna uzaklığı. */
const ARC_R = 116;

/**
 * İkincil butonlar alev butonunun çevresinde bir yay üzerine diziliyor:
 * hepsi aynı başparmağın dönme yarıçapında kalsın diye. Eskiden iki dikey
 * sütun hâlindeydiler ve en üsttekine ulaşmak için eli kaydırmak gerekiyordu.
 */
function arcPos(i: number, n: number): { right: number; bottom: number } {
  const a0 = 96;
  const a1 = 172;
  const t = n === 1 ? 0.5 : i / (n - 1);
  const rad = ((a0 + (a1 - a0) * t) * Math.PI) / 180;
  // `right` sola doğru büyüdüğü için yatay bileşen ters işaretle giriyor.
  return { right: PIVOT - Math.cos(rad) * ARC_R, bottom: PIVOT + Math.sin(rad) * ARC_R };
}

function ActionCluster({
  bridge,
  buttons,
  onFire,
}: {
  bridge: HudBridge;
  buttons: {
    key: string;
    label: string;
    size: number;
    tone: string;
    press: () => void;
    cd?: (f: HudFrame) => number;
    show?: (f: HudFrame) => boolean;
  }[];
  onFire: { current: Ctrl };
}) {
  const fireRef = useRef<HTMLButtonElement | null>(null);
  const fireLabel = useRef<HTMLSpanElement | null>(null);
  const cdRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const boxRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const lastCd = useRef<Record<string, number>>({});

  useLayoutEffect(
    () =>
      bridge.register((f: HudFrame) => {
        // Alev: aşırı ısınmada sönük + etiket sebebi söylüyor.
        if (fireRef.current) {
          const locked = f.overheat > 0;
          fireRef.current.style.opacity = locked ? "0.35" : "1";
          if (fireLabel.current) {
            const want = locked ? "Isındı" : "Alev";
            if (fireLabel.current.textContent !== want) fireLabel.current.textContent = want;
          }
        }
        for (const b of buttons) {
          const box = boxRefs.current[b.key];
          if (!box) continue;
          if (b.show) {
            const on = b.show(f);
            box.style.opacity = on ? "1" : "0";
            box.style.pointerEvents = on ? "auto" : "none";
            box.style.transform = on ? "scale(1)" : "scale(0.7)";
          }
          const ring = cdRefs.current[b.key];
          if (!ring || !b.cd) continue;
          const v = Math.max(0, Math.min(1, b.cd(f)));
          // Her karede yeni gradient string'i üretmek boşuna çöp; gözle
          // görülür değişimde yazıyoruz.
          if (Math.abs(v - (lastCd.current[b.key] ?? -1)) < 0.02) continue;
          lastCd.current[b.key] = v;
          ring.style.opacity = v > 0.001 ? "1" : "0";
          ring.style.background =
            v > 0.001
              ? `conic-gradient(rgba(0,0,0,0.62) ${v * 360}deg, transparent 0deg)`
              : "transparent";
        }
      }),
    [bridge, buttons],
  );

  const stopFire = () => {
    onFire.current.fire = false;
    if (fireRef.current) fireRef.current.style.filter = "none";
  };

  return (
    <div
      className="pointer-events-none absolute bottom-0 right-0 h-64 w-64"
      style={{
        marginBottom: "env(safe-area-inset-bottom)",
        marginRight: "env(safe-area-inset-right)",
      }}
    >
      {buttons.map((b, i) => {
        const p = arcPos(i, buttons.length);
        return (
          <button
            key={b.key}
            ref={(el) => {
              boxRefs.current[b.key] = el;
            }}
            onPointerDown={(e) => {
              e.preventDefault();
              b.press();
            }}
            style={{
              right: p.right - b.size / 2,
              bottom: p.bottom - b.size / 2,
              width: b.size,
              height: b.size,
              ...(b.show ? { opacity: 0, pointerEvents: "none", transform: "scale(0.7)" } : {}),
              transition: "opacity .18s, transform .18s",
            }}
            className={`pointer-events-auto absolute touch-none overflow-hidden rounded-full border font-display text-[10px] font-bold uppercase tracking-wider backdrop-blur-[2px] active:brightness-150 ${b.tone}`}
          >
            {b.label}
            {b.cd && (
              <div
                ref={(el) => {
                  cdRefs.current[b.key] = el;
                }}
                className="pointer-events-none absolute inset-0 rounded-full"
                style={{ opacity: 0 }}
              />
            )}
          </button>
        );
      })}

      <button
        ref={fireRef}
        onPointerDown={(e) => {
          e.preventDefault();
          onFire.current.fire = true;
          buzz(8);
          if (fireRef.current) fireRef.current.style.filter = "brightness(1.5)";
        }}
        onPointerUp={stopFire}
        onPointerLeave={stopFire}
        onPointerCancel={stopFire}
        style={{ right: PIVOT - 54, bottom: PIVOT - 54, width: 108, height: 108 }}
        className="pointer-events-auto absolute touch-none rounded-full border-2 border-primary/80 bg-primary/30 font-display text-sm font-black uppercase tracking-widest text-primary backdrop-blur-[2px]"
      >
        <span ref={fireLabel}>Alev</span>
      </button>
    </div>
  );
}
