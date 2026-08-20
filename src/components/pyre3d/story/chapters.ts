import type { ChapterDef, ChapterId } from "./types";

/**
 * Kampanya: "Kül Perdesinin Ardında".
 *
 * Yedi bölüm, her biri yeni bir mekaniği öğretir. Zorluk ve düşman sayısı
 * ilerledikçe artar — son bölüm her şeyi bir araya getirir.
 */

const ALL_OFF = { flame: false, fireball: false, roll: false, shock: false, rage: false };

/* ------------------------------------------------------------------ *
 * 01 — Uyanış
 * ------------------------------------------------------------------ */
const c01: ChapterDef = {
  id: "c01",
  index: 1,
  title: "Hız ve Çeviklik",
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
      "Hızlanması için boost butonuna bas",
    ],
  },
  world: {
    radius: 1400,
    terrain: [{ t: "ridge", axis: "z", center: 0, halfWidth: 95, feather: 110, height: 170 }],
    scatter: {},
    props: [
      { t: "gate", x: 10, y: 70, z: -130, radius: 26 },
      { t: "gate", x: -34, y: 62, z: 10, radius: 24 },
      { t: "gate", x: 40, y: 82, z: 150, radius: 22 },
      { t: "gate", x: -20, y: 58, z: 290, radius: 22 },
      { t: "gate", x: 26, y: 74, z: 430, radius: 24 },
      { t: "gate", x: 0, y: 66, z: 560, radius: 28 },
      { t: "gate", x: -16, y: 90, z: 680, radius: 20 },
      { t: "gate", x: 30, y: 64, z: 800, radius: 22 },
      { t: "gate", x: -24, y: 94, z: 920, radius: 20 },
      { t: "gate", x: 18, y: 72, z: 1040, radius: 22 },
      { t: "gate", x: 0, y: 88, z: 1160, radius: 24 },
      { t: "gate", x: -12, y: 80, z: 1280, radius: 22 },
    ],
    zones: [{ id: "cikis", x: 0, z: 1380, r: 90, label: "Kanyon ağzı" }],
    wind: { dir: 0.4, strength: 0.2 },
    start: { x: 0, y: 72, z: -380 },
    fogScale: 1.25,
  },
  objectives: [
    { id: "gecit", type: "passGates", gates: 12, label: "Kaya geçitlerinden uç" },
    { id: "cikis", type: "reachZone", zone: "cikis", label: "Kanyonun ağzına ulaş" },
  ],
  fail: [{ type: "death" }],
  abilities: { ...ALL_OFF },
  par: { time: 120, score: 400 },
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
    scatter: { house: 42, workshop: 10, warehouse: 6 },
    props: [{ t: "structure", kind: "bridge", x: 0, z: 120, scale: 1.35, id: "kopru" }],
    wind: { dir: 1.1, strength: 0.45 },
    start: { x: 0, y: 70, z: -140 },
  },
  objectives: [
    { id: "kopru", type: "destroyKind", kind: "bridge", count: 1, label: "Madenci köprüsünü yak" },
    { id: "kamp", type: "destroyPercent", pct: 0.1, label: "Kampı küle çevir" },
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
    {
      id: "ruzgarKamp",
      trigger: { at: "objectiveDone", id: "kamp" },
      lines: [{ who: "Kayra", text: "Rüzgâr ateşi kampa taşıdı. Küle döndü.", dur: 3.4 }],
    },
  ],
};

/* ------------------------------------------------------------------ *
 * 03 — Kül Vadisi
 * ------------------------------------------------------------------ */
