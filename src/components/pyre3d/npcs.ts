import * as THREE from "three";
import { cityMat, lanternMat } from "./materials";
import type { Rng } from "./rng";

/**
 * Şehir sakinleri — siviller ve askerler.
 *
 * Siviller kaçışır, askerler yukarı ateş eder. İkisi de basit kutu humanoid
 * geometrisi kullanır. Performans: max ~120 NPC, her karede tek döngü.
 */

export type NpcKind = "civilian" | "soldier";

type Npc = {
  group: THREE.Group;
  kind: NpcKind;
  vel: THREE.Vector3;
  targetDir: THREE.Vector3;
  shootTimer: number;
  runTimer: number;
  alive: boolean;
  /** Bacak animasyonu için referanslar */
  leftLeg: THREE.Mesh;
  rightLeg: THREE.Mesh;
  leftArm: THREE.Mesh;
  rightArm: THREE.Mesh;
  body: THREE.Mesh;
};

export type NpcHandle = {
  npcs: Npc[];
  kill(npc: Npc): void;
  emitDeathFx(pos: THREE.Vector3, fx: { ember(p: THREE.Vector3, count: number, spread: number): void }): void;
  projectiles: THREE.Group;
  update(dt: number, dragonPos: THREE.Vector3 | null, dragonFwd: THREE.Vector3): void;
  dispose(): void;
};

const MAX_NPC = 400;
const CIVILIAN_SPEED = 14;
const SOLDIER_SHOOT_INTERVAL = 2.2;
const FLEE_DISTANCE = 60;
const FLEE_FORCE = 28;

/** Basit humanoid geometri — baş, gövde, 2 bacak, 2 kol. */
function makeHumanoid(kind: NpcKind, rng: Rng): THREE.Group {
  const g = new THREE.Group();

  // Renge göre ayrım
  const skinColor = kind === "soldier" ? 0x3a3028 : 0x5a4a38;
  const clothColor = kind === "soldier" ? 0x2a2418 : rng.pick([0x4a3a28, 0x3a2a1e, 0x5a4030, 0x382818]);
  const clothMat = cityMat(clothColor);
  const skinMat = cityMat(skinColor);

  // Kafa
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), skinMat);
  head.position.y = 2.3;
  g.add(head);

  // Şapka / miğfer
  const hat = new THREE.Mesh(
    new THREE.BoxGeometry(kind === "soldier" ? 0.6 : 0.55, 0.2, 0.6),
    kind === "soldier" ? cityMat(0x1a1410) : cityMat(clothColor),
  );
  hat.position.y = 2.65;
  g.add(hat);

  // Gövde
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.9, 0.4), clothMat);
  body.position.y = 1.6;
  g.add(body);

  // Kollar
  const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.8, 0.22), clothMat);
  leftArm.position.set(-0.5, 1.65, 0);
  g.add(leftArm);

  const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.8, 0.22), clothMat);
  rightArm.position.set(0.5, 1.65, 0);
  g.add(rightArm);

  // Asker tüfeği
  if (kind === "soldier") {
    const rifle = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.08, 1.4),
      cityMat(0x2a1e14, 0.7, 0.4),
    );
    rifle.position.set(0.5, 1.9, 0.5);
    rifle.rotation.x = -0.6;
    g.add(rifle);
  }

  // Bacaklar
  const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.85, 0.28), cityMat(0x1a1410));
  leftLeg.position.set(-0.18, 0.6, 0);
  g.add(leftLeg);

  const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.85, 0.28), cityMat(0x1a1410));
  rightLeg.position.set(0.18, 0.6, 0);
  g.add(rightLeg);

  return g;
}

/** Yeni NPC oluştur. */
function createNpc(
  kind: NpcKind,
  x: number,
  z: number,
  y: number,
  rng: Rng,
): Npc {
  const group = makeHumanoid(kind, rng);
  group.position.set(x, y, z);
  group.rotation.y = rng.range(0, Math.PI * 2);
  const dir = new THREE.Vector3(rng.range(-1, 1), 0, rng.range(-1, 1)).normalize();
  return {
    group,
    kind,
    vel: new THREE.Vector3(),
    targetDir: dir,
    shootTimer: rng.range(0, SOLDIER_SHOOT_INTERVAL),
    runTimer: rng.range(0, 4),
    alive: true,
    leftLeg: group.children[4] as THREE.Mesh,
    rightLeg: group.children[5] as THREE.Mesh,
    leftArm: group.children[2] as THREE.Mesh,
    rightArm: group.children[3] as THREE.Mesh,
    body: group.children[1] as THREE.Mesh,
  };
}

/** Mermi — askerlerin ateş ettiği kurşun. */
const bulletGeo = new THREE.BoxGeometry(0.12, 0.12, 0.5);
const bulletMat = new THREE.MeshBasicMaterial({ color: 0xffd080 });

type Bullet = {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
};

