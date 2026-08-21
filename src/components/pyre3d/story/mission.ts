import type { GameEvent, Hint, ObjectiveState, Subtitle } from "../types";
import type { Ability, Beat, ChapterDef, Line, Objective, StatKey, Trigger } from "./types";

/**
 * Görev çalışma zamanı.
 *
 * Altı bölümün tamamı bu tek değerlendiriciden geçiyor: hedefler yoklanıyor,
 * beat tetikleyicileri sınanıyor, diyalog kuyruğu akıtılıyor. Yeni bir bölüm
 * yazmak yeni kod değil, yeni veri demek.
 */

export type MissionHooks = {
  spawnWave: (wave: string) => void;
  setWind: (dir: number, strength: number) => void;
  slowmo: (scale: number, dur: number) => void;
  shake: (amp: number) => void;
  unlockAbility: (a: Ability) => void;
  reveal: (prop: string) => void;
  roar: () => void;
  readStat: (key: StatKey) => number;
  /** Ejderhanın bölgeye uzaklığı; bölge yoksa Infinity. */
  zoneDist: (zone: string) => number;
  zoneRadius: (zone: string) => number;
  onEnd: (outcome: "won" | "lost") => void;
  onLine: (line: Line | null) => void;
};

export type MissionRuntime = {
  readonly def: ChapterDef;
  t: number;
  status: "playing" | "won" | "lost";
  objectives: ObjectiveState[];
  subtitle: Subtitle | null;
  hint: Hint | null;
  emit(e: GameEvent): void;
  update(dt: number): void;
  skipLine(): void;
  fail(): void;
  /** Görevi anında kazanılmış sayar (hata ayıklama / test). */
  forceWin(): void;
};

type Slot = {
  def: Objective;
  state: ObjectiveState;
  /** Olay sayacı — poll edilemeyen hedefler için. */
  count: number;
  enabled: boolean;
  /** Zayıf nokta hedefi: imha edilen modüller. */
  seen: Set<string>;
};

function need(o: Objective): number {
  switch (o.type) {
    case "destroyPercent":
      return 100;
    case "destroyKind":
      return o.count;
    case "killEnemies":
      return o.count;
    case "killAirships":
      return o.count;
    case "survive":
      return o.seconds;
    case "reachZone":
      return 1;
    case "passGates":
      return o.gates;
    case "destroyWeakPoints":
      return o.modules.length;
    case "perfectDodges":
      return o.count;
  }
}