const c03: ChapterDef = {
  id: "c03",
  index: 3,
  title: "Kül Vadisi",
  subtitle: "Kül Şehri'nin köz madenleri",
  briefing: {
    lore:
      "Kül Şehri — Ashkeep'in taşra merkezi. Halka halka kurulmuş, ortasında " +
      "Kazan Meydanı, kenarında köz madeni asansörleri. Damarları kazıyan " +
      "bu asansörler. Köz Mermisi ile yangını caddenin öbür tarafına sıçrat — " +
      "cadde yangın duvarıdır.",
    objectives: ["Şehrin %30'unu yık", "3 köz madeni asansörünü imha et"],
    tips: [
      "M ile Köz Mermisi at",
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
      density: "large",
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
    { id: "yikim", type: "destroyPercent", pct: 0.3, label: "Şehri küle çevir" },
    {
      id: "asansor",
      type: "destroyKind",
      kind: "elevator",
      count: 3,
      label: "Köz madeni asansörleri",
    },
  ],
  fail: [{ type: "death" }],
  abilities: { ...ALL_OFF, flame: true, fireball: true },
  par: { time: 420, score: 26000 },
  rewardEmbers: 1200,
  bondXp: 150,
  unlocks: ["c04"],
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
      actions: [{ do: "spawnWave", wave: "tahliye" }],
    },
    {
      id: "asansorler",
      trigger: { at: "objectiveDone", id: "asansor" },
      lines: [{ who: "Kayra", text: "Asansörler gitti. Bu damar bir daha açılmaz.", dur: 3.4 }],
    },
    {
      id: "yikimEcho",
      trigger: { at: "objectiveDone", id: "yikim" },
      lines: [
        { who: "Kayra", text: "Kül Şehri yanıyor. Loncanın erleri titriyor.", dur: 3.8 },
        { who: "Pyra", text: "(Dumanın içinde esen bir kükreme.)", dur: 3.2 },
      ],
    },
  ],
};

/* ------------------------------------------------------------------ *
 * 04 — Çöl Kervanı
 * ------------------------------------------------------------------ */
