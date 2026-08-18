import * as THREE from "three";

/**
 * Paylaşılan materyaller.
 *
 * Her parça için yeni materyal üretmek three.js'te ayrı shader programı ve
 * ayrı draw call demek. Renk/pürüzlülük başına tek örnek tutuluyor ve
 * `userData.shared` ile işaretleniyor: sahne yıkılırken dispose edilmiyorlar,
 * böylece bölüm geçişlerinde yeniden derleme olmuyor.
 */
export const shared = <T extends THREE.Material>(m: T): T => {
  m.userData["shared"] = true;
  return m;
};

const stoneCache = new Map<string, THREE.MeshStandardMaterial>();

export const stone = (c: number, r = 0.85) => {
  const key = `${c}:${r}`;
  let m = stoneCache.get(key);
  if (!m) {
    m = shared(
      new THREE.MeshStandardMaterial({
        color: c,
        roughness: r,
        metalness: 0.15,
        flatShading: true,
      }),
    );
    stoneCache.set(key, m);
  }
  return m;
};

export const brass = shared(
  new THREE.MeshStandardMaterial({ color: 0x8a6b32, roughness: 0.35, metalness: 0.9 }),
);

export const litWindow = shared(
  new THREE.MeshStandardMaterial({
    color: 0x1a1208,
    emissive: 0xffa23c,
    emissiveIntensity: 1.6,
    roughness: 0.4,
  }),
);

export const bandMat = shared(
  new THREE.MeshStandardMaterial({ color: 0x8a2f22, roughness: 0.8, metalness: 0.15 }),
);

export const flagMat = shared(
  new THREE.MeshBasicMaterial({ color: 0xd84a2a, side: THREE.DoubleSide }),
);

export const coilMat = shared(
  new THREE.MeshStandardMaterial({
    color: 0x0a1a22,
    emissive: 0x39c6ff,
    emissiveIntensity: 2.4,
    roughness: 0.3,
  }),
);

export const lanternMat = shared(
  new THREE.MeshStandardMaterial({
    color: 0x2a1404,
    emissive: 0xffb04a,
    emissiveIntensity: 2.2,
    roughness: 0.4,
  }),
);

export const groundMat = shared(
  new THREE.MeshStandardMaterial({ color: 0x2a1a13, roughness: 1, flatShading: true }),
);

export const peakMat = shared(
  new THREE.MeshStandardMaterial({ color: 0x150e0b, roughness: 1, flatShading: true }),
);

export const woodMat = shared(
  new THREE.MeshStandardMaterial({ color: 0x4a3118, roughness: 0.95, flatShading: true }),
);

/** Kaldırım taş dokusu — cadde ve sokak yüzeyleri için. */
function makeCobblestoneTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  // Koyu temel
  ctx.fillStyle = "#1a1310";
  ctx.fillRect(0, 0, 256, 256);
  // Rastgele kaldırımtaşları
  const stoneW = 28;
  const stoneH = 18;
  const gap = 2;
  for (let row = 0; row < 14; row++) {
    const offset = row % 2 === 0 ? 0 : stoneW / 2 + 1;
    for (let col = -1; col < 11; col++) {
      const x = col * (stoneW + gap) + offset + (Math.random() - 0.5) * 3;
      const y = row * (stoneH + gap) + (Math.random() - 0.5) * 2;
      const base = 25 + Math.floor(Math.random() * 18);
      const r = base + Math.floor(Math.random() * 8);
      const g = base + Math.floor(Math.random() * 6);
      const b = base - 3 + Math.floor(Math.random() * 8);
      // Taş yüzeyi
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.beginPath();
      ctx.roundRect(x, y, stoneW - 1, stoneH - 1, 3);
      ctx.fill();
      // Üst kenar ışığı
      ctx.fillStyle = `rgba(180,160,140,${0.04 + Math.random() * 0.04})`;
      ctx.fillRect(x + 2, y + 1, stoneW - 5, 1.5);
      // Alt kenar gölgesi
      ctx.fillStyle = `rgba(0,0,0,${0.15 + Math.random() * 0.1})`;
      ctx.fillRect(x + 2, y + stoneH - 3, stoneW - 5, 1.5);
    }
  }
  // Harç çizgileri (daha koyu)
  ctx.strokeStyle = "rgba(8,5,3,0.5)";
  ctx.lineWidth = 1.5;
  for (let row = 0; row <= 14; row++) {
    const y = row * (stoneH + gap) - gap / 2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(256, y);
    ctx.stroke();
  }
  // Rastgele çatlaklar
  ctx.strokeStyle = "rgba(5,3,2,0.3)";
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 12; i++) {
    const sx = Math.random() * 256;
    const sy = Math.random() * 256;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + (Math.random() - 0.5) * 20, sy + (Math.random() - 0.5) * 15);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.repeat.set(8, 8);
  tex.userData["shared"] = true;
  return tex;
}

