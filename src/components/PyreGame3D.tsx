import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { createAudio, type AudioEngine } from "./pyre3d/audio";
import { createGame, type GameHandle } from "./pyre3d/game";
import { createHudBridge, emptySnapshot } from "./pyre3d/hud/bridge";
import { Hud } from "./pyre3d/hud/Hud";
import { MobileControls } from "./pyre3d/hud/MobileControls";
import { loadSettings, saveSettings, type FpsTarget, type QualityLevel } from "./pyre3d/quality";
import { applyBondXp, gradeFor, loadSave, writeSave, type SaveData } from "./pyre3d/save";
import {
  Briefing,
  ChapterSelect,
  ControlsOverlay,
  MainMenu,
  PauseMenu,
  ResultScreen,
  SettingsOverlay,
} from "./pyre3d/screens/Screens";
import { chapterById, CHAPTERS } from "./pyre3d/story/chapters";
import type { ChapterDef, ChapterId } from "./pyre3d/story/types";
import { createCtrl, type HudSnapshot, type MissionResult } from "./pyre3d/types";

/** Harness ve rota bu adı kullanıyor; anlık görüntü tipiyle aynı şey. */
export type GameStats = HudSnapshot;

type Screen = "menu" | "chapters" | "briefing" | "playing" | "paused" | "result";

/**
 * React kabuğu.
 *
 * Burada yalnız ekran durum makinesi, girdi bağlama ve kayıt var. Sahne,
 * döngü ve tüm oynanış `pyre3d/game.ts` içinde; aralarındaki tek köprü
 * `ctrlRef` (React → döngü) ve HUD köprüsü (döngü → DOM).
 */
