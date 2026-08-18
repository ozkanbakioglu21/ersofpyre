import { useState, type ReactNode } from "react";
import hero from "@/assets/hero.jpg";
import { CHAPTERS } from "../story/chapters";
import type { ChapterDef, ChapterId } from "../story/types";
import { BOND_MAX, BOND_STEP, GRADE_LABEL, type SaveData } from "../save";
import type { MissionResult } from "../types";
import { QUALITY_PRESETS, type FpsTarget, type QualityLevel } from "../quality";
import { AshBackdrop, Eyebrow, PyreButton, PyrePanel, Stat } from "./chrome";

/* ------------------------------------------------------------------ *
 * Ana menü
 * ------------------------------------------------------------------ */

export function MainMenu({
  save,
  onCampaign,
  onSandbox,
  onControls,
  onSettings,
  onContinue,
  continueId,
  extra,
}: {
  save: SaveData;
  onCampaign: () => void;
  onSandbox: () => void;
  onControls: () => void;
  onSettings: () => void;
  onContinue: () => void;
  continueId: ChapterId | null;
  /** Rotanın eklediği bağlantılar (ör. GDD). */
  extra?: ReactNode;
}) {
  const next = continueId ? CHAPTERS.find((c) => c.id === continueId) : null;
  return (
    <div className="absolute inset-0 z-30 overflow-y-auto bg-background">
      <img src={hero} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />
      <AshBackdrop />
      <div className="relative mx-auto flex min-h-full max-w-2xl flex-col justify-center px-6 py-16">
        <Eyebrow>Kül söner, köz kalır</Eyebrow>
        <h1 className="mt-4 font-display text-6xl font-black uppercase tracking-tight text-foreground sm:text-7xl">
          Era of <span className="text-primary">Pyre</span>
        </h1>
        <p className="mt-4 max-w-lg text-sm text-foreground/70">
          Kayra ve Pyra'nın hikâyesi. Kanyondan Sovereign Cinder'a, altı bölüm.
        </p>

        <div className="mt-8 flex flex-col gap-2.5 sm:max-w-xs">
          {next && (
            <PyreButton variant="primary" full onClick={onContinue}>
              Devam Et · {next.index.toString().padStart(2, "0")} {next.title}
            </PyreButton>
          )}
          <PyreButton full onClick={onCampaign}>
            Sefer
          </PyreButton>
          <PyreButton full onClick={onSandbox}>
            Serbest Yıkım
          </PyreButton>
          <PyreButton full onClick={onControls}>
            Kontroller
          </PyreButton>
          <PyreButton full onClick={onSettings}>
            Ayarlar
          </PyreButton>
          {extra}
        </div>

        <div className="mt-10 flex flex-wrap gap-3">
          <Stat label="Bağ Seviyesi" value={`${save.bond} / ${BOND_MAX}`} accent />
          <Stat label="Kadim Köz" value={save.embers.toLocaleString("tr-TR")} />
          <Stat
            label="Tamamlanan"
            value={`${CHAPTERS.filter((c) => save.chapters[c.id]?.done).length} / ${CHAPTERS.length}`}
          />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Bölüm seçimi
 * ------------------------------------------------------------------ */

export function ChapterSelect({
  save,
  onPick,
  onBack,
}: {
  save: SaveData;
  onPick: (id: ChapterId) => void;
  onBack: () => void;
}) {
  return (
    <div className="absolute inset-0 z-30 overflow-y-auto bg-background">
      <AshBackdrop />
      <div className="relative mx-auto max-w-3xl px-6 py-12">
        <Eyebrow>Kül Perdesinin Ardında</Eyebrow>
        <h2 className="mt-3 font-display text-4xl font-black uppercase text-foreground">Sefer</h2>

        <div className="mt-8 space-y-3">
          {CHAPTERS.map((c) => {
            const rec = save.chapters[c.id];
            const unlocked = save.unlocked.includes(c.id);
            return (
              <button
                key={c.id}
                disabled={!unlocked}
                onClick={() => onPick(c.id)}
                className={`w-full rounded-xl border p-5 text-left transition-colors ${
                  unlocked
                    ? "border-border bg-card hover:border-primary/60"
                    : "cursor-not-allowed border-border/40 bg-card/40 opacity-55"
                }`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <div className="flex items-baseline gap-3">
                    <span className="font-display text-2xl font-black text-primary/70">
                      {c.index.toString().padStart(2, "0")}
                    </span>
                    <div>
                      <h3 className="font-display text-lg font-bold text-foreground">{c.title}</h3>
                      <p className="text-xs text-muted-foreground">{c.subtitle}</p>
                    </div>
                  </div>
                  {!unlocked ? (
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      Kilitli
                    </span>
                  ) : rec?.done ? (
                    <span className="rounded-full border border-primary/40 px-3 py-1 text-[10px] uppercase tracking-widest text-primary">
                      {rec.grade ? GRADE_LABEL[rec.grade] : "Bitti"}
                    </span>
                  ) : (
                    <span className="text-[10px] uppercase tracking-widest text-accent">Yeni</span>
                  )}
                </div>
                {rec?.done && (
                  <p className="mt-3 text-[10px] uppercase tracking-widest text-muted-foreground">
                    En iyi {rec.bestScore.toLocaleString("tr-TR")} · Yıkım %
                    {Math.round(rec.bestDestroyPct * 100)}
                  </p>
                )}
              </button>
            );
          })}

          <button
            onClick={() => onPick("sandbox")}
            className="w-full rounded-xl border border-accent/40 bg-card p-5 text-left transition-colors hover:border-accent"
          >
            <h3 className="font-display text-lg font-bold text-accent">Serbest Yıkım</h3>
            <p className="text-xs text-muted-foreground">
              Rastgele şehir, tüm yetenekler açık, hikâye yok
            </p>
          </button>
        </div>

        <div className="mt-8">
          <PyreButton onClick={onBack}>← Ana Menü</PyreButton>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Brifing + yükleme
 * ------------------------------------------------------------------ */

export function Briefing({
  chapter,
  progress,
  label,
  ready,
  onStart,
  onBack,
}: {
  chapter: ChapterDef;
  progress: number;
  label: string;
  ready: boolean;
  onStart: () => void;
  onBack: () => void;
}) {
  return (
    <div className="absolute inset-0 z-30 overflow-y-auto bg-background">
      <AshBackdrop />
      {/* Yatay tutulan telefonda ekran 390px: aynı boşluklarla "Başla"
          katlamanın altında kalıyordu. Kısa ekranda her şey sıkışıyor. */}
      <div className="relative mx-auto flex min-h-full max-w-2xl flex-col justify-center px-6 py-12 short:py-4">
        <PyrePanel className="short:p-4">
          <Eyebrow>
            Bölüm {chapter.index.toString().padStart(2, "0")} · {chapter.subtitle}
          </Eyebrow>
          <h2 className="mt-3 font-display text-4xl font-black uppercase text-foreground short:mt-1 short:text-2xl">
            {chapter.title}
          </h2>
          <p className="mt-5 text-sm leading-relaxed text-muted-foreground short:mt-2 short:text-xs">
            {chapter.briefing.lore}
          </p>

          <div className="mt-6 grid gap-5 sm:grid-cols-2 short:mt-3 short:gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-primary">Hedefler</p>
              <ul className="mt-2 space-y-1.5">
                {chapter.briefing.objectives.map((t) => (
                  <li key={t} className="flex gap-2 text-sm text-foreground/85 short:text-xs">
                    <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-accent">Öğrenilecek</p>
              <ul className="mt-2 space-y-1.5">
                {chapter.briefing.tips.map((t) => (
                  <li key={t} className="flex gap-2 text-sm text-muted-foreground short:text-xs">
                    <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-8 short:mt-4">
            <div className="h-1 w-full overflow-hidden rounded-full bg-foreground/10">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-200 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-2 text-[10px] uppercase tracking-widest text-muted-foreground">
              {ready ? "Kül vadisi hazır" : `${label} · %${progress}`}
            </p>
          </div>

          <div className="mt-6 flex gap-2">
            {/* Bu buton aynı zamanda AudioContext'i açan ilk kullanıcı jesti. */}
            <PyreButton variant="primary" onClick={onStart} disabled={!ready}>
              {ready ? "Başla" : "Yükleniyor…"}
            </PyreButton>
            <PyreButton onClick={onBack}>Geri</PyreButton>
          </div>
        </PyrePanel>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Duraklatma
 * ------------------------------------------------------------------ */

export function PauseMenu({
  onResume,
  onRestart,
  onControls,
  onSettings,
  onQuit,
}: {
  onResume: () => void;
  onRestart: () => void;
  onControls: () => void;
  onSettings: () => void;
  onQuit: () => void;
}) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/85 backdrop-blur-sm">
      <PyrePanel className="w-[min(22rem,88vw)]">
        <Eyebrow>Duraklatıldı</Eyebrow>
        <div className="mt-5 flex flex-col gap-2.5">
          <PyreButton variant="primary" full onClick={onResume}>
            Devam
          </PyreButton>
          <PyreButton full onClick={onRestart}>
            Yeniden Başlat
          </PyreButton>
          <PyreButton full onClick={onControls}>
            Kontroller
          </PyreButton>
          <PyreButton full onClick={onSettings}>
            Ayarlar
          </PyreButton>
          <PyreButton variant="danger" full onClick={onQuit}>
            Ana Menü
          </PyreButton>
        </div>
      </PyrePanel>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Sonuç
 * ------------------------------------------------------------------ */

export function ResultScreen({
  chapter,
  result,
  bond,
  bondXp,
  bondLevels,
  earned,
  onNext,
  onRetry,
  onMenu,
  hasNext,
}: {
  chapter: ChapterDef;
  result: MissionResult;
  bond: number;
  bondXp: number;
  bondLevels: number;
  earned: number;
  onNext: () => void;
  onRetry: () => void;
  onMenu: () => void;
  hasNext: boolean;
}) {
  const won = result.outcome === "won";
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center overflow-y-auto bg-background/92 px-6 py-10 backdrop-blur-sm">
      <PyrePanel className="w-[min(34rem,92vw)]">
        <Eyebrow>{chapter.title}</Eyebrow>
        <h2
          className={`mt-3 font-display text-4xl font-black uppercase ${won ? "text-primary" : "text-destructive"}`}
        >
          {won ? "Bölge küle döndü" : "Pyra düştü"}
        </h2>

        <div className="mt-6 space-y-1.5">
          {result.objectives.map((o) => (
            <div key={o.id} className="flex items-baseline justify-between gap-3 text-sm">
              <span className={o.done ? "text-foreground" : "text-muted-foreground"}>
                {o.done ? "✓" : "✗"} {o.label}
              </span>
              <span className="font-display text-xs text-foreground/50">
                {o.have}/{o.need}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat label="Skor" value={result.score.toLocaleString("tr-TR")} accent />
          <Stat label="Yıkım" value={`%${Math.round(result.destroyPct * 100)}`} />
          <Stat label="En yüksek kombo" value={`x${result.bestCombo}`} />
          <Stat label="Kusursuz kaçınma" value={String(result.perfectDodges)} />
          <Stat
            label="Süre"
            value={`${Math.floor(result.time / 60)}:${String(Math.floor(result.time % 60)).padStart(2, "0")}`}
          />
          <Stat label="Kadim Köz" value={`+${earned.toLocaleString("tr-TR")}`} accent />
        </div>

        <div className="mt-6">
          <div className="flex items-baseline justify-between">
            <p className="text-[10px] uppercase tracking-widest text-primary">
              Pyra ile Bağ · Seviye {bond}
            </p>
            {bondLevels > 0 && (
              <p className="font-display text-[10px] uppercase tracking-widest text-accent">
                +{bondLevels} seviye
              </p>
            )}
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-foreground/10">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-700"
              style={{ width: `${Math.min(100, (bondXp / BOND_STEP) * 100)}%` }}
            />
          </div>
        </div>

        <div className="mt-7 flex flex-wrap gap-2">
          {won && hasNext && (
            <PyreButton variant="primary" onClick={onNext}>
              Sonraki Bölüm →
            </PyreButton>
          )}
          <PyreButton onClick={onRetry}>Tekrar</PyreButton>
          <PyreButton onClick={onMenu}>Sefer</PyreButton>
        </div>
      </PyrePanel>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Kontroller
 * ------------------------------------------------------------------ */

/** Gerçek eşlemeler — `PyreGame3D`'deki klavye bağlamasıyla birebir. */
const KEYS: [string, string][] = [
  ["A / D", "Sola / sağa dön"],
  ["W / S", "Alçal / yüksel"],
  ["Q / E", "Kanat yatır (bank)"],
  ["Shift", "Hızlan"],
  ["Ctrl", "Askıda dur (stamina)"],
  ["Boşluk", "Konik alev (basılı tut)"],
  ["M / Sağ tık", "Köz Mermisi (alev topu)"],
  ["R", "Takla — 0.4 sn dokunulmazlık"],
  ["C", "Kanat şoku"],
  ["G", "Ejderha Öfkesi (bar doluyken)"],
  ["Esc", "Duraklat"],
];

const TOUCH: [string, string][] = [
  ["Sol yarı", "Nereye basarsan çubuk orada doğar"],
  ["Çubuk ← →", "Sola / sağa dön"],
  ["Çubuk ↑ ↓", "Yüksel / alçal"],
  ["Çubuğu sonuna it", "Hızlan"],
  ["Alev", "Konik alev (basılı tut)"],
  ["Köz", "Alev topu"],
  ["Takla", "Çubuk hangi yandaysa o yana kaçınma"],
  ["Şok", "Kanat şoku"],
  ["Öfke", "Bar dolunca belirir"],
];

export function ControlsOverlay({
  onClose,
  touch = false,
}: {
  onClose: () => void;
  /** Dokunmatikte dokunma şeması önce gelsin; klavye tablosu ikinci plana. */
  touch?: boolean;
}) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center overflow-y-auto bg-background/92 px-6 py-10 backdrop-blur-sm">
      <PyrePanel className="w-[min(38rem,92vw)]">
        <Eyebrow>Kontroller</Eyebrow>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Ejderha kendiliğinden ileri uçar — yalnız yönünü veriyorsun.
        </p>
        <div
          className={`mt-6 grid gap-8 sm:grid-cols-2 ${touch ? "[&>*:first-child]:order-2" : ""}`}
        >
          <div>
            <p className="text-[10px] uppercase tracking-widest text-primary">Klavye</p>
            <dl className="mt-3 space-y-2">
              {KEYS.map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-3">
                  <dt>
                    <kbd className="rounded border border-foreground/25 bg-foreground/5 px-1.5 py-0.5 font-mono text-[11px] text-foreground/85">
                      {k}
                    </kbd>
                  </dt>
                  <dd className="text-right text-xs text-muted-foreground">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-accent">Dokunmatik</p>
            <dl className="mt-3 space-y-2">
              {TOUCH.map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-3">
                  <dt className="text-xs font-semibold text-foreground/85">{k}</dt>
                  <dd className="text-right text-xs text-muted-foreground">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
        <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
          <strong className="text-foreground/80">Kusursuz kaçınma:</strong> mermi tam üstüne
          gelirken takla atarsan stamina geri gelir ve kısa bir "Ember Rush" hızı kazanırsın.
          <br />
          <strong className="text-foreground/80">Caddeler yangını durdurur:</strong> alevi bir
          sonraki bloğa taşımak için Köz Mermisi kullan.
        </p>
        {/* Liste uzun ve kısa ekranda kaydırılıyor: kapatma her zaman elde. */}
        <div className="sticky bottom-0 mt-6 -mx-6 -mb-6 rounded-b-xl bg-card/95 px-6 py-4 backdrop-blur">
          <PyreButton variant="primary" onClick={onClose}>
            Kapat
          </PyreButton>
        </div>
      </PyrePanel>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Ayarlar
 * ------------------------------------------------------------------ */

export function SettingsOverlay({
  quality,
  fps,
  muted,
  volume,
  invertY,
  onQuality,
  onFps,
  onMuted,
  onVolume,
  onInvertY,
  onClose,
}: {
  quality: QualityLevel;
  fps: FpsTarget;
  muted: boolean;
  volume: number;
  invertY: boolean;
  onQuality: (q: QualityLevel) => void;
  onFps: (f: FpsTarget) => void;
  onMuted: (m: boolean) => void;
  onVolume: (v: number) => void;
  onInvertY: (v: boolean) => void;
  onClose: () => void;
}) {
  const [vol, setVol] = useState(volume);
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center overflow-y-auto bg-background/92 px-6 py-8 backdrop-blur-sm">
      <PyrePanel className="w-[min(26rem,92vw)]">
        <Eyebrow>Ayarlar</Eyebrow>

        <p className="mt-6 text-[10px] uppercase tracking-widest text-muted-foreground">
          Grafik Kalitesi
        </p>
        <div className="mt-2 flex gap-1.5">
          {(["low", "medium", "high"] as QualityLevel[]).map((q) => (
            <button
              key={q}
              onClick={() => onQuality(q)}
              className={`flex-1 rounded border px-2 py-2 text-[10px] uppercase tracking-widest transition-colors ${
                quality === q
                  ? "border-primary bg-primary/25 text-primary"
                  : "border-foreground/20 text-foreground/70 hover:border-foreground/40"
              }`}
            >
              {QUALITY_PRESETS[q].label}
            </button>
          ))}
        </div>

        <p className="mt-5 text-[10px] uppercase tracking-widest text-muted-foreground">
          FPS Hedefi
        </p>
        <div className="mt-2 flex gap-1.5">
          {([30, 60, 0] as FpsTarget[]).map((f) => (
            <button
              key={f}
              onClick={() => onFps(f)}
              className={`flex-1 rounded border px-2 py-2 text-[10px] uppercase tracking-widest transition-colors ${
                fps === f
                  ? "border-accent bg-accent/25 text-accent"
                  : "border-foreground/20 text-foreground/70 hover:border-foreground/40"
              }`}
            >
              {f === 0 ? "Max" : f}
            </button>
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Ses</p>
          <button
            onClick={() => onMuted(!muted)}
            className={`rounded border px-3 py-1 text-[10px] uppercase tracking-widest ${
              muted ? "border-destructive/50 text-destructive" : "border-primary/50 text-primary"
            }`}
          >
            {muted ? "Sessiz" : "Açık"}
          </button>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(vol * 100)}
          onChange={(e) => {
            const v = Number(e.target.value) / 100;
            setVol(v);
            onVolume(v);
          }}
          className="mt-3 w-full accent-[var(--primary)]"
        />

        <div className="mt-5 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Çubuk dikey ekseni
            </p>
            <p className="mt-0.5 text-[10px] text-foreground/50">
              {invertY ? "Aşağı çek = yüksel" : "Yukarı it = yüksel"}
            </p>
          </div>
          <button
            onClick={() => onInvertY(!invertY)}
            className={`rounded border px-3 py-1 text-[10px] uppercase tracking-widest ${
              invertY ? "border-accent/60 text-accent" : "border-foreground/25 text-foreground/70"
            }`}
          >
            {invertY ? "Ters" : "Normal"}
          </button>
        </div>

        <p className="mt-4 text-[10px] leading-snug text-muted-foreground">
          Kare hızı hedefin altına düşerse önce gölgeler, sonra çözünürlük otomatik kısılır.
        </p>

        <div className="mt-6">
          <PyreButton variant="primary" onClick={onClose}>
            Kapat
          </PyreButton>
        </div>
      </PyrePanel>
    </div>
  );
}