let _cobbleTex: THREE.CanvasTexture | null = null;
export function cobblestoneTexture(): THREE.CanvasTexture {
  return (_cobbleTex ??= makeCobblestoneTexture());
}

/** Cadde/meydan zemini — şehir bloklarının altına serilen koyu kaplama. */
export const streetMat = shared(
  new THREE.MeshStandardMaterial({
    color: 0x1c1410,
    map: cobblestoneTexture(),
    roughness: 1,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  }),
);

export const windowGeo = new THREE.PlaneGeometry(0.5, 0.7);

/**
 * Parçacıklar için yumuşak yuvarlak maske. PointsMaterial dokusuz kullanılınca
 * her parçacık kenarları keskin bir kare olarak çiziliyor.
 */
let softTex: THREE.Texture | null = null;
export function softParticleTexture(): THREE.Texture {
  if (softTex) return softTex;
  const size = 64;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.65)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  softTex = new THREE.CanvasTexture(c);
  softTex.userData["shared"] = true;
  return softTex;
}

/* ------------------------------------------------------------------ *
 * Şehir: pencere levhası
 *
 * Eski `addWindows()` pencere başına bir PlaneGeometry üretiyordu. 780
 * binalık bir şehirde bu 100 binden fazla quad demek. Yerine cephe başına
 * TEK quad + tekrarlayan pencere dokusu kullanıyoruz: ~30 kat daha az vertex,
 * aynı görünüm.
 *
 * Doku 4x4 hücrelik bir ızgara; hücrelerin bir kısmı boş (sönük daire).
 * Bina başına rastgele UV kaydırması hangi pencerelerin yandığını değiştirir.
 * ------------------------------------------------------------------ */
