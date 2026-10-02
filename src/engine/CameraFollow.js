import * as THREE from 'three';

export class CameraFollow {
  constructor(camera, domElement, effects) {
    this.camera = camera;
    this.domElement = domElement;
    this.effects = effects;

    this.target = null; // Reference to Ship

    // Fixed 3rd person bird's eye / high angle (vue en plongée) parameters
    this.distance = 28.0; // Horizontal distance behind ship
    this.height = 20.0;   // Height above water (plongée / vue du dessus)
    this.lookAhead = 5.0; // Look-at point ahead of ship

    this.currentCamPos = new THREE.Vector3(0, 20, -30);
    this.currentLookAt = new THREE.Vector3(0, 0, 0);

    // Prevent context menu on right click so right click shooting works smoothly
    this.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  setTarget(ship) {
    this.target = ship;
    if (ship) {
      const forward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), ship.yaw);
      this.currentCamPos.copy(ship.position)
        .addScaledVector(forward, -this.distance)
        .add(new THREE.Vector3(0, this.height, 0));
      this.currentLookAt.copy(ship.position)
        .addScaledVector(forward, this.lookAhead)
        .add(new THREE.Vector3(0, 1.5, 0));
    }
  }

  update(dt) {
    if (!this.target) return;

    const shipPos = this.target.mesh.position;
    const shipYaw = this.target.yaw;

    // Dynamic FOV for speed boost
    const targetFOV = (this.target.isBoosting ? 70 : 58);
    if (Math.abs(this.camera.fov - targetFOV) > 0.1) {
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFOV, dt * 5.0);
      this.camera.updateProjectionMatrix();
    }

    // Fixed 3rd person high angle (vue en plongée) directly aligned with ship heading
    const forward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), shipYaw);

    const targetPos = shipPos.clone()
      .addScaledVector(forward, -this.distance)
      .add(new THREE.Vector3(0, this.height, 0));

    const lookTarget = shipPos.clone()
      .addScaledVector(forward, this.lookAhead)
      .add(new THREE.Vector3(0, 1.5, 0));

    // Smooth camera lag
    const lerpSpeed = Math.min(1.0, dt * 8.0);
    this.currentCamPos.lerp(targetPos, lerpSpeed);
    this.currentLookAt.lerp(lookTarget, lerpSpeed);

    // Apply screen shake offset
    const shake = this.effects.getShakeOffset();

    this.camera.position.copy(this.currentCamPos).add(shake);
    this.camera.lookAt(this.currentLookAt);

    // Store for spatial sound
    window.__cameraPos = this.camera.position;
  }
}
