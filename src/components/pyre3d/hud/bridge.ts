import { MARKER_POOL, type HudFrame, type HudSnapshot, type Marker } from "../types";

/**
 * HUD köprüsü.
 *
 * İki kanal var ve ayrımları kasıtlı:
 *
 *  - `push()` 5 Hz'te ve yalnız gerçekten değişince React state'i günceller.
 *    Hedef listesi, altyazı, skor gibi seyrek değişen şeyler buradan gelir.
 *  - `frame` + `paint()` her karede çalışır ve React'e HİÇ uğramaz. Barlar,
 *    kombo halkası, hedef işaretçileri, vinyet doğrudan DOM'a yazılır.
 *
 * Eskiden FPS çipi bile `setFps` ile saniyede iki kez 1200 satırlık bileşeni
 * yeniden render ediyordu; can barı ise 5 Hz'te. Kare başına veriyi React'ten
 * geçirmek bu oyunda en büyük gereksiz maliyetti.
 */

export type Painter = (f: HudFrame) => void;

export type HudBridge = {
  frame: HudFrame;
  register(p: Painter): () => void;
  paint(): void;
  push(s: HudSnapshot): void;
};

function emptyMarkers(): Marker[] {
  const out: Marker[] = [];
  for (let i = 0; i < MARKER_POOL; i++) {
    out.push({
      active: false,
      kind: "optional",
      x: 0,
      y: 0,
      onScreen: false,
      angle: 0,
      dist: 0,
      hp01: 1,
    });
  }
  return out;
}

export function emptyFrame(): HudFrame {
  return {
    hp: 100,
    heat: 0,
    stamina: 100,
    rage: 0,
    overheat: 0,
    overheatMax: 3.2,
    comboT: 0,
    combo: 1,
    speed: 0,
    alt: 0,
    fps: 0,
    hitFlash: 0,
    rageActive: 0,
    marked: 0,
    emberRush: 0,
    fireballCd: 0,
    shockCd: 0,
    rollCd: 0,
    pitch: 0,
    braking: 0,
    markers: emptyMarkers(),
  };
}

export function createHudBridge(setState: (s: HudSnapshot) => void): HudBridge {
  const painters = new Set<Painter>();
  const frame = emptyFrame();
  return {
    frame,
    register(p) {
      painters.add(p);
      return () => painters.delete(p);
    },
    paint() {
      for (const p of painters) p(frame);
    },
    push(s) {
      setState(s);
    },
  };
}

export function emptySnapshot(): HudSnapshot {
  return {
    score: 0,
    embers: 0,
    destroyed: 0,
    total: 0,
    goal: 0,
    combo: 1,
    hp: 100,
    heat: 0,
    stamina: 100,
    rage: 0,
    status: "playing",
    objectives: [],
    subtitle: null,
    hint: null,
    boss: null,
    marked: false,
    chapterTitle: "",
  };
}