let windowTex: THREE.Texture | null = null;
export function windowSheetTexture(): THREE.Texture {
  if (windowTex) return windowTex;
  const cell = 64;
  const grid = 4;
  const size = cell * grid;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);
  for (let gy = 0; gy < grid; gy++) {
    for (let gx = 0; gx < grid; gx++) {
      // Sönük daireler: gece bile her pencere yanmaz, bu çeşitlilik şehri
      // "kopyala-yapıştır" olmaktan çıkarıyor.
      if (Math.random() < 0.42) continue;
      const x = gx * cell;
      const y = gy * cell;
      const pad = cell * 0.28;
      const w = cell - pad * 2;
      const h = cell - pad * 2.2;
      const warm = 200 + Math.floor(Math.random() * 55);
      const g = ctx.createLinearGradient(x, y + pad, x, y + pad + h);
      g.addColorStop(0, `rgba(255,${warm},120,0.95)`);
      g.addColorStop(1, `rgba(255,${warm - 60},60,0.75)`);
      ctx.fillStyle = g;
      ctx.fillRect(x + pad, y + pad, w, h);
      // Pencere kanadı: ortadan geçen ince karanlık çıta.
      ctx.fillStyle = "rgba(0,0,0,0.9)";
      ctx.fillRect(x + pad + w / 2 - 1.5, y + pad, 3, h);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.userData["shared"] = true;
  windowTex = tex;
  return tex;
}

/* ------------------------------------------------------------------ *
 * Şehir: kömürleşme shader yaması
 *
 * Şehir binaları tek bir blok mesh'ine birleştiriliyor. Tek tek yanmaları ve
 * yıkılmaları için geometriyi yeniden birleştirmek çok pahalı olurdu; onun
 * yerine her vertex'e bina durumunu taşıyan `aState` niteliği ekliyoruz:
 *
 *   0.0 .. 1.0  →  yanma miktarı (renk kömüre, emissive kora kayar)
 *   >= 2.0      →  yıkıldı (vertex klip uzayının dışına itilir, yok olur)
 *
 * Draw call değişmiyor, geometri değişmiyor, tek bir Float32Array yazımı
 * bir binayı haritadan siliyor.
 * ------------------------------------------------------------------ */

const CHAR_KEY = "pyre-char-v1";

/**
 * `aState` niteliğini okuyan bir varyant üretir.
 *
 * Yamalı materyaller SADECE `aState` taşıyan geometrilerde kullanılmalı;
 * bu yüzden şehir materyalleri ayrı bir önbellekte tutuluyor.
 */
function patchChar<T extends THREE.Material>(m: T): T {
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        attribute float aState;
        varying float vState;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vState = aState;`,
      )
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        // Yıkılan bina: vertex'i klip uzayının dışına iterek görünmez kıl.
        if ( vState > 1.5 ) { gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 ); }`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying float vState;`,
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        float vBurn = clamp( vState, 0.0, 1.0 );
        diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.10, 0.047, 0.024 ), vBurn * 0.92 );`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3( 1.0, 0.28, 0.05 ) * vBurn * vBurn * 2.2;`,
      );
  };
  // Sabit anahtar olmadan three.js her materyal örneği için ayrı program
  // önbelleği tutabiliyor; yamanın tamamı özdeş olduğu için tek program yeter.
  m.customProgramCacheKey = () => CHAR_KEY;
  return m;
}

const cityCache = new Map<string, THREE.MeshStandardMaterial>();

/** Kömürleşebilen şehir yüzeyi. */
export function cityMat(color: number, roughness = 0.9, metalness = 0.1) {
  const key = `${color}:${roughness}:${metalness}`;
  let m = cityCache.get(key);
  if (!m) {
    m = patchChar(
      shared(
        new THREE.MeshStandardMaterial({
          color,
          roughness,
          metalness,
          flatShading: false,
        }),
      ),
    );
    cityCache.set(key, m);
  }
  return m;
}

let cityWindowMat: THREE.MeshStandardMaterial | null = null;

/** Kömürleşebilen pencere levhası — cephe başına tek quad. */
export function cityWindowMaterial(): THREE.MeshStandardMaterial {
  if (cityWindowMat) return cityWindowMat;
  const tex = windowSheetTexture();
  cityWindowMat = patchChar(
    shared(
      new THREE.MeshStandardMaterial({
        color: 0x150d07,
        map: tex,
        emissive: 0xffffff,
        emissiveMap: tex,
        emissiveIntensity: 1.5,
        roughness: 0.5,
        // Boş pencere hücreleri saydam; alphaTest saydamlık sıralaması
        // gerektirmediği için birleştirilmiş geometriyle sorunsuz çalışır.
        alphaTest: 0.5,
        transparent: false,
      }),
    ),
  );
  return cityWindowMat;
}

/** `aState` tabanlı materyallerin listesi — dev doğrulaması için. */
export function cityMaterialCount(): number {
  return cityCache.size + (cityWindowMat ? 1 : 0);
}

/* ------------------------------------------------------------------ *
 *  Duvar dokuları — prosedürel tuğla / taş / ahşap
 * ------------------------------------------------------------------ */

function makeBrickTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  // Tuğla zemin rengi
  ctx.fillStyle = "#5a3525";
  ctx.fillRect(0, 0, 128, 128);
  const bw = 30;
  const bh = 14;
  const gap = 2;
  for (let row = 0; row < 5; row++) {
    const offset = row % 2 === 0 ? 0 : bw / 2;
    for (let col = -1; col < 6; col++) {
      const x = col * (bw + gap) + offset;
      const y = row * (bh + gap);
      // Her tuğlaya hafif renk varyasyonu
      const r = 80 + Math.floor(Math.random() * 30);
      const g = 40 + Math.floor(Math.random() * 20);
      const b = 30 + Math.floor(Math.random() * 15);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, y, bw, bh);
      // Üst yüzeyde hafif highlight
      ctx.fillStyle = `rgba(255,200,150,${0.06 + Math.random() * 0.06})`;
      ctx.fillRect(x, y, bw, 2);
    }
  }
  // Harç çizgileri
  ctx.strokeStyle = "rgba(30,18,12,0.6)";
  ctx.lineWidth = 1;
  for (let row = 0; row <= 5; row++) {
    const y = row * (bh + gap) - gap / 2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(128, y);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.repeat.set(2, 2);
  tex.userData["shared"] = true;
  return tex;
}

function makeStoneTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#4a4540";
  ctx.fillRect(0, 0, 128, 128);
  // Rastgele taş bloklar
  const blocks: [number, number, number, number][] = [
    [0, 0, 50, 30],
    [52, 0, 76, 28],
    [0, 32, 40, 30],
    [42, 30, 86, 32],
    [0, 64, 60, 32],
    [62, 64, 128, 30],
    [0, 98, 48, 30],
    [50, 96, 100, 32],
    [102, 98, 128, 30],
  ];
  for (const b of blocks) {
    const [x0, y0, x1, y1] = b;
    const base = 55 + Math.floor(Math.random() * 25);
    const r = base + Math.floor(Math.random() * 10);
    const g = base + Math.floor(Math.random() * 8);
    const bv = base - 5 + Math.floor(Math.random() * 10);
    ctx.fillStyle = `rgb(${r},${g},${bv})`;
    ctx.fillRect(x0 + 1, y0 + 1, x1 - x0 - 2 || 24, y1 - y0 - 2 || 26);
    ctx.fillStyle = `rgba(200,190,180,${0.05 + Math.random() * 0.05})`;
    ctx.fillRect(x0 + 1, y0 + 1, x1 - x0 - 2 || 24, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.repeat.set(2, 2);
  tex.userData["shared"] = true;
  return tex;
}

function makeWoodTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#3e2815";
  ctx.fillRect(0, 0, 128, 128);
  // Ahşap tahtalar (dikey)
  const plankW = 22;
  for (let i = 0; i < 7; i++) {
    const x = i * (plankW + 1);
    const base = 50 + Math.floor(Math.random() * 15);
    ctx.fillStyle = `rgb(${base + 10},${base},${base - 10})`;
    ctx.fillRect(x, 0, plankW, 128);
    // Doku çizgileri
    ctx.strokeStyle = `rgba(20,12,5,${0.15 + Math.random() * 0.1})`;
    ctx.lineWidth = 0.5;
    for (let ly = 0; ly < 128; ly += 4 + Math.floor(Math.random() * 6)) {
      ctx.beginPath();
      ctx.moveTo(x + 2, ly);
      ctx.lineTo(x + plankW - 2, ly + (Math.random() - 0.5) * 3);
      ctx.stroke();
    }
    // Düğüm deliği
    if (Math.random() > 0.6) {
      const ky = 20 + Math.random() * 88;
      ctx.fillStyle = `rgba(25,15,8,0.5)`;
      ctx.beginPath();
      ctx.ellipse(x + plankW / 2, ky, 3, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.repeat.set(1.5, 1.5);
  tex.userData["shared"] = true;
  return tex;
}

let _brickTex: THREE.CanvasTexture | null = null;
let _stoneTex: THREE.CanvasTexture | null = null;
let _woodTex: THREE.CanvasTexture | null = null;

export function brickTexture(): THREE.CanvasTexture {
  return (_brickTex ??= makeBrickTexture());
}
export function stoneTexture(): THREE.CanvasTexture {
  return (_stoneTex ??= makeStoneTexture());
}
export function woodTexture(): THREE.CanvasTexture {
  return (_woodTex ??= makeWoodTexture());
}

/** Doku kaplı şehir materyali — `aState` yaması ile. */
export function cityTexturedMat(
  tex: THREE.CanvasTexture,
  color: number,
  roughness = 0.9,
): THREE.MeshStandardMaterial {
  const key = `tex:${color}:${roughness}`;
  let m = cityCache.get(key);
  if (!m) {
    m = patchChar(
      shared(
        new THREE.MeshStandardMaterial({
          color,
          map: tex,
          roughness,
          metalness: 0.1,
          flatShading: false,
        }),
      ),
    );
    cityCache.set(key, m);
  }
  return m;
}
