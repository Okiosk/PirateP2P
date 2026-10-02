import * as THREE from 'three';
import { assets } from '../engine/AssetLoader.js';
import { sounds } from '../engine/Audio.js';

export class ProjectileManager {
  constructor(scene, ocean, effects, map) {
    this.scene = scene;
    this.ocean = ocean;
    this.effects = effects;
    this.map = map;
    this.cannonballs = [];
    this.ballGeo = new THREE.SphereGeometry(0.35, 8, 8);
    this.ballMat = new THREE.MeshStandardMaterial({
      color: 0x222222,
      roughness: 0.4,
      metalness: 0.8
    });
  }

  spawnVolley(shooterId, cannonWorldPositions, directions, baseVel = new THREE.Vector3()) {
    const shotsData = [];

    cannonWorldPositions.forEach((pos, idx) => {
      // Stagger slightly for classic rolling pirate broadside
      setTimeout(() => {
        const dir = directions[idx];
        const speed = 48.0;

        // Ballistic velocity with upward loft
        const vel = dir.clone().multiplyScalar(speed)
          .add(baseVel.clone().multiplyScalar(0.4));
        vel.y = 7.5 + Math.random() * 2.0;

        // Visual cannonball mesh
        const mesh = new THREE.Mesh(this.ballGeo, this.ballMat);
        mesh.position.copy(pos);
        mesh.castShadow = true;
        this.scene.add(mesh);

        // Muzzle blast visual & audio
        this.effects.createCannonBlast(pos, dir);
        sounds.playCannon();

        const ball = {
          id: `${shooterId}_${Date.now()}_${idx}`,
          shooterId: shooterId,
          mesh: mesh,
          pos: pos.clone(),
          vel: vel,
          life: 3.5,
          trailTimer: 0
        };

        this.cannonballs.push(ball);
      }, idx * 110); // 110ms delay between cannon shots
    });
  }

  // Spawn projectile replicated from peer network message
  spawnRemoteVolley(shooterId, shots) {
    shots.forEach((s, idx) => {
      setTimeout(() => {
        const mesh = new THREE.Mesh(this.ballGeo, this.ballMat);
        const pos = new THREE.Vector3(s.pos.x, s.pos.y, s.pos.z);
        const vel = new THREE.Vector3(s.vel.x, s.vel.y, s.vel.z);
        mesh.position.copy(pos);
        mesh.castShadow = true;
        this.scene.add(mesh);

        const dir = vel.clone().normalize();
        this.effects.createCannonBlast(pos, dir);
        sounds.playCannon(pos.distanceTo(window.__cameraPos || pos));

        this.cannonballs.push({
          id: s.id || `${shooterId}_rem_${Date.now()}_${idx}`,
          shooterId: shooterId,
          mesh: mesh,
          pos: pos,
          vel: vel,
          life: 3.5,
          trailTimer: 0
        });
      }, idx * 110);
    });
  }

  update(dt, targets = [], onHitCallback = null) {
    const gravity = -20.0;

    for (let i = this.cannonballs.length - 1; i >= 0; i--) {
      const b = this.cannonballs[i];
      b.life -= dt;

      if (b.life <= 0) {
        this.removeBall(i);
        continue;
      }

      // Physics
      b.vel.y += gravity * dt;
      b.pos.addScaledVector(b.vel, dt);
      b.mesh.position.copy(b.pos);

      // Trailing smoke
      b.trailTimer += dt;
      if (b.trailTimer > 0.05) {
        b.trailTimer = 0;
        // Light smoke puff behind cannonball
        // Handled subtly by effects if needed
      }

      // 1. Water collision
      const waterY = this.ocean.getWaveHeight(b.pos.x, b.pos.z);
      if (b.pos.y <= waterY) {
        this.effects.createWaterSplash(new THREE.Vector3(b.pos.x, waterY, b.pos.z));
        sounds.playSplash();
        this.removeBall(i);
        continue;
      }

      // 2. Island collision
      const islandHit = this.map.checkCollision(b.pos, 0.5);
      if (islandHit.collided) {
        this.effects.createWaterSplash(b.pos);
        this.removeBall(i);
        continue;
      }

      // 3. Target ship collisions
      let hitTarget = false;
      for (const target of targets) {
        if (!target || target.isDead) continue;
        if (target.id === b.shooterId) continue; // Don't shoot own ship

        const targetPos = target.mesh.position;
        // 2D distance for ship hull cylinder
        const dx = b.pos.x - targetPos.x;
        const dz = b.pos.z - targetPos.z;
        const dy = Math.abs(b.pos.y - targetPos.y);

        const hitRadius = target.hitRadius || 3.8;
        const hitHeight = target.hitHeight || 4.5;

        if (dx * dx + dz * dz < hitRadius * hitRadius && dy < hitHeight) {
          const dmg = 25 + Math.floor(Math.random() * 8); // 25-32 damage
          this.effects.createShipHit(b.pos, dmg);
          sounds.playHit();

          if (onHitCallback) {
            onHitCallback(target, dmg, b.shooterId);
          } else if (target.takeDamage) {
            target.takeDamage(dmg, b.shooterId);
          }

          this.removeBall(i);
          hitTarget = true;
          break;
        }
      }

      if (hitTarget) continue;
    }
  }

  removeBall(index) {
    const b = this.cannonballs[index];
    this.scene.remove(b.mesh);
    this.cannonballs.splice(index, 1);
  }

  clear() {
    this.cannonballs.forEach(b => {
      this.scene.remove(b.mesh);
    });
    this.cannonballs = [];
  }
}
