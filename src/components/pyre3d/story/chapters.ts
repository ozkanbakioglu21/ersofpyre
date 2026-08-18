import type { ChapterDef, ChapterId } from "./types";

/**
 * Kampanya: "Kül Perdesinin Ardında".
 *
 * GDD'nin 06. bölümündeki beat sheet birebir bölümlere açıldı. Her bölüm
 * bir mekaniği baskı altında öğretiyor; tutorial paneli yok, ipuçları
 * oynanışın içinden geliyor.
 */

const ALL_OFF = { flame: false, fireball: false, roll: false, shock: false, rage: false };

/* ------------------------------------------------------------------ *
 * 01 — Uyanış
 * ------------------------------------------------------------------ */
const c01: ChapterDef = {
  id: "c01",
  index: 1,
  title: "Uyanış",
  subtitle: "Kül kanyonunun dibinde",
  briefing: {
    lore:
      "Ashkeep Loncası yuvayı üç gün önce deldi. Kül hâlâ iniyor. Gözlerini " +
      "Pyra'nın sırtında açıyorsun; kanatları henüz senin ağırlığını taşımayı " +
      "yeni öğreniyor. Kanyonun ağzına kadar uçmalısınız — yukarısı ne getirirse.",
    objectives: ["Kaya geçitlerinden uç", "Kanyonun ağzına ulaş"],
    tips: [
      "Pyra kendiliğinden ileri uçar — sen yönünü ver",
      "A/D veya çubuğu yana it: dön",
      "Burun uçak gibi: çubuğu aşağı çek burun kalkar, eğim kalıcıdır",
    ],
  },
  world: {
    radius: 700,
    // Kanyon: koridorun dışında arazi duvar gibi yükseliyor.
    terrain: [{ t: "ridge", axis: "z", center: 0, halfWidth: 95, feather: 110, height: 170 }],
    scatter: {},
    props: [
      { t: "gate", x: 10, y: 70, z: -130, radius: 26 },
      { t: "gate", x: -34, y: 62, z: 10, radius: 24 },
      { t: "gate", x: 40, y: 82, z: 150, radius: 22 },
      { t: "gate", x: -20, y: 58, z: 290, radius: 22 },
      { t: "gate", x: 26, y: 74, z: 430, radius: 24 },
      { t: "gate", x: 0, y: 66, z: 560, radius: 28 },
    ],
    zones: [{ id: "cikis", x: 0, z: 660, r: 90, label: "Kanyon ağzı" }],
    wind: { dir: 0.4, strength: 0.2 },
    start: { x: 0, y: 72, z: -280 },
    fogScale: 1.25,
  },
  objectives: [
    { id: "gecit", type: "passGates", gates: 6, label: "Kaya geçitlerinden uç" },
    { id: "cikis", type: "reachZone", zone: "cikis", label: "Kanyonun ağzına ulaş" },
  ],
  fail: [{ type: "death" }],
  abilities: { ...ALL_OFF },
  par: { time: 150, score: 400 },
  rewardEmbers: 250,
  bondXp: 60,
  unlocks: ["c02"],
  beats: [
    {
      id: "acilis",
      trigger: { at: "start" },
      lines: [
        { who: "sistem", text: "Kül üç gündür iniyor.", dur: 3.2 },
        { who: "Kayra", text: "Pyra… kalkabilir misin?", dur: 3.2 },
        { who: "Pyra", text: "(Kanatlar açılır. Kül dağılır.)", dur: 3 },
      ],
      actions: [{ do: "hint", text: "Yönünü ver", keys: ["A", "D"], dur: 6 }],
    },
    {
      id: "irtifa",
      trigger: { at: "time", t: 9 },
      actions: [{ do: "hint", text: "Burnu kaldır — eğim kalıcı", keys: ["S"], dur: 7 }],
    },
    {
      id: "gecit1",
      trigger: { at: "event", event: "gatePassed" },
      lines: [{ who: "Kayra", text: "Dar. Ama geçebiliyoruz.", dur: 2.8 }],
      actions: [{ do: "hint", text: "Hızlan", keys: ["Shift"], dur: 6 }],
    },
    {
      id: "yarisi",
      trigger: { at: "objectiveProgress", id: "gecit", pct: 0.5 },
      lines: [
        { who: "Pyra", text: "(Boğazdan gelen rüzgâr sıcak. Yukarıda bir şey yanıyor.)", dur: 3.6 },
      ],
    },
    {
      id: "agiz",
      trigger: { at: "objectiveDone", id: "gecit" },
      lines: [{ who: "Kayra", text: "Kanyonun ağzı ileride. Yukarı çıkıyoruz.", dur: 3.2 }],
    },
  ],
};

