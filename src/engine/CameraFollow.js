import * as THREE from 'three';

export class CameraFollow {
  constructor(camera, domElement, effects) {
    this.camera = camera;
    this.domElement = domElement;
    this.effects = effects;

    this.target = null; // Reference to Ship
    this.distance = 26.0;
    this.minDistance = 12.0;
    this.maxDistance = 55.0;
    this.height = 12.0;

    // Orbit angles relative to ship heading
    this.azimuth = 0; // Horizontal orbit offset
    this.elevation = 0.25; // Vertical orbit angle

    this.isDragging = false;
    this.prevMouseX = 0;
    this.prevMouseY = 0;

    this.currentCamPos = new THREE.Vector3(0, 20, 30);
    this.currentLookAt = new THREE.Vector3(0, 0, 0);

    this.setupListeners();
  }

  setTarget(ship) {
    this.target = ship;
    if (ship) {
      this.currentCamPos.copy(ship.position).add(new THREE.Vector3(0, this.height, this.distance));
      this.currentLookAt.copy(ship.position);
    }
  }

  setupListeners() {
    this.domElement.addEventListener('mousedown', (e) => {
      // Right click or left click drag to rotate camera
      if (e.button === 2 || e.button === 0) {
        this.isDragging = true;
        this.prevMouseX = e.clientX;
        this.prevMouseY = e.clientY;
      }
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.prevMouseX;
      const dy = e.clientY - this.prevMouseY;
      this.prevMouseX = e.clientX;
      this.prevMouseY = e.clientY;

      this.azimuth -= dx * 0.006;
      this.elevation = Math.max(-0.15, Math.min(1.15, this.elevation - dy * 0.005));
    });

    // Prevent context menu on right click
    this.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

    // Zoom
    this.domElement.addEventListener('wheel', (e) => {
      this.distance = Math.max(this.minDistance, Math.min(this.maxDistance, this.distance + e.deltaY * 0.03));
    }, { passive: true });
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

    // Desired camera angle = ship heading + player orbit azimuth
    const totalAngle = shipYaw + this.azimuth + Math.PI;

    // Spherical offset
    const hDist = this.distance * Math.cos(this.elevation);
    const vDist = this.distance * Math.sin(this.elevation) + this.height * 0.5;

    const targetPos = new THREE.Vector3(
      shipPos.x + Math.sin(totalAngle) * hDist,
      shipPos.y + Math.max(3.0, vDist),
      shipPos.z + Math.cos(totalAngle) * hDist
    );

    const lookTarget = shipPos.clone().add(new THREE.Vector3(0, 2.5, 0));

    // Smooth camera lag
    const lerpSpeed = Math.min(1.0, dt * 7.0);
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