const c04: ChapterDef = {
  id: "c04",
  index: 4,
  title: "Çöl Kervanı",
  subtitle: "Ashkeep'in can damarı",
  briefing: {
    lore:
      "Kül Vadisi'nden kaçtıktan sonra güneye, çöle iniyorsunuz. Kumlukların " +
      "ortasından Ashkeep'in ana ikmal kervanı geçiyor — tonlarca lexil, " +
      "barut ve yiyecek. Bu kervanı imha edersen sovereign'in ordusu " +
      "beslenemez. Ama kervanı koruyan muhafız kuleleri ve kamp var.",
    objectives: [
      "Kervanın %60'ını yok et",
      "4 muhafız kulesini yık",
      "Kampı küle çevir",
    ],
    tips: [
      "Kervan uzun — boydan boya geç",
      "Kuleler seni hedef alıyor, düşür",
      "Rüzgar kumunu savuruyor — odaklan",
    ],
  },
  world: {
    radius: 900,
    terrain: [
      { t: "ridge", axis: "x", center: -280, halfWidth: 120, feather: 140, height: 80 },
      { t: "ridge", axis: "x", center: 280, halfWidth: 110, feather: 130, height: 70 },
      { t: "ridge", axis: "z", center: 400, halfWidth: 200, feather: 160, height: 90 },
    ],
    scatter: {
      tower: 6,
      house: 12,
      workshop: 4,
      ammo_depot: 3,
      barracks: 2,
    },
    props: [
      { t: "caravan", x: 0, z: -300, count: 28, spacing: 22, angle: 0.03 },
      { t: "structure", kind: "warehouse", x: 0, z: -300, scale: 1.2, id: "kervan1" },
      { t: "structure", kind: "warehouse", x: 20, z: -180, scale: 1.1, id: "kervan2" },
      { t: "structure", kind: "warehouse", x: -10, z: -60, scale: 1.3, id: "kervan3" },
      { t: "structure", kind: "warehouse", x: 15, z: 60, scale: 1.0, id: "kervan4" },
      { t: "structure", kind: "warehouse", x: -5, z: 180, scale: 1.2, id: "kervan5" },
      { t: "structure", kind: "watchtower", x: -60, z: -240, scale: 1.0 },
      { t: "structure", kind: "watchtower", x: 70, z: -120, scale: 1.0 },
      { t: "structure", kind: "watchtower", x: -50, z: 0, scale: 1.0 },
      { t: "structure", kind: "watchtower", x: 65, z: 120, scale: 1.0 },
      { t: "structure", kind: "watchtower", x: -55, z: 240, scale: 1.0 },
      { t: "structure", kind: "barracks", x: 0, z: 340, scale: 1.4, id: "kamp" },
      { t: "structure", kind: "armory", x: 40, z: 370, scale: 1.1 },
      { t: "structure", kind: "command_post", x: -35, z: 390, scale: 1.0 },
    ],
    airships: [
      { x: 200, y: 140, z: -200, role: "scout" },
      { x: -180, y: 130, z: 100, role: "scout" },
      { x: 100, y: 155, z: 350, role: "scout" },
    ],
    waves: {
      ilk: { enemy: "wasp", count: 3, radius: 260, altitude: [100, 160] },
      kule: { enemy: "wasp", count: 4, radius: 300, altitude: [90, 170] },
      son: { enemy: "wasp", count: 6, radius: 340, altitude: [80, 180] },
    },
    wind: { dir: 0.3, strength: 0.6 },
    start: { x: 0, y: 130, z: -500 },
    fogScale: 1.3,
  },
  objectives: [
    { id: "kervan", type: "destroyPercent", pct: 0.6, label: "Kervanı yok et" },
    { id: "kuleler", type: "destroyKind", kind: "watchtower", count: 4, label: "Muhafız kulelerini yık" },
    { id: "kamp", type: "destroyKind", kind: "barracks", count: 1, label: "Kampı küle çevir" },
  ],
  fail: [{ type: "death" }],
  abilities: { ...ALL_OFF, flame: true, fireball: true },
  par: { time: 360, score: 18000 },
  rewardEmbers: 1500,
  bondXp: 170,
  unlocks: ["c05"],
  beats: [
    {
      id: "acilis",
      trigger: { at: "start" },
      lines: [
        { who: "Kayra", text: "Çöl. Kervan güzergahı kuzeyden güneye uzanıyor.", dur: 3.8 },
        { who: "Pyra", text: "(Kumlar arasında uzun bir kuyruk görülüyor — develer, vagonlar.)", dur: 3.6 },
      ],
      actions: [
        { do: "hint", text: "Kervan boyunca uç, hepsini yak", keys: [], dur: 6 },
      ],
    },
    {
      id: "ilkVagon",
      trigger: { at: "event", event: "targetDestroyed" },
      lines: [{ who: "Kayra", text: "İlk vagon gitti. Lexil doluydu — alev topu gibi patladı.", dur: 3.4 }],
      actions: [
        { do: "unlockAbility", ability: "roll" },
        { do: "hint", text: "Takla — hedeflerden ve mermilerden kurtul", keys: ["R"], dur: 8 },
      ],
    },
    {
      id: "kuleUyari",
      trigger: { at: "objectiveProgress", id: "kervan", pct: 0.3 },
      lines: [{ who: "Ashkeep", text: "Kuleler ejderhayı görüyor — ateş aç!", dur: 3 }],
      actions: [
        { do: "spawnWave", wave: "ilk" },
        { do: "hint", text: "Kuleleri düşür", keys: [], dur: 5 },
      ],
    },
    {
      id: "ruzgarDegisti",
      trigger: { at: "objectiveProgress", id: "kervan", pct: 0.5 },
      lines: [{ who: "Kayra", text: "Rüzgar değişti. Kumu savuruyor — dikkatli ol.", dur: 3.2 }],
      actions: [{ do: "setWind", dir: 1.1, strength: 0.8 }],
    },
    {
      id: "kampSaldiri",
      trigger: { at: "objectiveProgress", id: "kervan", pct: 0.7 },
      lines: [
        { who: "Ashkeep", text: "Tüm birlikler kampa! Ejderhayı durdurun!", dur: 3.6 },
      ],
      actions: [
        { do: "spawnWave", wave: "kule" },
        { do: "hint", text: "Takla ile saldırılardan korun", keys: ["R"], dur: 6 },
      ],
    },
    {
      id: "sonDalga",
      trigger: { at: "objectiveDone", id: "kuleler" },
      lines: [{ who: "Kayra", text: "Kuleler sustu. Şimdi kampı bitir.", dur: 3 }],
      actions: [{ do: "spawnWave", wave: "son" }],
    },
    {
      id: "kampDustu",
      trigger: { at: "objectiveDone", id: "kamp" },
      lines: [
        { who: "Kayra", text: "Kamp gitti. Kervanın geri kalanı savunmasız.", dur: 3.4 },
        { who: "Pyra", text: "(Kumlukların ötesinde bir şey parlıyor — echelon mu?)", dur: 3.8 },
      ],
    },
  ],
};