/* ------------------------------------------------------------------ *
 * 02 — İlk Alev
 * ------------------------------------------------------------------ */
const c02: ChapterDef = {
  id: "c02",
  index: 2,
  title: "İlk Alev",
  subtitle: "Madenci köprüsü",
  briefing: {
    lore:
      "Kanyonun ağzını Ashkeep'in ahşap madenci köprüsü kapatıyor. Altından " +
      "geçit yok. Pyra'nın boğazındaki köz ilk kez gerçek bir işe yarayacak — " +
      "ama alev bedava değil: Heat barı dolarsa boğaz kilitlenir.",
    objectives: ["Madenci köprüsünü yak", "Kampın yarısını küle çevir"],
    tips: [
      "Boşluk basılı = konik alev",
      "Fren (F / DUR) ile hedefin önünde dur ve yak",
      "Heat dolarsa alev kilitlenir, ateşi kesince soğur",
    ],
  },
  world: {
    radius: 620,
    scatter: { house: 26, workshop: 8, warehouse: 5 },
    props: [{ t: "structure", kind: "bridge", x: 0, z: 120, scale: 1.35, id: "kopru" }],
    wind: { dir: 1.1, strength: 0.45 },
    start: { x: 0, y: 70, z: -140 },
  },
  objectives: [
    { id: "kopru", type: "destroyKind", kind: "bridge", count: 1, label: "Madenci köprüsünü yak" },
    { id: "kamp", type: "destroyPercent", pct: 0.5, label: "Kampı küle çevir" },
  ],
  fail: [{ type: "death" }],
  abilities: { ...ALL_OFF, flame: true },
  par: { time: 210, score: 2600 },
  rewardEmbers: 450,
  bondXp: 80,
  unlocks: ["c03"],
  beats: [
    {
      id: "acilis",
      trigger: { at: "start" },
      lines: [
        { who: "Kayra", text: "Köprü yolu kapatıyor. Yakacağız.", dur: 3.2 },
        { who: "Pyra", text: "(Boğazında bir şey kızarıyor.)", dur: 2.8 },
      ],
      actions: [
        { do: "unlockAbility", ability: "flame" },
        { do: "hint", text: "Alev püskürt", keys: ["Boşluk"], dur: 8 },
      ],
    },
    {
      id: "ilkAlev",
      trigger: { at: "event", event: "firstFlame" },
      lines: [{ who: "Kayra", text: "İşte bu. Ahşap hemen tutuşuyor.", dur: 3 }],
      actions: [{ do: "hint", text: "Durup yak", keys: ["F"], dur: 8 }],
    },
    {
      id: "isinma",
      trigger: { at: "stat", key: "heat", op: ">=", value: 70 },
      actions: [{ do: "hint", text: "Boğaz ısınıyor — ateşi kes", keys: [], dur: 4 }],
    },
    {
      id: "kilit",
      trigger: { at: "event", event: "overheat" },
      lines: [
        { who: "Pyra", text: "(Boğazından buhar kaçıyor. Birkaç saniye alev yok.)", dur: 3.4 },
      ],
    },
    {
      id: "kopruDustu",
      trigger: { at: "objectiveDone", id: "kopru" },
      lines: [
        { who: "Kayra", text: "Köprü gitti. Rüzgâr yangını kampa taşıyor.", dur: 3.6 },
        { who: "Pyra", text: "(Alev caddeyi atlıyor.)", dur: 2.6 },
      ],
      actions: [{ do: "setWind", dir: 1.1, strength: 0.75 }],
    },
  ],
};

/* ------------------------------------------------------------------ *
 * 03 — Kül Perdesi
 * ------------------------------------------------------------------ */
