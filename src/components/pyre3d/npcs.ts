import * as THREE from "three";
import type { Rng } from "./rng";

/**
 * Şehir sakinleri — siviller ve askerler.
 *
 * Render: vücut parçası başına TEK InstancedMesh (8 adet). Eski sürüm NPC
 * başına 8-9 ayrı mesh kuruyordu; ~90 NPC'de 500-800 draw call'luk en büyük
 * kalemdi. Şimdi tüm kalabalık 8 draw call; renkler instanceColor ile,
 * bacak/kol salınımı kare başına matris kompozisyonuyla yazılıyor.
 */

export type NpcKind = "civilian" | "soldier";

type Npc = {
  /** Sahneye eklenmeyen dönüşüm tutucusu — combat.ts pozisyonunu okur. */
  group: THREE.Object3D;
  kind: NpcKind;
  vel: THREE.Vector3;
  targetDir: THREE.Vector3;
  shootTimer: number;
  runTimer: number;
  alive: boolean;
  /** Yürüme animasyonu fazı — Date.now() yerine dt ile birikir. */
  walkPhase: number;
  /** Tüfek geri tepme sayacı (setTimeout yerine). */
  recoilT: number;
  /** Anlık bacak salınım açısı (askerde sönümlenir). */
  swing: number;
};

export type NpcHandle = {
  npcs: Npc[];
  kill(npc: Npc): void;
  emitDeathFx(
    pos: THREE.Vector3,
    fx: { ember(p: THREE.Vector3, count: number, spread: number): void },
  ): void;
  projectiles: THREE.Group;
  update(
    dt: number,
    dragonPos: THREE.Vector3 | null,
    dragonFwd: THREE.Vector3,
    onHitDragon?: (damage: number) => void,
  ): void;
  dispose(): void;
};

const MAX_NPC = 400;
const CIVILIAN_SPEED = 14;
const SOLDIER_SHOOT_INTERVAL = 2.2;
const FLEE_DISTANCE = 60;

/* ---- vücut parçaları ---- */

type PartAnim = "static" | "armL" | "armR" | "legL" | "legR";
type PartDef = {
  geo: THREE.BoxGeometry;
  /** static: parçanın yerel konumu; limb: eklem pivotu. */
  pivot: THREE.Vector3;
  /** Limb: pivottan mesh merkezine ofset. */
  offset: THREE.Vector3;
  anim: PartAnim;
  /** Renk kaynağı. */
  tint: "skin" | "cloth" | "dark";
  /** Sabit ön dönüş (tüfek). */
  rotX?: number;
  /** Yalnız askerlerde görünür. */
  soldierOnly?: boolean;
};

const PARTS: PartDef[] = [
  {
    geo: new THREE.BoxGeometry(0.5, 0.5, 0.5),
    pivot: new THREE.Vector3(0, 2.3, 0),
    offset: new THREE.Vector3(),
    anim: "static",
    tint: "skin",
  },
  {
    geo: new THREE.BoxGeometry(0.58, 0.2, 0.58),
    pivot: new THREE.Vector3(0, 2.65, 0),
    offset: new THREE.Vector3(),
    anim: "static",
    tint: "dark",
  },
  {
    geo: new THREE.BoxGeometry(0.65, 0.9, 0.4),
    pivot: new THREE.Vector3(0, 1.6, 0),
    offset: new THREE.Vector3(),
    anim: "static",
    tint: "cloth",
  },
  {
    geo: new THREE.BoxGeometry(0.22, 0.8, 0.22),
    pivot: new THREE.Vector3(-0.5, 2.0, 0),
    offset: new THREE.Vector3(0, -0.35, 0),
    anim: "armL",
    tint: "cloth",
  },
  {
    geo: new THREE.BoxGeometry(0.22, 0.8, 0.22),
    pivot: new THREE.Vector3(0.5, 2.0, 0),
    offset: new THREE.Vector3(0, -0.35, 0),
    anim: "armR",
    tint: "cloth",
  },
  {
    geo: new THREE.BoxGeometry(0.25, 0.85, 0.28),
    pivot: new THREE.Vector3(-0.18, 1.0, 0),
    offset: new THREE.Vector3(0, -0.4, 0),
    anim: "legL",
    tint: "dark",
  },
  {
    geo: new THREE.BoxGeometry(0.25, 0.85, 0.28),
    pivot: new THREE.Vector3(0.18, 1.0, 0),
    offset: new THREE.Vector3(0, -0.4, 0),
    anim: "legR",
    tint: "dark",
  },
  {
    geo: new THREE.BoxGeometry(0.08, 0.08, 1.4),
    pivot: new THREE.Vector3(0.5, 1.9, 0.5),
    offset: new THREE.Vector3(),
    anim: "static",
    tint: "dark",
    rotX: -0.6,
    soldierOnly: true,
  },
];

