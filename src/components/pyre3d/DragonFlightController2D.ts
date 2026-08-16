import * as THREE from "three";

/**
 * 2.5D Side-Scroller Dragon Flight Controller — Three.js
 * ------------------------------------------------------
 * - X ekseni: otomatik ileri hareket (veya `autoForward: false` ile girdi kontrollü)
 * - Y ekseni: serbest yukarı/aşağı (dokunmatik/klavye girdisi)
 * - Z ekseni: sabit (isteğe bağlı dar paralaks aralığı)
 * - Görsel eğim: yukarı çıkarken burun yukarı, dalarken burun aşağı
 * - Kamera: yandan sabit ofsetle yumuşak takip
 *
 * Mevcut projedeki touch listener'larıyla (joystick/butonlar) çakışmaması
 * için global window touch event'i yerine `setVerticalInput()` kullanır.
 */
export type DragonFlightOptions2D = {
  forwardSpeed?: number;
  autoForward?: boolean;
  verticalSpeed?: number;
  verticalRange?: [number, number];
  depthRange?: [number, number];
  depthEnabled?: boolean;
  tiltAmount?: number;
  tiltSmoothing?: number;
  cameraOffset?: THREE.Vector3;
  cameraFollowSmoothing?: number;
  lookAhead?: number;
};

export default class DragonFlightController2D {
  mesh: THREE.Object3D;
  camera: THREE.PerspectiveCamera;
  forwardSpeed: number;
  autoForward: boolean;
  verticalSpeed: number;
  verticalRange: [number, number];
  depthRange: [number, number];
  depthEnabled: boolean;
  tiltAmount: number;
  tiltSmoothing: number;
  cameraOffset: THREE.Vector3;
  cameraFollowSmoothing: number;
  lookAhead: number;
  currentTilt = 0;
  private input = 0;

  constructor(
    mesh: THREE.Object3D,
    camera: THREE.PerspectiveCamera,
    options: DragonFlightOptions2D = {},
  ) {
    this.mesh = mesh;
    this.camera = camera;
    this.forwardSpeed = options.forwardSpeed ?? 8;
    this.autoForward = options.autoForward ?? true;
    this.verticalSpeed = options.verticalSpeed ?? 6;
    this.verticalRange = options.verticalRange ?? [-4, 4];
    this.depthRange = options.depthRange ?? [-1, 1];
    this.depthEnabled = options.depthEnabled ?? false;
    this.tiltAmount = options.tiltAmount ?? 0.35;
    this.tiltSmoothing = options.tiltSmoothing ?? 6;
    this.cameraOffset = options.cameraOffset ?? new THREE.Vector3(0, 1.5, 12);
    this.cameraFollowSmoothing = options.cameraFollowSmoothing ?? 4;
    this.lookAhead = options.lookAhead ?? 5;
  }

  /** -1 (aşağı) ile 1 (yukarı) arası dikey girdi. */
  setVerticalInput(v: number) {
    this.input = THREE.MathUtils.clamp(v, -1, 1);
  }

  update(deltaTime: number) {
    // 1) X ekseni: otomatik ileri veya girdi kontrollü
    if (this.autoForward) {
      this.mesh.position.x += this.forwardSpeed * deltaTime;
    } else {
      this.mesh.position.x += this.input * this.forwardSpeed * deltaTime;
    }

    // 2) Y ekseni: serbest yukarı/aşağı, sınırlar içinde
    this.mesh.position.y += this.input * this.verticalSpeed * deltaTime;
    this.mesh.position.y = THREE.MathUtils.clamp(
      this.mesh.position.y,
      this.verticalRange[0],
      this.verticalRange[1],
    );

    // 3) Z ekseni: isteğe bağlı hafif derinlik hareketi (paralaks)
    if (this.depthEnabled) {
      this.mesh.position.z = THREE.MathUtils.clamp(
        this.mesh.position.z,
        this.depthRange[0],
        this.depthRange[1],
      );
    }

    // 4) Görsel eğim: yukarıda burun yukarı, dalışta burun aşağı
    const targetTilt = this.input * this.tiltAmount;
    this.currentTilt = THREE.MathUtils.lerp(
      this.currentTilt,
      targetTilt,
      deltaTime * this.tiltSmoothing,
    );
    this.mesh.rotation.z = this.currentTilt;

    // 5) Kamera: yandan sabit ofsetle takip
    this._updateCamera(deltaTime);
  }

  private _updateCamera(deltaTime: number) {
    const desired = new THREE.Vector3(
      this.mesh.position.x + this.cameraOffset.x,
      this.mesh.position.y * 0.3 + this.cameraOffset.y,
      this.mesh.position.z + this.cameraOffset.z,
    );
    this.camera.position.lerp(desired, deltaTime * this.cameraFollowSmoothing);
    this.camera.lookAt(
      this.mesh.position.x + this.lookAhead,
      this.mesh.position.y,
      this.mesh.position.z,
    );
  }
}