const c03: ChapterDef = {
  id: "c03",
  index: 3,
  title: "Kül Perdesi",
  subtitle: "Ashkeep keşif filosu",
  briefing: {
    lore:
      "Kül perdesi yarılıyor. Üstte altı gemilik bir Ashkeep keşif kolu var ve " +
      "Wasp avcıları çoktan harpunlarını hazırladı. Harpun yerse Pyra ağırlaşır. " +
      "Kurtuluş takla — ve tam zamanında atılan takla ödüllendirilir.",
    objectives: ["Wasp filosunu dağıt", "3 kez kusursuz kaçın"],
    tips: [
      "R ile takla at",
      "Merminin tam üstünde takla = kusursuz kaçınma",
      "Harpun bağı takla ile kopar",
    ],
  },
  world: {
    radius: 700,
    scatter: { house: 14, tower: 6, workshop: 6 },
    airships: [
      { x: 180, y: 120, z: 60, role: "scout" },
      { x: -220, y: 140, z: -80, role: "scout" },
    ],
    waves: {
      ilk: { enemy: "wasp", count: 3, radius: 240, altitude: [90, 150] },
      ikinci: { enemy: "wasp", count: 5, radius: 300, altitude: [80, 170] },
    },
    wind: { dir: 2.2, strength: 0.4 },
    start: { x: 0, y: 110, z: -60 },
  },
  objectives: [
    { id: "wasp", type: "killEnemies", enemy: "wasp", count: 8, label: "Wasp avcılarını düşür" },
    { id: "kacinma", type: "perfectDodges", count: 3, label: "Kusursuz kaçınma" },
  ],
  fail: [{ type: "death" }],
  abilities: { ...ALL_OFF, flame: true, roll: true, shock: true },
  par: { time: 240, score: 5200 },
  rewardEmbers: 700,
  bondXp: 110,
  unlocks: ["c04"],
  beats: [
    {
      id: "acilis",
      trigger: { at: "start" },
      lines: [
        { who: "Ashkeep", text: "Keşif kolu — yerde bir ejderha var. Harpunlar hazır.", dur: 3.6 },
        { who: "Kayra", text: "Bizi gördüler. Pyra, kükre.", dur: 2.8 },
      ],
      actions: [
        { do: "roar" },
        { do: "unlockAbility", ability: "roll" },
        { do: "spawnWave", wave: "ilk" },
        { do: "hint", text: "Takla at", keys: ["R"], dur: 8 },
      ],
    },
    {
      id: "harpunUyari",
      trigger: { at: "time", t: 14 },
      actions: [{ do: "hint", text: "Harpun yersen takla ile kurtul", keys: ["R"], dur: 6 }],
    },
    {
      id: "ilkKusursuz",
      trigger: { at: "event", event: "perfectDodge" },
      lines: [{ who: "Kayra", text: "Tam zamanında! Bu kanatlara güç verdi.", dur: 3 }],
      actions: [{ do: "slowmo", scale: 0.35, dur: 0.35 }],
    },
    {
      id: "ikinciDalga",
      trigger: { at: "objectiveProgress", id: "wasp", pct: 0.45 },
      lines: [{ who: "Ashkeep", text: "İkinci filo — sıkıştırın!", dur: 3 }],
      actions: [
        { do: "spawnWave", wave: "ikinci" },
        { do: "shake", amp: 0.6 },
      ],
    },
    {
      id: "bitis",
      trigger: { at: "objectiveDone", id: "wasp" },
      lines: [{ who: "Kayra", text: "Keşif kolu dağıldı. Ama bunu haber verdiler.", dur: 3.4 }],
    },
  ],
};

/* ------------------------------------------------------------------ *
 * 04 — Kül Vadisi
 * ------------------------------------------------------------------ */