export default function PyreGame3D({ onStats }: { onStats: (s: GameStats) => void }) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const gameRef = useRef<GameHandle | null>(null);
  const audioRef = useRef<AudioEngine | null>(null);
  const ctrlRef = useRef(createCtrl());
  const settingsRef = useRef({ quality: "medium" as QualityLevel, fps: 60 as FpsTarget });
  const statsRef = useRef(onStats);
  statsRef.current = onStats;

  const [save, setSave] = useState<SaveData>(() => loadSave());
  const saveRef = useRef(save);
  saveRef.current = save;

  const [screen, setScreen] = useState<Screen>("menu");
  const [overlay, setOverlay] = useState<"none" | "controls" | "settings">("none");
  const [chapterId, setChapterId] = useState<ChapterId>("c01");
  const [runId, setRunId] = useState(0);
  const [progress, setProgress] = useState(0);
  const [loadLabel, setLoadLabel] = useState("Hazırlanıyor");
  const [ready, setReady] = useState(false);
  const [result, setResult] = useState<MissionResult | null>(null);
  const [bondGain, setBondGain] = useState({ levels: 0, earned: 0 });
  const [snapshot, setSnapshot] = useState<HudSnapshot>(emptySnapshot);
  const [quality, setQuality] = useState<QualityLevel>("medium");
  const [fpsTarget, setFpsTarget] = useState<FpsTarget>(60);

  const chapter: ChapterDef = useMemo(
    () => chapterById(chapterId, runId * 7919 + 13),
    [chapterId, runId],
  );

  const bridge = useMemo(
    () =>
      createHudBridge((s) => {
        setSnapshot(s);
        statsRef.current(s);
      }),
    [],
  );

  /* ---------------- ayarlar ---------------- */
  useEffect(() => {
    const s = loadSettings();
    settingsRef.current = s;
    setQuality(s.quality);
    setFpsTarget(s.fps);
  }, []);

  useEffect(() => {
    settingsRef.current = { quality, fps: fpsTarget };
    gameRef.current?.cmd({ t: "applyQuality" });
  }, [quality, fpsTarget]);

  /* ---------------- ses ---------------- */
  useEffect(() => {
    const a = createAudio({ muted: save.muted, volume: save.volume });
    audioRef.current = a;
    return () => a.dispose();
    // Kasıtlı olarak yalnız bir kez: ses motoru oturum boyunca yaşıyor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------- klavye ---------------- */
  useEffect(() => {
    const keys: Record<string, boolean> = {};
    const sync = () => {
      const c = ctrlRef.current;
      // W = dive (pitch down), S = ascend (pitch up)
      c.pitch = (keys["KeyS"] || keys["ArrowDown"] ? 1 : 0) - (keys["KeyW"] || keys["ArrowUp"] ? 1 : 0);
      c.throttle = keys["ShiftLeft"] || keys["ShiftRight"] ? 1 : 0;
      // A/D = yaw (pure direction), Q/E = roll (bank)
      c.roll = (keys["KeyQ"] ? -1 : 0) + (keys["KeyE"] ? 1 : 0);
      c.yaw =
        (keys["KeyD"] || keys["ArrowRight"] ? -1 : 0) + (keys["KeyA"] || keys["ArrowLeft"] ? 1 : 0);
      c.fire = !!keys["Space"];
      c.hover = !!keys["ControlLeft"] || !!keys["ControlRight"];
    };
    const kd = (e: KeyboardEvent) => {
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
        e.preventDefault();
      }
      if (e.repeat) return;
      keys[e.code] = true;
      const c = ctrlRef.current;
      if (e.code === "KeyM") c.fireball = true;
      if (e.code === "KeyR") c.dodge = c.roll >= 0 ? 1 : -1;
      if (e.code === "KeyC") c.shock = true;
      if (e.code === "KeyG") c.rage = true;
      if (e.code === "Escape") togglePause();
      if (e.code === "Enter") gameRef.current?.cmd({ t: "skipLine" });
      sync();
    };
    const ku = (e: KeyboardEvent) => {
      keys[e.code] = false;
      sync();
    };
    // Sekme değişince tuşlar basılı kalıyordu: ejderha kendi kendine uçuyordu.
    const clear = () => {
      for (const k of Object.keys(keys)) keys[k] = false;
      sync();
    };
    const ctx = (e: MouseEvent) => {
      e.preventDefault();
      ctrlRef.current.fireball = true;
    };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    window.addEventListener("blur", clear);
    window.addEventListener("contextmenu", ctx);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      window.removeEventListener("blur", clear);
      window.removeEventListener("contextmenu", ctx);
    };
  }, []);

  /* ---------------- sonuç kaydı ---------------- */
  const commitResult = useCallback((r: MissionResult, def: ChapterDef) => {
    setResult(r);
    const base = saveRef.current;
    if (r.outcome !== "won") {
      setBondGain({ levels: 0, earned: 0 });
      setScreen("result");
      return;
    }
    const earned = Math.round(def.rewardEmbers + r.score * 0.05);
    const xp = def.bondXp + r.perfectDodges * 6 + Math.round(r.destroyPct * 40);
    const gain = applyBondXp(base, xp);
    const prev = base.chapters[def.id];
    const grade = gradeFor(def.par.score, r.score, r.destroyPct);
    const next: SaveData = {
      ...base,
      embers: base.embers + earned,
      bond: gain.bond,
      bondXp: gain.bondXp,
      unlocked: Array.from(new Set([...base.unlocked, ...def.unlocks])),
      chapters: {
        ...base.chapters,
        [def.id]: {
          done: true,
          bestScore: Math.max(prev?.bestScore ?? 0, r.score),
          bestDestroyPct: Math.max(prev?.bestDestroyPct ?? 0, r.destroyPct),
          bestTime: prev?.bestTime ? Math.min(prev.bestTime, r.time) : r.time,
          grade,
        },
      },
    };
    writeSave(next);
    setSave(next);
    setBondGain({ levels: gain.levels, earned });
    setScreen("result");
  }, []);

  /* ---------------- oyun kurulumu ----------------
   * Anahtar bölüm + koşu: bölüm değişince sahne baştan kuruluyor. Renderer
   * ise ref'te yaşıyor ve YENİDEN YARATILMIYOR — bölüm başına yeni WebGL
   * bağlamı açmak tarayıcının ~16 bağlam sınırına çarpar.
   */
  const runKey = `${chapterId}:${runId}`;
  const active = screen === "briefing" || screen === "playing" || screen === "paused";

  useEffect(() => {
    if (!active) return;
    const mount = mountRef.current;
    if (!mount) return;

    let disposed = false;
    setReady(false);
    setProgress(0);

    if (!rendererRef.current) {
      rendererRef.current = new THREE.WebGLRenderer({
        // Yüksek DPI ekranlarda MSAA'nın maliyeti karşılığını vermiyor;
        // orada zaten piksel oranı kenarları yumuşatıyor.
        antialias: window.devicePixelRatio < 1.5,
        powerPreference: "high-performance",
      });
    }
    const renderer = rendererRef.current;

    void createGame({
      mount,
      renderer,
      chapter,
      save: saveRef.current,
      ctrl: ctrlRef,
      settings: settingsRef,
      bridge,
      audio: audioRef.current ?? createAudio({ muted: true, volume: 0 }),
      onProgress: (p, l) => {
        setProgress(p);
        setLoadLabel(l);
      },
      onReady: () => setReady(true),
      onResult: (r) => {
        if (!disposed) commitResult(r, chapter);
      },
    }).then((handle) => {
      if (disposed) {
        handle?.dispose();
        return;
      }
      gameRef.current = handle;
      // Brifing okunurken simülasyon beklesin.
      handle?.cmd({ t: "pause" });
    });

    return () => {
      disposed = true;
      gameRef.current?.dispose();
      gameRef.current = null;
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runKey, active]);

  /* ---------------- ekran geçişleri ---------------- */
  const start = () => {
    audioRef.current?.unlock();
    gameRef.current?.cmd({ t: "resume" });
    setScreen("playing");
  };

  function togglePause() {
    setScreen((s) => {
      if (s === "playing") {
        gameRef.current?.cmd({ t: "pause" });
        return "paused";
      }
      if (s === "paused") {
        gameRef.current?.cmd({ t: "resume" });
        return "playing";
      }
      return s;
    });
  }

  const openChapter = (id: ChapterId) => {
    setChapterId(id);
    setRunId((k) => k + 1);
    setResult(null);
    setScreen("briefing");
  };

  const retry = () => {
    setRunId((k) => k + 1);
    setResult(null);
    setScreen("briefing");
  };

  const toMenu = () => {
    gameRef.current?.dispose();
    gameRef.current = null;
    setScreen("menu");
  };

  const nextChapter = chapter.unlocks[0] ?? null;
  const continueId =
    CHAPTERS.find((c) => save.unlocked.includes(c.id) && !save.chapters[c.id]?.done)?.id ?? null;

  const setMuted = (m: boolean) => {
    audioRef.current?.setMuted(m);
    const next = { ...saveRef.current, muted: m };
    writeSave(next);
    setSave(next);
  };
  const setVolume = (v: number) => {
    audioRef.current?.setVolume(v);
    const next = { ...saveRef.current, volume: v };
    writeSave(next);
    setSave(next);
  };

  return (
    <div className="relative h-[100dvh] w-full select-none overflow-hidden bg-background">
      <div ref={mountRef} className="absolute inset-0 touch-none" />

      {(screen === "playing" || screen === "paused") && (
        <>
          <Hud
            bridge={bridge}
            s={snapshot}
            onSkip={() => gameRef.current?.cmd({ t: "skipLine" })}
          />
          <MobileControls
            ctrl={ctrlRef}
            bridge={bridge}
            onPause={togglePause}
            abilities={chapter.abilities}
          />
          <button
            onClick={togglePause}
            className="absolute left-1/2 top-2 hidden -translate-x-1/2 rounded-md border border-foreground/20 bg-background/50 px-3 py-1 text-[10px] uppercase tracking-widest text-foreground/60 backdrop-blur hover:border-primary hover:text-primary sm:block"
          >
            Esc · Duraklat
          </button>
        </>
      )}

      {screen === "menu" && (
        <MainMenu
          save={save}
          continueId={continueId}
          onContinue={() => continueId && openChapter(continueId)}
          onCampaign={() => setScreen("chapters")}
          onSandbox={() => openChapter("sandbox")}
          onControls={() => setOverlay("controls")}
          onSettings={() => setOverlay("settings")}
        />
      )}

      {screen === "chapters" && (
        <ChapterSelect save={save} onPick={openChapter} onBack={() => setScreen("menu")} />
      )}

      {screen === "briefing" && (
        <Briefing
          chapter={chapter}
          progress={progress}
          label={loadLabel}
          ready={ready}
          onStart={start}
          onBack={toMenu}
        />
      )}

      {screen === "paused" && (
        <PauseMenu
          onResume={togglePause}
          onRestart={retry}
          onControls={() => setOverlay("controls")}
          onSettings={() => setOverlay("settings")}
          onQuit={toMenu}
        />
      )}

      {screen === "result" && result && (
        <ResultScreen
          chapter={chapter}
          result={result}
          bond={save.bond}
          bondXp={save.bondXp}
          bondLevels={bondGain.levels}
          earned={bondGain.earned}
          hasNext={!!nextChapter}
          onNext={() => nextChapter && openChapter(nextChapter)}
          onRetry={retry}
          onMenu={() => setScreen("chapters")}
        />
      )}

      {overlay === "controls" && <ControlsOverlay onClose={() => setOverlay("none")} />}
      {overlay === "settings" && (
        <SettingsOverlay
          quality={quality}
          fps={fpsTarget}
          muted={save.muted}
          volume={save.volume}
          onQuality={(q) => {
            setQuality(q);
            saveSettings(q, fpsTarget);
          }}
          onFps={(f) => {
            setFpsTarget(f);
            saveSettings(quality, f);
          }}
          onMuted={setMuted}
          onVolume={setVolume}
          onClose={() => setOverlay("none")}
        />
      )}
    </div>
  );
}