export function createNpcSystem(
  parent: THREE.Object3D,
  rng: Rng,
  streetAt: (x: number, z: number) => boolean,
  cx: number,
  cz: number,
  radius: number,
): NpcHandle {
  const npcs: Npc[] = [];
  const npcGroup = new THREE.Group();
  const projectileGroup = new THREE.Group();
  const bullets: Bullet[] = [];

  // Sokaklara NPC yerleştir
  const placeCount = Math.min(MAX_NPC, Math.floor(radius / 1.8));
  for (let i = 0; i < placeCount; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(radius * 0.15, radius * 0.95);
    const x = cx + Math.cos(a) * r;
    const z = cz + Math.sin(a) * r;
    if (!streetAt(x, z)) continue;

    const kind: NpcKind = rng.chance(0.75) ? "soldier" : "civilian";
    const npc = createNpc(kind, x, 0.1, z, rng);
    // Yer yüksekliği
    npc.group.position.y = 0.1;
    npcs.push(npc);
    npcGroup.add(npc.group);
  }

  parent.add(npcGroup);
  parent.add(projectileGroup);

  const tmp = new THREE.Vector3();

  const update = (dt: number, dragonPos: THREE.Vector3 | null, _dragonFwd: THREE.Vector3) => {
    for (const npc of npcs) {
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
        const current = npc.group.rotation.y;
        const diff = angle - current;
        npc.group.rotation.y += diff * Math.min(1, dt * 4);

        // Hareket
        npc.vel.x += (npc.targetDir.x * CIVILIAN_SPEED - npc.vel.x) * Math.min(1, dt * 3);
        npc.vel.z += (npc.targetDir.z * CIVILIAN_SPEED - npc.vel.z) * Math.min(1, dt * 3);
        npc.group.position.x += npc.vel.x * dt;
        npc.group.position.z += npc.vel.z * dt;

        // Bacak animasyonı
        const speed = Math.hypot(npc.vel.x, npc.vel.z);
        const legSwing = Math.sin(Date.now() * 0.008 * speed) * 0.4;
        if (npc.leftLeg) npc.leftLeg.rotation.x = legSwing;
        if (npc.rightLeg) npc.rightLeg.rotation.x = -legSwing;
        if (npc.leftArm) npc.leftArm.rotation.x = -legSwing * 0.6;
        if (npc.rightArm) npc.rightArm.rotation.x = legSwing * 0.6;
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

        // Ateş et
        if (npc.shootTimer <= 0 && dragonPos) {
          npc.shootTimer = SOLDIER_SHOOT_INTERVAL + rng.range(-0.3, 0.3);

          // Mermi yönü: ejderhaya doğru + yukarı
          const dir = new THREE.Vector3()
            .subVectors(dragonPos, npc.group.position)
            .normalize();
          dir.y = 0.6; // Yukarı eğim
          dir.normalize();

          const mesh = new THREE.Mesh(bulletGeo, bulletMat);
          mesh.position.copy(npc.group.position);
          mesh.position.y = 2.0;
          mesh.lookAt(mesh.position.clone().add(dir));
          projectileGroup.add(mesh);

          bullets.push({
            mesh,
            vel: dir.multiplyScalar(55),
            life: 3,
          });

          // Tüfek geri tepme
          if (npc.rightArm) {
            npc.rightArm.rotation.x = -0.5;
            setTimeout(() => {
              if (npc.rightArm) npc.rightArm.rotation.x = 0;
            }, 150);
          }
        }

        // Durma pozisyonu — bacaklar sabit
        if (npc.leftLeg) npc.leftLeg.rotation.x *= 0.9;
        if (npc.rightLeg) npc.rightLeg.rotation.x *= 0.9;
      }
    }

    // Mermileri güncelle
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i]!;
      b.life -= dt;
      b.mesh.position.addScaledVector(b.vel, dt);
      b.vel.y -= 9.8 * dt;
      if (b.life <= 0 || b.mesh.position.y < 0) {
        projectileGroup.remove(b.mesh);
        b.mesh.geometry.dispose();
        bullets.splice(i, 1);
      }
    }
  };

  /** Belirli bir NPC'yi öldür — alev/şok/darbe hasarı için. */
  const kill = (npc: Npc) => {
    if (!npc.alive) return;
    npc.alive = false;
    npc.group.visible = false;
  };

  /** Öldürülen NPC konumunda ember efekti — combat.ts'den çağrılır. */
  const emitDeathFx = (pos: THREE.Vector3, fx: { ember(p: THREE.Vector3, count: number, spread: number): void }) => {
    fx.ember(pos, 6, 3);
  };

  return {
    npcs,
    kill,
    emitDeathFx,
    projectiles: projectileGroup,
    update,
    dispose() {
      npcGroup.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          const m = o as THREE.Mesh;
          if (m.geometry) m.geometry.dispose();
        }
      });
      for (const b of bullets) {
        projectileGroup.remove(b.mesh);
        b.mesh.geometry.dispose();
      }
      bullets.length = 0;
      npcs.length = 0;
    },
  };
}