const c04: ChapterDef = {
  id: "c04",
  index: 4,
  title: "Kül Vadisi",
  subtitle: "Kül Şehri'nin köz madenleri",
  briefing: {
    lore:
      "Ashkeep'in taşra şehri: halka halka kurulmuş, ortasında Kazan Meydanı, " +
      "kenarında köz madeni asansörleri. Damarları kazıyan bu asansörler. " +
      "Şehrin %60'ı küle dönerse lonca burayı bırakır — %100 fazladan köz getirir.",
    objectives: ["Şehrin %60'ını yık", "3 köz madeni asansörünü imha et"],
    tips: [
      "M ile Köz Mermisi at — yangını caddenin öbür tarafına sıçratır",
      "Caddeler yangın duvarıdır",
      "Rüzgâr cepheyi taşır",
    ],
  },
  world: {
    radius: 760,
    city: {
      seed: 20260817,
      cx: 0,
      cz: 0,
      radius: 430,
      density: "medium",
      wall: true,
      masts: 4,
      elevators: 4,
    },
    airships: [
      { x: 320, y: 130, z: 220, role: "scout" },
      { x: -300, y: 120, z: -260, role: "scout" },
      { x: 60, y: 150, z: -420, role: "scout" },
    ],
    waves: { tahliye: { enemy: "wasp", count: 4, radius: 300, altitude: [90, 160] } },
    wind: { dir: 0.9, strength: 0.55 },
    start: { x: 0, y: 120, z: -520 },
  },
  objectives: [
    { id: "yikim", type: "destroyPercent", pct: 0.6, label: "Şehri küle çevir" },
    {
      id: "asansor",
      type: "destroyKind",
      kind: "elevator",
      count: 3,
      label: "Köz madeni asansörleri",
    },
  ],
  fail: [{ type: "death" }],
  abilities: { flame: true, fireball: true, roll: true, shock: true, rage: true },
  par: { time: 420, score: 26000 },
  rewardEmbers: 1200,
  bondXp: 150,
  unlocks: ["c05"],
  beats: [
    {
      id: "acilis",
      trigger: { at: "start" },
      lines: [
        { who: "Kayra", text: "Kül Şehri. Damarları buradan kazıyorlar.", dur: 3.6 },
        { who: "Pyra", text: "(Meydanın ortasındaki ızgaradan sıcak geliyor.)", dur: 3.2 },
      ],
      actions: [
        { do: "unlockAbility", ability: "fireball" },
        { do: "hint", text: "Köz Mermisi", keys: ["M"], dur: 9 },
      ],
    },
    {
      id: "caddeIpucu",
      trigger: { at: "time", t: 22 },
      actions: [
        {
          do: "hint",
          text: "Caddeler yangını durdurur — Köz Mermisi ile atlat",
          keys: ["M"],
          dur: 7,
        },
      ],
    },
    {
      id: "ruzgar",
      trigger: { at: "objectiveProgress", id: "yikim", pct: 0.3 },
      lines: [{ who: "Kayra", text: "Rüzgâr döndü. Yangın kendi kendine yürüyor.", dur: 3.4 }],
      actions: [{ do: "setWind", dir: 2.4, strength: 0.85 }],
    },
    {
      id: "tahliye",
      trigger: { at: "objectiveProgress", id: "yikim", pct: 0.55 },
      lines: [{ who: "Ashkeep", text: "Tahliye! Bütün mürettebat direklere!", dur: 3.2 }],
      actions: [
        { do: "spawnWave", wave: "tahliye" },
        { do: "unlockAbility", ability: "rage" },
      ],
    },
    {
      id: "asansorler",
      trigger: { at: "objectiveDone", id: "asansor" },
      lines: [{ who: "Kayra", text: "Asansörler gitti. Bu damar bir daha açılmaz.", dur: 3.4 }],
    },
    {
      id: "vorren",
      trigger: { at: "objectiveDone", id: "yikim" },
      lines: [
        { who: "Vorren", text: "Bir şehir. Yalnızca bir şehir. Bize on tane daha var.", dur: 4.2 },
      ],
    },
  ],
};

/* ------------------------------------------------------------------ *
 * 05 — Bulwark
 * ------------------------------------------------------------------ */
