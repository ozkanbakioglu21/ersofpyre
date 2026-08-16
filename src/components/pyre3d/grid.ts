import type * as THREE from "three";

/**
 * Düzgün hücreli uzamsal karma (spatial hash).
 *
 * Yangın yayılma, alev konisi isabeti ve alev topu çarpışması eskiden her
 * karede tüm hedef dizisini tarıyordu: 78 yapıda katlanılabilirdi, ama Kül
 * Şehri'nde 800 binaya çıkıyor ve yayılma O(n²) oluyor. Sabit hücre boyutlu
 * ızgara sorguyu yerelleştiriyor.
 *
 * Hedefler sahne kurulumunda bir kez yerleştirilir ve yer değiştirmez;
 * yıkılanlar dizide kalır, çağıran taraf `dead` kontrolü yapar.
 */
export type Grid<T> = {
  readonly cell: number;
  insert(item: T, x: number, z: number): void;
  /** Yarıçap içindeki adayları `out` dizisine yazar ve onu döndürür. */
  query(x: number, z: number, radius: number, out: T[]): T[];
  clear(): void;
};

export function createGrid<T>(cell: number): Grid<T> {
  const buckets = new Map<number, T[]>();

  // Hücre koordinatını tek sayıya katlıyoruz. ±32k hücre (cell=24'te ±780k
  // birim) fazlasıyla yeter; string anahtar üretmekten çok daha ucuz.
  const key = (cx: number, cz: number) => ((cx + 32768) << 16) | (cz + 32768);

  return {
    cell,
    insert(item, x, z) {
      const k = key(Math.floor(x / cell), Math.floor(z / cell));
      const list = buckets.get(k);
      if (list) list.push(item);
      else buckets.set(k, [item]);
    },
    query(x, z, radius, out) {
      out.length = 0;
      const minX = Math.floor((x - radius) / cell);
      const maxX = Math.floor((x + radius) / cell);
      const minZ = Math.floor((z - radius) / cell);
      const maxZ = Math.floor((z + radius) / cell);
      for (let cx = minX; cx <= maxX; cx++) {
        for (let cz = minZ; cz <= maxZ; cz++) {
          const list = buckets.get(key(cx, cz));
          if (!list) continue;
          for (const it of list) out.push(it);
        }
      }
      return out;
    },
    clear() {
      buckets.clear();
    },
  };
}

/** Yatay (XZ) mesafe karesi — irtifa farkı yangın yayılmayı ilgilendirmiyor. */
export function dist2XZ(a: THREE.Vector3, b: THREE.Vector3): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}
