import * as THREE from 'three';

export class EffectsManager {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.particles = [];
    this.floatingTexts = [];
    this.shakeIntensity = 0;
    this.shakeDecay = 4.0;

    // Shared geometries and materials for cartoon performance
    this.smokeGeo = new THREE.DodecahedronGeometry(0.5, 1);
    this.splinterGeo = new THREE.BoxGeometry(0.15, 0.4, 0.15);
    this.splashGeo = new THREE.DodecahedronGeometry(0.3, 1);

    this.smokeMat = new THREE.MeshStandardMaterial({
      color: 0xeeeeee,
      roughness: 0.9,
      flatShading: true,
      transparent: true,
      opacity: 0.8
    });

    this.flashMat = new THREE.MeshBasicMaterial({
      color: 0xffaa22,
      transparent: true,
      opacity: 0.95
    });

    this.woodMat = new THREE.MeshStandardMaterial({
      color: 0x8b5a2b,
      roughness: 0.8,
      flatShading: true
    });

    this.splashMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.2,
      transparent: true,
      opacity: 0.85
    });

    this.goldMat = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      emissive: 0xffaa00,
      emissiveIntensity: 0.6,
      roughness: 0.3
    });
  }

  // Cannon muzzle blast & smoke
  createCannonBlast(pos, dir) {
    // 1. Muzzle Flash
    const flash = new THREE.Mesh(this.smokeGeo, this.flashMat.clone());
    flash.position.copy(pos).addScaledVector(dir, 0.8);
    flash.scale.setScalar(1.2);
    this.scene.add(flash);

    this.particles.push({
      mesh: flash,
      vel: dir.clone().multiplyScalar(2),
      life: 0.1,
      maxLife: 0.1,
      scaleRate: 8,
      fade: true
    });

    // 2. Smoke puffs (several cartoon cloud puffs)
    for (let i = 0; i < 6; i++) {
      const p = new THREE.Mesh(this.smokeGeo, this.smokeMat.clone());
      p.position.copy(pos).add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.6,
        (Math.random() - 0.5) * 0.4,
        (Math.random() - 0.5) * 0.6
      ));
      const initialScale = 0.5 + Math.random() * 0.6;
      p.scale.setScalar(initialScale);
      this.scene.add(p);

      const spreadDir = dir.clone().add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.7,
        Math.random() * 0.5,
        (Math.random() - 0.5) * 0.7
      )).normalize();

      this.particles.push({
        mesh: p,
        vel: spreadDir.multiplyScalar(3.0 + Math.random() * 4.0),
        drag: 0.92,
        life: 0.8 + Math.random() * 0.5,
        maxLife: 1.2,
        scaleRate: 2.5,
        fade: true
      });
    }
  }

  // Water splash when cannonball misses
  createWaterSplash(pos) {
    // Water droplets ring
    for (let i = 0; i < 10; i++) {
      const p = new THREE.Mesh(this.splashGeo, this.splashMat.clone());
      p.position.copy(pos);
      p.scale.setScalar(0.4 + Math.random() * 0.5);
      this.scene.add(p);

      const angle = (i / 10) * Math.PI * 2 + Math.random() * 0.2;
      const speed = 2.0 + Math.random() * 3.5;
      const vel = new THREE.Vector3(
        Math.cos(angle) * speed,
        4.0 + Math.random() * 4.0,
        Math.sin(angle) * speed
      );

      this.particles.push({
        mesh: p,
        vel: vel,
        gravity: -16.0,
        life: 0.7,
        maxLife: 0.7,
        scaleRate: -0.4,
        fade: true
      });
    }

    // Ripple ring on water
    const ringGeo = new THREE.RingGeometry(0.3, 1.2, 16);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.copy(pos);
    ring.position.y += 0.05;
    this.scene.add(ring);

    this.particles.push({
      mesh: ring,
      vel: new THREE.Vector3(0, 0, 0),
      scaleRate: 4.5,
      life: 0.6,
      maxLife: 0.6,
      fade: true
    });
  }

  // Wood splinters when a ship is hit
  createShipHit(pos, damage = 25) {
    this.addScreenShake(0.35);

    // Wood fragments
    for (let i = 0; i < 12; i++) {
      const p = new THREE.Mesh(this.splinterGeo, this.woodMat.clone());
      p.position.copy(pos).add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.5,
        Math.random() * 0.5,
        (Math.random() - 0.5) * 0.5
      ));
      p.scale.setScalar(0.6 + Math.random() * 0.8);
      p.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      this.scene.add(p);

      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 8.0,
        3.0 + Math.random() * 6.0,
        (Math.random() - 0.5) * 8.0
      );

      this.particles.push({
        mesh: p,
        vel: vel,
        gravity: -18.0,
        rotSpeed: new THREE.Vector3(Math.random() * 10, Math.random() * 10, 0),
        life: 0.9,
        maxLife: 0.9,
        scaleRate: -0.3,
        fade: true
      });
    }

    // Fire & smoke impact
    for (let i = 0; i < 4; i++) {
      const p = new THREE.Mesh(this.smokeGeo, (i % 2 === 0 ? this.flashMat : this.smokeMat).clone());
      p.position.copy(pos);
      p.scale.setScalar(0.7);
      this.scene.add(p);

      this.particles.push({
        mesh: p,
        vel: new THREE.Vector3((Math.random() - 0.5) * 2, 2.5 + Math.random() * 2, (Math.random() - 0.5) * 2),
        life: 0.5,
        maxLife: 0.5,
        scaleRate: 2.0,
        fade: true
      });
    }

    // Floating damage text
    this.spawnFloatingText(`-${damage}`, pos, '#ff3838');
  }

  // Floating treasure / heal pickup sparkles
  createLootEffect(pos, text = "+50 Or", color = "#ffdd44") {
    for (let i = 0; i < 14; i++) {
      const p = new THREE.Mesh(this.splashGeo, this.goldMat.clone());
      p.position.copy(pos).add(new THREE.Vector3(
        (Math.random() - 0.5) * 1.5,
        Math.random() * 0.5,
        (Math.random() - 0.5) * 1.5
      ));
      p.scale.setScalar(0.3 + Math.random() * 0.3);
      this.scene.add(p);

      this.particles.push({
        mesh: p,
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 4,
          3.0 + Math.random() * 4.0,
          (Math.random() - 0.5) * 4
        ),
        gravity: -6.0,
        life: 0.8,
        maxLife: 0.8,
        scaleRate: -0.2,
        fade: true
      });
    }

    this.spawnFloatingText(text, pos, color);
  }

  // Ship wake foam at the stern/bow
  createWakeFoam(pos, velDir) {
    if (Math.random() > 0.45) return;
    const p = new THREE.Mesh(this.splashGeo, this.splashMat.clone());
    p.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 0, (Math.random() - 0.5) * 0.8));
    p.scale.setScalar(0.4 + Math.random() * 0.4);
    this.scene.add(p);

    this.particles.push({
      mesh: p,
      vel: velDir.clone().multiplyScalar(-0.5).add(new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.1, (Math.random() - 0.5) * 0.5)),
      life: 0.6,
      maxLife: 0.6,
      scaleRate: 1.5,
      fade: true
    });
  }

  spawnFloatingText(text, worldPos, color = '#ffffff') {
    const el = document.createElement('div');
    el.className = 'floating-dmg';
    el.textContent = text;
    el.style.color = color;
    document.body.appendChild(el);

    this.floatingTexts.push({
      element: el,
      pos: worldPos.clone().add(new THREE.Vector3(0, 2.5, 0)),
      life: 1.2,
      maxLife: 1.2
    });
  }

  addScreenShake(intensity = 0.3) {
    this.shakeIntensity = Math.min(1.0, this.shakeIntensity + intensity);
  }

  getShakeOffset() {
    if (this.shakeIntensity <= 0.001) return new THREE.Vector3();
    const s = this.shakeIntensity * 0.6;
    return new THREE.Vector3(
      (Math.random() - 0.5) * s,
      (Math.random() - 0.5) * s,
      (Math.random() - 0.5) * s
    );
  }

  update(dt) {
    // Shake decay
    if (this.shakeIntensity > 0) {
      this.shakeIntensity = Math.max(0, this.shakeIntensity - this.shakeDecay * dt);
    }

    // Update 3D particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;

      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        if (p.mesh.material.dispose) p.mesh.material.dispose();
        this.particles.splice(i, 1);
        continue;
      }

      // Physics
      if (p.drag) p.vel.multiplyScalar(p.drag);
      if (p.gravity) p.vel.y += p.gravity * dt;
      p.mesh.position.addScaledVector(p.vel, dt);

      // Scale
      if (p.scaleRate) {
        const sc = Math.max(0.01, p.mesh.scale.x + p.scaleRate * dt);
        p.mesh.scale.setScalar(sc);
      }

      // Rotation
      if (p.rotSpeed) {
        p.mesh.rotation.x += p.rotSpeed.x * dt;
        p.mesh.rotation.y += p.rotSpeed.y * dt;
      }

      // Fade
      if (p.fade && p.mesh.material) {
        const alpha = Math.max(0, p.life / p.maxLife);
        p.mesh.material.opacity = alpha * 0.9;
      }
    }

    // Update 2D floating texts
    const tempVec = new THREE.Vector3();
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.life -= dt;

      if (ft.life <= 0) {
        if (ft.element.parentNode) ft.element.parentNode.removeChild(ft.element);
        this.floatingTexts.splice(i, 1);
        continue;
      }

      // Float upwards
      ft.pos.y += 1.8 * dt;

      // Project to 2D screen
      tempVec.copy(ft.pos).project(this.camera);
      // If behind camera, hide
      if (tempVec.z > 1) {
        ft.element.style.display = 'none';
        continue;
      }

      const x = (tempVec.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-(tempVec.y * 0.5) + 0.5) * window.innerHeight;

      ft.element.style.display = 'block';
      ft.element.style.left = `${x}px`;
      ft.element.style.top = `${y}px`;
      ft.element.style.opacity = `${ft.life / ft.maxLife}`;
      ft.element.style.transform = `translate(-50%, -50%) scale(${1 + (1 - ft.life / ft.maxLife) * 0.4})`;
    }
  }

  clear() {
    this.particles.forEach(p => {
      this.scene.remove(p.mesh);
    });
    this.particles = [];
    this.floatingTexts.forEach(ft => {
      if (ft.element.parentNode) ft.element.parentNode.removeChild(ft.element);
    });
    this.floatingTexts = [];
  }
}