const c05: ChapterDef = {
  id: "c05",
  index: 5,
  title: "Bulwark",
  subtitle: "Toplu firkateyn",
  briefing: {
    lore:
      "Lonca cevabını gönderdi: 'Bulwark' sınıfı bir toplu firkateyn. Gövdesi " +
      "konik aleve kapalı — kırılacak yeri modülleri. Balon hücreleri, motor " +
      "podları, yan batarya ve köprü. Hangi sırayla imha ettiğin gemiyi değiştirir.",
    objectives: ["Bulwark'ın modüllerini imha et", "Firkateyni düşür"],
    tips: [
      "Köz Mermisi modüllere 2.5 kat hasar verir",
      "Bataryayı alırsan top ateşi kesilir",
      "Balon hücreleri giderse gemi alçalır",
    ],
  },
  world: {
    radius: 760,
    scatter: { tower: 8, factory: 6, house: 10 },
    airships: [
      { x: 0, y: 150, z: 260, role: "frigate", id: "bulwark", weakPoints: true },
      { x: 220, y: 130, z: 320, role: "scout" },
      { x: -240, y: 140, z: 300, role: "scout" },
    ],
    waves: { eskort: { enemy: "wasp", count: 4, radius: 260, altitude: [110, 180] } },
    wind: { dir: 1.8, strength: 0.35 },
    start: { x: 0, y: 140, z: -80 },
  },
  objectives: [
    {
      id: "modul",
      type: "destroyWeakPoints",
      shipId: "bulwark",
      modules: ["balonOn", "balonArka", "motorSol", "motorSag", "batarya", "kopru"],
      label: "Bulwark modülleri",
    },
    { id: "gemi", type: "killAirships", role: "frigate", count: 1, label: "Firkateyni düşür" },
  ],
  fail: [{ type: "death" }],
  abilities: { flame: true, fireball: true, roll: true, shock: true, rage: true },
  par: { time: 300, score: 14000 },
  rewardEmbers: 1800,
  bondXp: 180,
  unlocks: ["c06"],
  beats: [
    {
      id: "acilis",
      trigger: { at: "start" },
      lines: [
        { who: "Ashkeep", text: "Bulwark angaje oluyor. Yan bataryalar açık.", dur: 3.4 },
        { who: "Kayra", text: "Gövdesi kalın. Modüllerini kıracağız — Köz Mermisi.", dur: 3.8 },
      ],
      actions: [
        { do: "hint", text: "Modülleri hedefle", keys: ["M"], dur: 9 },
        { do: "spawnWave", wave: "eskort" },
      ],
    },
    {
      id: "ilkModul",
      trigger: { at: "event", event: "weakPointDown" },
      lines: [{ who: "Pyra", text: "(Bir modül koptu. Gemi sarsılıyor.)", dur: 2.8 }],
      actions: [{ do: "shake", amp: 0.8 }],
    },
    {
      id: "yariCan",
      trigger: { at: "objectiveProgress", id: "modul", pct: 0.5 },
      lines: [{ who: "Ashkeep", text: "Balon basıncı düşüyor! İrtifa kaybediyoruz!", dur: 3.4 }],
      actions: [{ do: "spawnWave", wave: "eskort" }],
    },
    {
      id: "dusus",
      trigger: { at: "objectiveDone", id: "modul" },
      lines: [{ who: "Kayra", text: "Bitir şunu, Pyra.", dur: 2.6 }],
      actions: [{ do: "shake", amp: 1.2 }],
    },
  ],
};

/* ------------------------------------------------------------------ *
 * 06 — Sovereign Cinder
 * ------------------------------------------------------------------ */