/* ------------------------------------------------------------------ *
 * 05 — Bulutvari
 * ------------------------------------------------------------------ */
const c05: ChapterDef = {
  id: "c05",
  index: 5,
  title: "Bulutvari",
  subtitle: "Lonca filosu",
  briefing: {
    lore:
      "Lonca cevabını gönderdi: 'Bulwark' sınıfı bir toplu firkateyn. Gövdesi " +
      "konik aleve kapalı — kırılacak yeri modülleri. Balon hücreleri, motor " +
      "podları, yan batarya ve köprü. Hangi sırayla imha ettiğin gemiyi değiştirir.",
    objectives: ["Bulwark'ın modüllerini imha et", "Firkateyni düşür", "Yerleşimi yak"],
    tips: [
      "Köz Mermisi modüllere 2.5 kat hasar verir",
      "Bataryayı alırsan top ateşi kesilir",
      "Balon hücreleri giderse gemi alçalır",
    ],
  },
  world: {
    radius: 760,
    scatter: { tower: 8, factory: 6, house: 22 },
    airships: [
      { x: 0, y: 150, z: 260, role: "frigate", id: "bulwark", weakPoints: true },
      { x: 220, y: 130, z: 320, role: "scout" },
      { x: -240, y: 140, z: 300, role: "scout" },
    ],
    waves: {
      eskort: { enemy: "wasp", count: 4, radius: 260, altitude: [110, 180] },
      ikinci: { enemy: "wasp", count: 5, radius: 300, altitude: [100, 190] },
    },
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
    { id: "yikim", type: "destroyPercent", pct: 0.4, label: "Yerleşimi yak" },
  ],
  fail: [{ type: "death" }],
  abilities: { ...ALL_OFF, flame: true, fireball: true, roll: true },
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
      id: "sokKilidi",
      trigger: { at: "time", t: 18 },
      lines: [{ who: "Kayra", text: "Şok dalgası hazır — dikkat et!", dur: 3 }],
      actions: [
        { do: "unlockAbility", ability: "shock" },
        { do: "hint", text: "Şok dalgası — yakındaki düşmanları savur", keys: ["Q"], dur: 8 },
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
      actions: [{ do: "spawnWave", wave: "ikinci" }],
    },
    {
      id: "sonSaldiri",
      trigger: { at: "objectiveDone", id: "modul" },
      lines: [{ who: "Kayra", text: "Bitir şunu, Pyra.", dur: 2.6 }],
      actions: [{ do: "shake", amp: 1.2 }],
    },
  ],
};

/* ------------------------------------------------------------------ *
 * 06 — Ateş Çemberi
 * ------------------------------------------------------------------ */
