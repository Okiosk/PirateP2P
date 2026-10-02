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
    this.ballGeo = new THREE.SphereGeometry(0.38, 8, 8);
    this.ballMat = new THREE.MeshStandardMaterial({
      color: 0x222222,
      roughness: 0.35,
      metalness: 0.85
    });
  }

  spawnVolley(shooterId, cannonWorldPositions, directions, baseVel = new THREE.Vector3()) {
    const forwardVel = new THREE.Vector3(baseVel.x, 0, baseVel.z);

    cannonWorldPositions.forEach((pos, idx) => {
      // Crisp 16ms stagger for rapid rolling broadside
      setTimeout(() => {
        const dir = directions[idx].clone().setY(0).normalize();
        const speed = 72.0;

        // Position compensation for ship movement during stagger delay so shots never spawn behind
        const timeElapsed = (idx * 16) / 1000;
        const spawnPos = pos.clone().addScaledVector(forwardVel, timeElapsed);
        spawnPos.y = 2.4; // Fixed horizontal deck height

        // Visual cannonball mesh
        const mesh = new THREE.Mesh(this.ballGeo, this.ballMat);
        mesh.position.copy(spawnPos);
        mesh.castShadow = true;
        this.scene.add(mesh);

        // Muzzle blast visual & audio
        this.effects.createCannonBlast(spawnPos, dir);
        sounds.playCannon();

        // Velocity inherits ship forward momentum so balls travel alongside ship without lagging behind
        const vel = dir.clone().multiplyScalar(speed).add(forwardVel);

        const ball = {
          id: `${shooterId}_${Date.now()}_${idx}`,
          shooterId: shooterId,
          mesh: mesh,
          pos: spawnPos.clone(),
          vel: vel,
          speed: speed,
          velY: 0,
          launchY: 2.4,
          distTraveled: 0,
          flatRange: 145.0, // Stays at exact same height for 145 meters
          life: 4.5,
          trailTimer: 0
        };

        this.cannonballs.push(ball);
      }, idx * 16);
    });
  }

  // Spawn projectile replicated from peer network message
  spawnRemoteVolley(shooterId, shots, baseVel = new THREE.Vector3()) {
    const forwardVel = new THREE.Vector3(baseVel.x, 0, baseVel.z);

    shots.forEach((s, idx) => {
      setTimeout(() => {
        const timeElapsed = (idx * 16) / 1000;
        const dir = new THREE.Vector3(s.dir?.x || s.vel?.x || 1, 0, s.dir?.z || s.vel?.z || 0).normalize();
        const speed = 72.0;

        const spawnPos = new THREE.Vector3(s.pos.x, 2.4, s.pos.z).addScaledVector(forwardVel, timeElapsed);
        spawnPos.y = 2.4;

        const mesh = new THREE.Mesh(this.ballGeo, this.ballMat);
        mesh.position.copy(spawnPos);
        mesh.castShadow = true;
        this.scene.add(mesh);

        this.effects.createCannonBlast(spawnPos, dir);
        sounds.playCannon(spawnPos.distanceTo(window.__cameraPos || spawnPos));

        const vel = dir.clone().multiplyScalar(speed).add(forwardVel);

        this.cannonballs.push({
          id: s.id || `${shooterId}_rem_${Date.now()}_${idx}`,
          shooterId: shooterId,
          mesh: mesh,
          pos: spawnPos.clone(),
          vel: vel,
          speed: speed,
          velY: 0,
          launchY: 2.4,
          distTraveled: 0,
          flatRange: 145.0,
          life: 4.5,
          trailTimer: 0
        });
      }, idx * 16);
    });
  }

  update(dt, targets = [], onHitCallback = null) {
    for (let i = this.cannonballs.length - 1; i >= 0; i--) {
      const b = this.cannonballs[i];
      b.life -= dt;

      if (b.life <= 0) {
        this.removeBall(i);
        continue;
      }

      // 1. Move horizontally along total velocity vector (including ship momentum)
      b.pos.x += b.vel.x * dt;
      b.pos.z += b.vel.z * dt;
      // Distance traveled outward from ship
      b.distTraveled += b.speed * dt;

      // 2. Trajectory height:
      // Perfectly flat horizontal flight at constant deck height for 145m, then drops into the water
      if (b.distTraveled < b.flatRange) {
        b.pos.y = b.launchY;
        b.velY = 0;
      } else {
        b.velY -= 36.0 * dt;
        b.pos.y += b.velY * dt;
      }

      b.mesh.position.copy(b.pos);

      // Trailing smoke puff
      b.trailTimer += dt;
      if (b.trailTimer > 0.06) {
        b.trailTimer = 0;
      }

      // 3. Water collision (after dropping or reaching wave crest)
      const waterY = this.ocean.getWaveHeight(b.pos.x, b.pos.z);
      if (b.pos.y <= waterY) {
        this.effects.createWaterSplash(new THREE.Vector3(b.pos.x, waterY, b.pos.z));
        sounds.playSplash();
        this.removeBall(i);
        continue;
      }

      // 4. Island collision
      const islandHit = this.map.checkCollision(b.pos, 0.6);
      if (islandHit.collided) {
        this.effects.createWaterSplash(b.pos);
        this.removeBall(i);
        continue;
      }

      // 5. Target ship collisions
      let hitTarget = false;
      for (const target of targets) {
        if (!target || target.isDead) continue;
        if (target.id === b.shooterId) continue; // Don't shoot own ship

        const targetPos = target.mesh.position;
        // 2D cylindrical bounding volume for ship hull
        const dx = b.pos.x - targetPos.x;
        const dz = b.pos.z - targetPos.z;
        const dy = Math.abs(b.pos.y - targetPos.y);

        const hitRadius = target.hitRadius || 4.2;
        const hitHeight = target.hitHeight || 5.5;

        if (dx * dx + dz * dz < hitRadius * hitRadius && dy < hitHeight) {
          const dmg = 18 + Math.floor(Math.random() * 8); // 18-25 damage
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