export function createMission(def: ChapterDef, hooks: MissionHooks): MissionRuntime {
  const slots: Slot[] = def.objectives.map((o) => ({
    def: o,
    count: 0,
    enabled: !o.hidden,
    seen: new Set<string>(),
    state: {
      id: o.id,
      label: o.label,
      have: 0,
      need: need(o),
      done: false,
      optional: o.optional === true,
    },
  }));

  const fired = new Set<string>();
  const zonesEntered = new Set<string>();
  const events: GameEvent[] = [];
  const eventSeen = new Set<string>();

  const queue: Line[] = [];
  let lineT = 0;
  let pollT = 0;
  let hintT = 0;

  const rt: MissionRuntime = {
    def,
    t: 0,
    status: "playing",
    objectives: slots.filter((s) => s.enabled).map((s) => s.state),
    subtitle: null,
    hint: null,

    emit(e) {
      events.push(e);
      eventSeen.add(e.kind);
      for (const s of slots) {
        if (s.state.done || !s.enabled) continue;
        const o = s.def;
        if (o.type === "destroyKind" && e.kind === "targetDestroyed" && e.target === o.kind) {
          s.count++;
        } else if (o.type === "killEnemies" && e.kind === "enemyKilled" && e.enemy === o.enemy) {
          s.count++;
        } else if (o.type === "killAirships" && e.kind === "airshipKilled" && e.role === o.role) {
          s.count++;
        } else if (o.type === "passGates" && e.kind === "gatePassed") {
          s.count++;
        } else if (o.type === "perfectDodges" && e.kind === "perfectDodge") {
          s.count++;
        } else if (
          o.type === "destroyWeakPoints" &&
          e.kind === "weakPointDown" &&
          e.shipId === o.shipId &&
          o.modules.includes(e.module)
        ) {
          s.seen.add(e.module);
          s.count = s.seen.size;
        }
      }
      if (e.kind === "zoneEnter") zonesEntered.add(e.zone);
    },

    skipLine() {
      if (queue.length) {
        queue.shift();
        lineT = 0;
      }
    },

    fail() {
      if (rt.status !== "playing") return;
      rt.status = "lost";
      hooks.onEnd("lost");
    },

    forceWin() {
      if (rt.status !== "playing") return;
      rt.status = "won";
      hooks.onEnd("won");
    },

    update(dt) {
      rt.t += dt;

      /* ---- diyalog kuyruğu ---- */
      if (queue.length) {
        const cur = queue[0]!;
        lineT += dt;
        if (rt.subtitle?.text !== cur.text) {
          rt.subtitle = { who: cur.who, text: cur.text };
          hooks.onLine(cur);
        }
        if (lineT >= cur.dur) {
          queue.shift();
          lineT = 0;
          if (!queue.length) {
            rt.subtitle = null;
            hooks.onLine(null);
          }
        }
      } else if (rt.subtitle) {
        rt.subtitle = null;
      }

      if (hintT > 0) {
        hintT -= dt;
        if (hintT <= 0) rt.hint = null;
      }

      if (rt.status !== "playing") return;

      /* ---- hedefler ---- */
      pollT -= dt;
      const poll = pollT <= 0;
      if (poll) pollT = 0.1;

      let allDone = true;
      for (const s of slots) {
        if (!s.enabled) continue;
        const o = s.def;
        if (!s.state.done && poll) {
          switch (o.type) {
            case "destroyPercent":
              s.state.have = Math.round(hooks.readStat("destroyPct") * 100);
              s.state.need = Math.round(o.pct * 100);
              break;
            case "survive":
              s.state.have = Math.min(o.seconds, Math.round(rt.t));
              break;
            case "reachZone":
              s.state.have = hooks.zoneDist(o.zone) <= hooks.zoneRadius(o.zone) ? 1 : 0;
              break;
            default:
              s.state.have = Math.min(s.state.need, s.count);
              break;
          }
          if (s.state.have >= s.state.need) {
            s.state.done = true;
          }
        }
        if (!s.state.done && !s.state.optional) allDone = false;
      }

      /* ---- beat tetikleyicileri ---- */
      for (const b of def.beats) {
        if (fired.has(b.id)) continue;
        if (!evaluate(b.trigger)) continue;
        fired.add(b.id);
        run(b);
      }
      events.length = 0;

      if (allDone && rt.status === "playing") {
        rt.status = "won";
        hooks.onEnd("won");
      }
    },
  };

  function slotOf(id: string): Slot | undefined {
    return slots.find((s) => s.def.id === id);
  }

  function evaluate(tr: Trigger): boolean {
    switch (tr.at) {
      case "start":
        return true;
      case "time":
        return rt.t >= tr.t;
      case "objectiveDone":
        return slotOf(tr.id)?.state.done === true;
      case "objectiveProgress": {
        const s = slotOf(tr.id);
        if (!s || s.state.need <= 0) return false;
        return s.state.have / s.state.need >= tr.pct;
      }
      case "zone":
        return zonesEntered.has(tr.zone) || hooks.zoneDist(tr.zone) <= hooks.zoneRadius(tr.zone);
      case "stat": {
        const v = hooks.readStat(tr.key);
        return tr.op === "<" ? v < tr.value : v >= tr.value;
      }
      case "event":
        // Olaylar yalnız yayınlandıkları tick içinde görünür; kalıcı olması
        // gerekenler `eventSeen` üzerinden de sınanıyor.
        return events.some((e) => e.kind === tr.event) || eventSeen.has(tr.event);
      case "all":
        return tr.of.every(evaluate);
      case "any":
        return tr.of.some(evaluate);
    }
  }

  function run(b: Beat): void {
    if (b.lines) for (const l of b.lines) queue.push(l);
    if (!b.actions) return;
    for (const a of b.actions) {
      switch (a.do) {
        case "spawnWave":
          hooks.spawnWave(a.wave);
          break;
        case "enableObjective": {
          const s = slotOf(a.id);
          if (s && !s.enabled) {
            s.enabled = true;
            rt.objectives = slots.filter((x) => x.enabled).map((x) => x.state);
          }
          break;
        }
        case "setWind":
          hooks.setWind(a.dir, a.strength);
          break;
        case "hint":
          rt.hint = { text: a.text, keys: a.keys ?? [] };
          hintT = a.dur;
          break;
        case "slowmo":
          hooks.slowmo(a.scale, a.dur);
          break;
        case "shake":
          hooks.shake(a.amp);
          break;
        case "unlockAbility":
          hooks.unlockAbility(a.ability);
          break;
        case "reveal":
          hooks.reveal(a.prop);
          break;
        case "roar":
          hooks.roar();
          break;
        case "end":
          if (rt.status === "playing") {
            rt.status = a.outcome;
            hooks.onEnd(a.outcome);
          }
          break;
      }
    }
  }

  return rt;
}