const c06: ChapterDef = {
  id: "c06",
  index: 6,
  title: "Ateş Çemberi",
  subtitle: "Sovereign'in kalesi",
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
    scatter: { tower: 14, factory: 8, house: 16 },
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
    { id: "yikim", type: "destroyPercent", pct: 0.5, label: "Yerleşimi yak" },
  ],
  fail: [{ type: "death" }],
  abilities: { ...ALL_OFF, flame: true, fireball: true, roll: true, shock: true, rage: true },
  par: { time: 180, score: 9000 },
  rewardEmbers: 2400,
  bondXp: 240,
  unlocks: ["c07"],
  beats: [
    {
      id: "acilis",
      trigger: { at: "start" },
      lines: [
        { who: "Vorren", text: "Son yuva da sönüyor.", dur: 4 },
        { who: "Kayra", text: "…O da ne?", dur: 2.4 },
      ],
      actions: [
        { do: "unlockAbility", ability: "rage" },
        { do: "hint", text: "Öfke — can barını doldurarak serbest bırak", keys: [], dur: 7 },
        { do: "spawnWave", wave: "baski" },
      ],
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
 * 07 — Son Hesaplaşma
 * ------------------------------------------------------------------ */
const c07: ChapterDef = {
  id: "c07",
  index: 7,
  title: "Son Hesaplaşma",
  subtitle: "Kül perdesinin ardında",
  briefing: {
    lore:
      "Kül perdesinin arkasındaki son kale. Sovereign'in tüm güçleri burada " +
      "toplanmış. Firkateynler, Wasplar, kuleler — her şey. Bu son savaş. " +
      "Her yeteneğini kullan, her hedefi yok et. Başka şans yok.",
    objectives: [
      "Şehrin %70'ini yok et",
      "2 firkateyni düşür",
      "3 fabrikayı imha et",
      "120 saniye hayatta kal",
    ],
    tips: [
      "Tüm yetenekler açık",
      "Firkateynlerin zayıf noktalarını hedefle",
      "Fabrikalar stratejik hedef — öncelikli yok et",
    ],
  },
  world: {
    radius: 900,
    city: {
      seed: 20260822,
      cx: 0,
      cz: 0,
      radius: 460,
      density: "large",
      wall: true,
      masts: 6,
      elevators: 5,
    },
    airships: [
      { x: 0, y: 150, z: 300, role: "frigate", id: "souverein1", weakPoints: true },
      { x: 180, y: 140, z: -200, role: "frigate", id: "souverein2", weakPoints: true },
      { x: 320, y: 130, z: 100, role: "scout" },
      { x: -300, y: 120, z: -250, role: "scout" },
      { x: 60, y: 150, z: -400, role: "scout" },
      { x: -200, y: 140, z: 350, role: "scout" },
    ],
    waves: {
      ilk: { enemy: "wasp", count: 5, radius: 300, altitude: [100, 170] },
      ikinci: { enemy: "wasp", count: 6, radius: 340, altitude: [90, 180] },
      son: { enemy: "wasp", count: 8, radius: 380, altitude: [80, 200] },
    },
    wind: { dir: 2.0, strength: 0.65 },
    start: { x: 0, y: 150, z: -620 },
    fogScale: 1.35,
  },
  objectives: [
    { id: "yikim", type: "destroyPercent", pct: 0.7, label: "Şehri küle çevir" },
    { id: "gemi", type: "killAirships", role: "frigate", count: 2, label: "Firkateynleri düşür" },
    { id: "fabrika", type: "destroyKind", kind: "factory", count: 3, label: "Fabrikaları imha et" },
    { id: "hayatta", type: "survive", seconds: 120, label: "Hayatta kal" },
  ],
  fail: [{ type: "death" }],
  abilities: { ...ALL_OFF, flame: true, fireball: true, roll: true, shock: true, rage: true },
  par: { time: 600, score: 40000 },
  rewardEmbers: 4000,
  bondXp: 300,
  unlocks: [],
  beats: [
    {
      id: "acilis",
      trigger: { at: "start" },
      lines: [
        { who: "Vorren", text: "Son perde. Burası Ashkeep'in kalbi — ve sen onu yakacaksın.", dur: 4.2 },
        { who: "Kayra", text: "Pyra, hazır mısın? Son kez.", dur: 3 },
        { who: "Pyra", text: "(Kanatlar genişliyor. Köz göğünden akıyor.)", dur: 3.2 },
      ],
      actions: [
        { do: "spawnWave", wave: "ilk" },
        { do: "hint", text: "Tüm yetenekler açık — her şeyi yok et", keys: [], dur: 6 },
      ],
    },
    {
      id: "fabrikaHedef",
      trigger: { at: "time", t: 15 },
      lines: [{ who: "Kayra", text: "Fabrikalar stratejik hedef — onları ilk indir.", dur: 3.4 }],
      actions: [{ do: "hint", text: "Fabrikaları hedefle", keys: ["M"], dur: 6 }],
    },
    {
      id: "ilkDalgaBitti",
      trigger: { at: "objectiveProgress", id: "yikim", pct: 0.15 },
      lines: [{ who: "Ashkeep", text: "İkinci dalga geliyor! Hazır olun!", dur: 3 }],
      actions: [{ do: "spawnWave", wave: "ikinci" }],
    },
    {
      id: "firkateynUyari",
      trigger: { at: "objectiveProgress", id: "fabrika", pct: 0.5 },
      lines: [
        { who: "Ashkeep", text: "Firkateynler angaje oluyor! Bataryalar açık!", dur: 3.6 },
      ],
      actions: [{ do: "shake", amp: 0.8 }],
    },
    {
      id: "ruzgarDegisti",
      trigger: { at: "objectiveProgress", id: "yikim", pct: 0.5 },
      lines: [{ who: "Kayra", text: "Rüzgâr döndü. Ateş şehrin merkezine yürüyor.", dur: 3.4 }],
      actions: [{ do: "setWind", dir: 0.5, strength: 0.85 }],
    },
    {
      id: "sonDalga",
      trigger: { at: "objectiveProgress", id: "yikim", pct: 0.6 },
      lines: [{ who: "Vorren", text: "Her şeyi yapın! O ejderhayı durdurun!", dur: 3.4 }],
      actions: [
        { do: "spawnWave", wave: "son" },
        { do: "shake", amp: 1.0 },
      ],
    },
    {
      id: "yaralandi",
      trigger: { at: "stat", key: "hp", op: "<", value: 35 },
      lines: [{ who: "Kayra", text: "Dayan Pyra! Neredeyse bitti!", dur: 3 }],
      actions: [{ do: "slowmo", scale: 0.4, dur: 0.5 }],
    },
    {
      id: "zafer",
      trigger: { at: "objectiveDone", id: "yikim" },
      lines: [
        { who: "Kayra", text: "Şehri küle çevirdik. Ashkeep'in kalbi durdu.", dur: 4 },
        { who: "Pyra", text: "(Dumanın içinde, bir kükreme daha yükseliyor.)", dur: 3.4 },
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
    title: "Şehre Saldır",
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
        density: "large",
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
      start: { x: 0, y: 130, z: -920 },
    },
    objectives: [{ id: "yikim", type: "destroyPercent", pct: 0.7, label: "Şehri küle çevir" }],
    fail: [{ type: "death" }],
    abilities: { flame: true, fireball: true, roll: true, shock: true, rage: true },
    par: { time: 420, score: 24000 },
    rewardEmbers: 600,
    bondXp: 40,
    unlocks: [],
    beats: [],
  };
}

export const CHAPTERS: ChapterDef[] = [c01, c02, c03, c04, c05, c06, c07];

export function chapterById(id: ChapterId, seed = Date.now() % 1e9): ChapterDef {
  if (id === "sandbox") return makeSandbox(seed);
  return CHAPTERS.find((c) => c.id === id) ?? c01;
}