const c06: ChapterDef = {
  id: "c06",
  index: 6,
  title: "Sovereign Cinder",
  subtitle: "Kül perdesinin ardında",
  briefing: {
    lore:
      "Vorren'in sesi tüm filoya yayılıyor. Kül perdesi ikiye ayrılıyor ve " +
      "arkasından bir şehir büyüklüğünde bir şey çıkıyor. Bugün onunla " +
      "savaşmıyorsun. Bugün Pyra'yı hayatta tutuyorsun ve kaçıyorsun.",
    objectives: ["90 saniye hayatta kal", "Kül Vadisi'ne kaç"],
    tips: ["Bu savaş kazanılmaz — hareket et", "Öfke barı doluysa kullan", "Kaçış noktası kuzeyde"],
  },
  world: {
    radius: 820,
    scatter: { tower: 14, factory: 8 },
    airships: [
      { x: 260, y: 160, z: 180, role: "scout" },
      { x: -280, y: 150, z: 120, role: "scout" },
      { x: 40, y: 170, z: 330, role: "scout" },
      { x: -120, y: 140, z: -260, role: "scout" },
    ],
    props: [{ t: "flagship", x: 0, y: 380, z: 900, hidden: true }],
    waves: {
      baski: { enemy: "wasp", count: 5, radius: 280, altitude: [110, 190] },
      son: { enemy: "wasp", count: 6, radius: 320, altitude: [100, 200] },
    },
    zones: [{ id: "kacis", x: 0, z: -720, r: 110, label: "Kül Vadisi" }],
    wind: { dir: 3.4, strength: 0.7 },
    start: { x: 0, y: 150, z: 260 },
    fogScale: 1.15,
  },
  objectives: [
    { id: "hayatta", type: "survive", seconds: 90, label: "Hayatta kal" },
    { id: "kacis", type: "reachZone", zone: "kacis", label: "Kül Vadisi'ne kaç", hidden: true },
  ],
  fail: [{ type: "death" }],
  abilities: { flame: true, fireball: true, roll: true, shock: true, rage: true },
  par: { time: 180, score: 9000 },
  rewardEmbers: 2400,
  bondXp: 240,
  unlocks: [],
  beats: [
    {
      id: "acilis",
      trigger: { at: "start" },
      lines: [
        { who: "Vorren", text: "Son yuva da söndü.", dur: 4 },
        { who: "Kayra", text: "…O da ne?", dur: 2.4 },
      ],
      actions: [{ do: "spawnWave", wave: "baski" }],
    },
    {
      id: "perde",
      trigger: { at: "time", t: 12 },
      lines: [
        { who: "Pyra", text: "(Kül perdesi ikiye ayrılıyor.)", dur: 3 },
        { who: "Vorren", text: "Sovereign Cinder, kalkışa geç.", dur: 3.4 },
      ],
      actions: [{ do: "reveal", prop: "flagship" }, { do: "shake", amp: 1.6 }, { do: "roar" }],
    },
    {
      id: "kacamayiz",
      trigger: { at: "time", t: 34 },
      lines: [{ who: "Kayra", text: "Bununla savaşamayız. Bugün değil.", dur: 3.2 }],
      actions: [{ do: "spawnWave", wave: "son" }],
    },
    {
      id: "yaralandi",
      trigger: { at: "stat", key: "hp", op: "<", value: 45 },
      lines: [{ who: "Kayra", text: "Dayan Pyra! Kuzeye, vadiye!", dur: 3 }],
    },
    {
      id: "kacisAcildi",
      trigger: { at: "objectiveDone", id: "hayatta" },
      lines: [{ who: "Kayra", text: "Kuzeye! Kül Vadisi bizi saklar.", dur: 3.4 }],
      actions: [{ do: "enableObjective", id: "kacis" }],
    },
    {
      id: "son",
      trigger: { at: "objectiveDone", id: "kacis" },
      lines: [
        { who: "Kayra", text: "Kül söner. Köz kalır.", dur: 4 },
        { who: "Pyra", text: "(Kanatlar yorgun ama sağlam.)", dur: 3 },
      ],
    },
  ],
};

/* ------------------------------------------------------------------ *
 * Serbest Yıkım
 * ------------------------------------------------------------------ */
export function makeSandbox(seed: number): ChapterDef {
  return {
    id: "sandbox",
    index: 0,
    title: "Serbest Yıkım",
    subtitle: "Kural yok, hedef yüzdesi var",
    briefing: {
      lore:
        "Hikâye yok, brifing yok. Rastgele kurulan bir Ashkeep şehri, tam " +
        "cephane ve Kaos Çarpanı. Şehrin %60'ı yeter; %100 için caddeleri " +
        "Köz Mermisi ile aşman gerekir.",
      objectives: ["Şehrin %60'ını yık"],
      tips: ["Tüm yetenekler açık", "Kombo 5 saniye içinde yenilenir"],
    },
    world: {
      radius: 780,
      city: {
        seed,
        cx: 0,
        cz: 0,
        radius: 440,
        density: "medium",
        wall: true,
        masts: 5,
        elevators: 3,
      },
      airships: [
        { x: 300, y: 130, z: 240, role: "scout" },
        { x: -320, y: 120, z: -220, role: "scout" },
        { x: 80, y: 150, z: -430, role: "scout" },
        { x: -60, y: 140, z: 450, role: "scout" },
      ],
      wind: { dir: Math.random() * Math.PI * 2, strength: 0.5 },
      start: { x: 0, y: 120, z: -520 },
    },
    objectives: [{ id: "yikim", type: "destroyPercent", pct: 0.6, label: "Şehri küle çevir" }],
    fail: [{ type: "death" }],
    abilities: { flame: true, fireball: true, roll: true, shock: true, rage: true },
    par: { time: 420, score: 24000 },
    rewardEmbers: 600,
    bondXp: 40,
    unlocks: [],
    beats: [],
  };
}

export const CHAPTERS: ChapterDef[] = [c01, c02, c03, c04, c05, c06];

export function chapterById(id: ChapterId, seed = Date.now() % 1e9): ChapterDef {
  if (id === "sandbox") return makeSandbox(seed);
  return CHAPTERS.find((c) => c.id === id) ?? c01;
}
