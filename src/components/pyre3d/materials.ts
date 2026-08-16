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

/** Cadde/meydan zemini — şehir bloklarının altına serilen koyu kaplama. */
export const streetMat = shared(
  new THREE.MeshStandardMaterial({
    color: 0x1c1410,
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
          flatShading: true,
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