/** Tüm parçalar tek paylaşılan materyali kullanır; renk instanceColor'dan. */
const npcMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0.1 });
npcMat.userData["shared"] = true;

const CIVILIAN_CLOTHES = [0x4a3a28, 0x3a2a1e, 0x5a4030, 0x382818];

/** Mermi — askerlerin ateş ettiği kurşun. Geometri/materyal modül ömürlü
 *  ve TÜM mermiler tarafından paylaşılır; asla dispose edilmez. */
const bulletGeo = new THREE.BoxGeometry(0.12, 0.12, 0.5);
const bulletMat = new THREE.MeshBasicMaterial({ color: 0xffd080 });

type Bullet = {
  active: boolean;
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
};

/** Sabit mermi havuzu: atış başına mesh yaratmak + paylaşılan geometriyi
 *  dispose etmek hem çöp üretiyor hem GPU tamponunu bozuyordu. */
const BULLET_POOL = 48;

export function createNpcSystem(
  parent: THREE.Object3D,
  rng: Rng,
  streetAt: (x: number, z: number) => boolean,
  cx: number,
  cz: number,
  radius: number,
): NpcHandle {
  const npcs: Npc[] = [];
  const projectileGroup = new THREE.Group();
  const bullets: Bullet[] = [];
  for (let i = 0; i < BULLET_POOL; i++) {
    const mesh = new THREE.Mesh(bulletGeo, bulletMat);
    mesh.visible = false;
    projectileGroup.add(mesh);
    bullets.push({ active: false, mesh, vel: new THREE.Vector3(), life: 0 });
  }
  let bulletIdx = 0;

  // Sokaklara NPC yerleştir
  const placeCount = Math.min(MAX_NPC, Math.floor(radius / 1.8));
  for (let i = 0; i < placeCount; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(radius * 0.15, radius * 0.95);
    const x = cx + Math.cos(a) * r;
    const z = cz + Math.sin(a) * r;
    if (!streetAt(x, z)) continue;

    const kind: NpcKind = rng.chance(0.75) ? "soldier" : "civilian";
    const holder = new THREE.Object3D();
    holder.position.set(x, 0.1, z);
    holder.rotation.y = rng.range(0, Math.PI * 2);
    npcs.push({
      group: holder,
      kind,
      vel: new THREE.Vector3(),
      targetDir: new THREE.Vector3(rng.range(-1, 1), 0, rng.range(-1, 1)).normalize(),
      shootTimer: rng.range(0, SOLDIER_SHOOT_INTERVAL),
      runTimer: rng.range(0, 4),
      alive: true,
      walkPhase: rng.range(0, Math.PI * 2),
      recoilT: 0,
      swing: 0,
    });
  }

  /* ---- instanced gövdeler ---- */
  const count = Math.max(1, npcs.length);
  const meshes: THREE.InstancedMesh[] = PARTS.map((p) => {
    const im = new THREE.InstancedMesh(p.geo, npcMat, count);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // NPC'ler şehre yayılıyor; tek örnek küresi anlamsız — culling kapalı.
    im.frustumCulled = false;
    im.castShadow = false;
    im.receiveShadow = false;
    parent.add(im);
    return im;
  });

  // Renkler bir kez yazılır
  const tintColor = new THREE.Color();
  npcs.forEach((npc, i) => {
    const skin = npc.kind === "soldier" ? 0x3a3028 : 0x5a4a38;
    const cloth = npc.kind === "soldier" ? 0x2a2418 : rng.pick(CIVILIAN_CLOTHES);
    PARTS.forEach((p, pi) => {
      const c = p.tint === "skin" ? skin : p.tint === "cloth" ? cloth : 0x1a1410;
      meshes[pi]!.setColorAt(i, tintColor.setHex(c));
    });
  });
  for (const im of meshes) if (im.instanceColor) im.instanceColor.needsUpdate = true;

  parent.add(projectileGroup);

  const tmp = new THREE.Vector3();
  const rootM = new THREE.Matrix4();
  const localM = new THREE.Matrix4();
  const tM = new THREE.Matrix4();
  const outM = new THREE.Matrix4();
  const ZERO_M = new THREE.Matrix4().makeScale(0, 0, 0);

  /** Bir NPC'nin tüm parça matrislerini yazar. */
  const writeMatrices = (npc: Npc, i: number) => {
    if (!npc.alive) {
      for (const im of meshes) im.setMatrixAt(i, ZERO_M);
      return;
    }
    rootM.makeRotationY(npc.group.rotation.y);
    rootM.setPosition(npc.group.position);
    PARTS.forEach((p, pi) => {
      if (p.soldierOnly && npc.kind !== "soldier") {
        meshes[pi]!.setMatrixAt(i, ZERO_M);
        return;
      }
      let angle = 0;
      if (p.anim === "legL") angle = npc.swing;
      else if (p.anim === "legR") angle = -npc.swing;
      else if (p.anim === "armL") angle = -npc.swing * 0.6;
      else if (p.anim === "armR") angle = npc.recoilT > 0 ? -0.5 : npc.swing * 0.6;
      const rx = (p.rotX ?? 0) + angle;
      if (rx !== 0) {
        localM.makeRotationX(rx);
        localM.setPosition(p.pivot);
        if (p.offset.y !== 0) {
          tM.makeTranslation(p.offset.x, p.offset.y, p.offset.z);
          localM.multiply(tM);
        }
      } else {
        localM.makeTranslation(
          p.pivot.x + p.offset.x,
          p.pivot.y + p.offset.y,
          p.pivot.z + p.offset.z,
        );
      }
      outM.multiplyMatrices(rootM, localM);
      meshes[pi]!.setMatrixAt(i, outM);
    });
  };

  const spawnBullet = (from: THREE.Vector3, dir: THREE.Vector3) => {
    // Havuzdan sıradaki yuva — doluysa en eskisinin üzerine yazılır.
    const b = bullets[bulletIdx]!;
    bulletIdx = (bulletIdx + 1) % BULLET_POOL;
    b.active = true;
    b.mesh.visible = true;
    b.mesh.position.copy(from);
    b.mesh.position.y = 2.0;
    tmp.copy(b.mesh.position).add(dir);
    b.mesh.lookAt(tmp);
    b.vel.copy(dir).multiplyScalar(55);
    b.life = 3;
  };

  const update = (
    dt: number,
    dragonPos: THREE.Vector3 | null,
    _dragonFwd: THREE.Vector3,
    onHitDragon?: (damage: number) => void,
  ) => {
    for (let i = 0; i < npcs.length; i++) {
      const npc = npcs[i]!;
      if (!npc.alive) continue;

      if (npc.kind === "civilian") {
        // Sivil: ejderheden kaç, yoksa rastgele yürü
        npc.runTimer -= dt;
        if (npc.runTimer <= 0) {
          npc.targetDir.set(rng.range(-1, 1), 0, rng.range(-1, 1)).normalize();
          npc.runTimer = rng.range(1.5, 5);
        }

        if (dragonPos) {
          tmp.copy(npc.group.position).sub(dragonPos);
          const dist = tmp.length();
          if (dist < FLEE_DISTANCE) {
            // Ejderheden uzaklaş
            tmp.normalize();
            npc.targetDir.lerp(tmp, 0.8);
            npc.targetDir.normalize();
          }
        }

        // Yön değiştirme (yumuşak)
        const angle = Math.atan2(npc.targetDir.x, npc.targetDir.z);
        npc.group.rotation.y += (angle - npc.group.rotation.y) * Math.min(1, dt * 4);

        // Hareket — şehir sınırı içinde kal
        npc.vel.x += (npc.targetDir.x * CIVILIAN_SPEED - npc.vel.x) * Math.min(1, dt * 3);
        npc.vel.z += (npc.targetDir.z * CIVILIAN_SPEED - npc.vel.z) * Math.min(1, dt * 3);
        npc.group.position.x += npc.vel.x * dt;
        npc.group.position.z += npc.vel.z * dt;
        const dcx = npc.group.position.x - cx;
        const dcz = npc.group.position.z - cz;
        const dc = Math.hypot(dcx, dcz);
        if (dc > radius) {
          // Kaçan sivil haritadan sonsuza koşmasın: sur kenarında döner.
          npc.group.position.x = cx + (dcx / dc) * radius;
          npc.group.position.z = cz + (dcz / dc) * radius;
          npc.targetDir.set(-dcx / dc, 0, -dcz / dc);
        }

        // Bacak animasyonu — hıza bağlı faz birikimi
        const speed = Math.hypot(npc.vel.x, npc.vel.z);
        npc.walkPhase += speed * 0.8 * dt;
        npc.swing = Math.sin(npc.walkPhase) * 0.4;
      } else {
        // Asker: ejderhaya ateş et
        npc.shootTimer -= dt;

        // Ejderhaya bak
        if (dragonPos) {
          tmp.copy(dragonPos).sub(npc.group.position);
          tmp.y = 0;
          const angle = Math.atan2(tmp.x, tmp.z);
          npc.group.rotation.y += (angle - npc.group.rotation.y) * Math.min(1, dt * 5);
        }

        // Ateş et — yalnız menzildeyken (240 birim); tüm şehir ateş etmesin
        if (npc.shootTimer <= 0 && dragonPos) {
          npc.shootTimer = SOLDIER_SHOOT_INTERVAL + rng.range(-0.3, 0.3);
          tmp.copy(dragonPos).sub(npc.group.position);
          if (tmp.lengthSq() < 240 * 240) {
            tmp.normalize();
            tmp.y = 0.6;
            tmp.normalize();
            spawnBullet(npc.group.position, tmp);
            npc.recoilT = 0.15;
          }
        }
        if (npc.recoilT > 0) npc.recoilT -= dt;
        // Durma pozisyonu — bacaklar sönümlenir
        npc.swing *= 0.9;
      }

      writeMatrices(npc, i);
    }
    for (const im of meshes) im.instanceMatrix.needsUpdate = true;

    // Mermileri güncelle — havuz; ejderhaya isabet küçük ama gerçek hasar verir
    for (const b of bullets) {
      if (!b.active) continue;
      b.life -= dt;
      b.mesh.position.addScaledVector(b.vel, dt);
      b.vel.y -= 9.8 * dt;
      if (dragonPos && onHitDragon && b.mesh.position.distanceToSquared(dragonPos) < 3.5 * 3.5) {
        onHitDragon(2);
        b.active = false;
        b.mesh.visible = false;
        continue;
      }
      if (b.life <= 0 || b.mesh.position.y < 0) {
        b.active = false;
        b.mesh.visible = false;
      }
    }
  };

  // İlk kare: herkes yerine otursun (ölüler dahil)
  npcs.forEach((npc, i) => writeMatrices(npc, i));
  for (const im of meshes) im.instanceMatrix.needsUpdate = true;

  /** Belirli bir NPC'yi öldür — alev/şok/darbe hasarı için. */
  const kill = (npc: Npc) => {
    if (!npc.alive) return;
    npc.alive = false;
    const i = npcs.indexOf(npc);
    if (i >= 0) {
      for (const im of meshes) {
        im.setMatrixAt(i, ZERO_M);
        im.instanceMatrix.needsUpdate = true;
      }
    }
  };

  /** Öldürülen NPC konumunda ember efekti — combat.ts'den çağrılır. */
  const emitDeathFx = (
    pos: THREE.Vector3,
    fx: { ember(p: THREE.Vector3, count: number, spread: number): void },
  ) => {
    fx.ember(pos, 6, 3);
  };

  return {
    npcs,
    kill,
    emitDeathFx,
    projectiles: projectileGroup,
    update,
    dispose() {
      // PARTS geometrileri ve npcMat modül ömürlü/paylaşılan — dispose edilmez.
      for (const im of meshes) {
        parent.remove(im);
        im.dispose();
      }
      for (const b of bullets) projectileGroup.remove(b.mesh);
      bullets.length = 0;
      npcs.length = 0;
    },
  };
}
