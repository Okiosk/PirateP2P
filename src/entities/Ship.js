import * as THREE from 'three';
import { assets } from '../engine/AssetLoader.js';
import { sounds } from '../engine/Audio.js';

export const SHIP_TYPES = {
  galleon: {
    name: 'Galion Pirate',
    model: 'ship-pirate-medium',
    scale: 2.2,
    maxHp: 100,
    speed: 20.0,
    turnSpeed: 1.3,
    cannonsPerSide: 3,
    reloadTime: 2.4,
    hitRadius: 4.2
  },
  brigantine: {
    name: 'Brigantin Royal',
    model: 'ship-medium',
    scale: 2.2,
    maxHp: 100,
    speed: 21.0,
    turnSpeed: 1.4,
    cannonsPerSide: 3,
    reloadTime: 2.2,
    hitRadius: 4.2
  },
  sloop: {
    name: 'Sloop Rapide',
    model: 'ship-pirate-small',
    scale: 2.4,
    maxHp: 80,
    speed: 25.0,
    turnSpeed: 1.8,
    cannonsPerSide: 2,
    reloadTime: 1.8,
    hitRadius: 3.5
  },
  ghost: {
    name: 'Hollandais Volant',
    model: 'ship-ghost',
    scale: 2.3,
    maxHp: 120,
    speed: 19.0,
    turnSpeed: 1.2,
    cannonsPerSide: 3,
    reloadTime: 2.5,
    hitRadius: 4.4
  }
};

export class Ship {
  constructor(id, name, typeKey = 'galleon', scene, ocean, effects, isLocal = false) {
    this.id = id;
    this.name = name;
    this.typeKey = typeKey;
    this.config = SHIP_TYPES[typeKey] || SHIP_TYPES.galleon;
    this.scene = scene;
    this.ocean = ocean;
    this.effects = effects;
    this.isLocal = isLocal;

    // Movement & Physics
    this.position = new THREE.Vector3(0, 0, 0);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.yaw = 0; // Heading in radians
    this.angularVelocity = 0;
    this.roll = 0; // Wave + turn tilt
    this.pitch = 0; // Wave pitch
    this.throttle = 0; // -0.5 (reverse) to 1.0 (full sail)
    this.steering = 0; // -1 (left) to 1 (right)

    // Combat Stats
    this.maxHp = this.config.maxHp;
    this.hp = this.maxHp;
    this.isDead = false;
    this.sinkTimer = 0;
    this.respawnTimer = 0;
    this.score = 0;
    this.gold = 0;

    // Reload timers
    this.leftCooldown = 0;
    this.rightCooldown = 0;

    // Hit dimensions
    this.hitRadius = this.config.hitRadius;
    this.hitHeight = 5.0;

    // Create 3D Mesh
    this.mesh = new THREE.Group();
    this.model = assets.getModel(this.config.model);
    this.model.scale.setScalar(this.config.scale);
    this.mesh.add(this.model);

    // Create 3D Floating Name & Health Bar billboard above ship
    this.billboard = this.createBillboard();
    this.mesh.add(this.billboard);

    this.scene.add(this.mesh);
  }

  createBillboard() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    this.billboardCtx = canvas.getContext('2d');
    this.billboardTexture = new THREE.CanvasTexture(canvas);
    this.billboardTexture.minFilter = THREE.LinearFilter;

    const spriteMat = new THREE.SpriteMaterial({
      map: this.billboardTexture,
      transparent: true,
      depthTest: false
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.set(0, 6.5, 0);
    sprite.scale.set(6.0, 1.5, 1.0);
    this.updateBillboard();
    return sprite;
  }

  updateBillboard() {
    if (!this.billboardCtx) return;
    const ctx = this.billboardCtx;
    const w = 256;
    const h = 64;

    ctx.clearRect(0, 0, w, h);

    // Background pill
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.beginPath();
    ctx.roundRect(10, 4, w - 20, h - 8, 8);
    ctx.fill();
    ctx.strokeStyle = this.isLocal ? '#38ef7d' : '#e74c3c';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Player Name
    ctx.font = 'bold 20px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(this.name, w / 2, 28);

    // HP Bar background
    const barX = 26;
    const barY = 36;
    const barW = w - 52;
    const barH = 12;

    ctx.fillStyle = '#333333';
    ctx.fillRect(barX, barY, barW, barH);

    // HP Bar fill
    const pct = Math.max(0, this.hp / this.maxHp);
    const hpColor = pct > 0.5 ? '#2ecc71' : pct > 0.25 ? '#f39c12' : '#e74c3c';
    ctx.fillStyle = hpColor;
    ctx.fillRect(barX, barY, barW * pct, barH);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barW, barH);

    this.billboardTexture.needsUpdate = true;
  }

  setInputs(forward, backward, left, right) {
    if (this.isDead) {
      this.throttle = 0;
      this.steering = 0;
      return;
    }

    let targetThrottle = 0;
    if (forward) targetThrottle += 1.0;
    if (backward) targetThrottle -= 0.5;
    this.throttle = targetThrottle;

    let targetSteer = 0;
    if (left) targetSteer -= 1.0; // Left turn (towards -X)
    if (right) targetSteer += 1.0; // Right turn (towards +X)
    this.steering = targetSteer;
  }

  takeDamage(amount, attackerId) {
    if (this.isDead) return;

    this.hp = Math.max(0, this.hp - amount);
    this.updateBillboard();

    // Damage flash
    this.flashRed();

    if (this.hp <= 0) {
      this.sink(attackerId);
    }
  }

  heal(amount) {
    if (this.isDead) return;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    this.updateBillboard();
    sounds.playLoot();
    this.effects.createLootEffect(this.position, `+${amount} Réparation`, '#2ecc71');
  }

  addGold(amount) {
    this.gold += amount;
    this.score += amount;
    sounds.playLoot();
    this.effects.createLootEffect(this.position, `+${amount} Or`, '#f1c40f');
  }

  flashRed() {
    this.model.traverse((child) => {
      if (child.isMesh && child.material) {
        const origColor = child.material.color.clone();
        child.material.color.setHex(0xff3333);
        setTimeout(() => {
          if (child.material) child.material.color.copy(origColor);
        }, 120);
      }
    });
  }

  sink(attackerId) {
    this.isDead = true;
    this.sinkTimer = 3.5;
    this.respawnTimer = 4.0;
    sounds.playSink();
    sounds.playBell();

    if (this.onSink) {
      this.onSink(this.id, attackerId);
    }
  }

  respawn(spawnPos = new THREE.Vector3(0, 0, 0)) {
    this.isDead = false;
    this.hp = this.maxHp;
    this.position.copy(spawnPos);
    this.velocity.set(0, 0, 0);
    this.throttle = 0;
    this.steering = 0;
    this.mesh.rotation.set(0, this.yaw, 0);
    this.updateBillboard();
    this.effects.createWaterSplash(this.position);
  }

  getCannonWorldPositions(side) {
    // side: 'left' (port) or 'right' (starboard)
    const positions = [];
    const directions = [];
    const count = this.config.cannonsPerSide;

    const forward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);

    const sign = side === 'left' ? -1 : 1;
    const cannonDir = right.clone().multiplyScalar(sign);

    const spacing = 1.6;
    const startZ = -((count - 1) * spacing) / 2;

    for (let i = 0; i < count; i++) {
      const zOffset = startZ + i * spacing;
      const pos = this.position.clone()
        .add(forward.clone().multiplyScalar(zOffset)) // Local Z
        .add(right.clone().multiplyScalar(sign * 2.2)); // Local X (ship flank)
      pos.y += 1.2; // Deck height

      positions.push(pos);
      directions.push(cannonDir);
    }

    return { positions, directions };
  }

  canFire(side) {
    if (this.isDead) return false;
    return side === 'left' ? this.leftCooldown <= 0 : this.rightCooldown <= 0;
  }

  fire(side, projectileManager) {
    if (!this.canFire(side)) return false;

    if (side === 'left') {
      this.leftCooldown = this.config.reloadTime;
    } else {
      this.rightCooldown = this.config.reloadTime;
    }

    const { positions, directions } = this.getCannonWorldPositions(side);
    projectileManager.spawnVolley(this.id, positions, directions, this.velocity);

    // Ship recoil impulse (rocking in opposite direction of fire)
    const recoilRoll = (side === 'left' ? 1 : -1) * 0.12;
    this.roll += recoilRoll;

    return { side, positions, directions };
  }

  update(dt, map) {
    // Handle Reload Cooldowns
    if (this.leftCooldown > 0) this.leftCooldown = Math.max(0, this.leftCooldown - dt);
    if (this.rightCooldown > 0) this.rightCooldown = Math.max(0, this.rightCooldown - dt);

    // Handle Sinking
    if (this.isDead) {
      if (this.sinkTimer > 0) {
        this.sinkTimer -= dt;
        // Slowly sink stern first and roll over
        this.position.y -= 1.8 * dt;
        this.pitch -= 0.25 * dt;
        this.roll += 0.3 * dt;
        this.mesh.position.copy(this.position);
        this.mesh.rotation.set(this.pitch, this.yaw, this.roll);

        if (Math.random() < 0.2) {
          this.effects.createWaterSplash(this.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2)));
        }
      }
      return;
    }

    // Steering & Angular velocity
    const targetTurnRate = this.steering * this.config.turnSpeed;
    const speedRatio = this.velocity.length() / (this.config.speed || 1);
    // Ship turns better with water flowing past the rudder
    const effectiveTurnFactor = Math.max(0.3, Math.min(1.0, speedRatio + 0.2));
    this.angularVelocity = THREE.MathUtils.lerp(this.angularVelocity, targetTurnRate * effectiveTurnFactor, dt * 4.0);
    this.yaw += this.angularVelocity * dt;

    // Forward Direction
    const forward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);

    // Acceleration & Drag
    const targetSpeed = this.throttle * this.config.speed;
    const currentSpeed = this.velocity.dot(forward);
    const accelRate = 12.0;
    const newSpeed = THREE.MathUtils.lerp(currentSpeed, targetSpeed, dt * accelRate);
    this.velocity.copy(forward).multiplyScalar(newSpeed);

    // Position integration
    this.position.addScaledVector(this.velocity, dt);

    // Collision with Islands & Rocks
    const col = map.checkCollision(this.position, this.hitRadius);
    if (col.collided) {
      // Push back outside obstacle
      this.position.addScaledVector(col.pushDir, col.overlap + 0.1);
      // Dampen velocity on impact
      this.velocity.multiplyScalar(0.2);
      this.effects.createWaterSplash(this.position);
    }

    // World boundary clamp
    const maxBound = 380;
    this.position.x = Math.max(-maxBound, Math.min(maxBound, this.position.x));
    this.position.z = Math.max(-maxBound, Math.min(maxBound, this.position.z));

    // Flotation & Wave Bobbing
    const waveH = this.ocean.getWaveHeight(this.position.x, this.position.z);
    const waveNorm = this.ocean.getWaveNormal(this.position.x, this.position.z);

    // Hull heeling tilt when turning (centripetal tilt)
    const turnHeel = -this.angularVelocity * 0.28;

    // Smooth wave pitch & roll
    const targetRoll = (-waveNorm.x * 0.4) + turnHeel;
    const targetPitch = waveNorm.z * 0.4;

    this.roll = THREE.MathUtils.lerp(this.roll, targetRoll, dt * 3.5);
    this.pitch = THREE.MathUtils.lerp(this.pitch, targetPitch, dt * 3.5);

    // Apply to 3D Transform
    this.position.y = THREE.MathUtils.lerp(this.position.y, waveH - 0.2, dt * 8.0);
    this.mesh.position.copy(this.position);
    this.mesh.rotation.set(this.pitch, this.yaw, this.roll);

    // Wake particles
    if (Math.abs(newSpeed) > 3.0) {
      const sternPos = this.position.clone().add(forward.clone().multiplyScalar(-3.0));
      this.effects.createWakeFoam(sternPos, forward);
    }

    // Smoke trail when damaged
    if (this.hp < this.maxHp * 0.45 && Math.random() < 0.25) {
      this.effects.createCannonBlast(
        this.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.5, 2.5, (Math.random() - 0.5) * 1.5)),
        new THREE.Vector3(0, 1, 0)
      );
    }
  }

  // Network state serialization (for 30/60 FPS P2P sync)
  getNetworkState() {
    return {
      id: this.id,
      name: this.name,
      typeKey: this.typeKey,
      x: parseFloat(this.position.x.toFixed(2)),
      y: parseFloat(this.position.y.toFixed(2)),
      z: parseFloat(this.position.z.toFixed(2)),
      yaw: parseFloat(this.yaw.toFixed(3)),
      roll: parseFloat(this.roll.toFixed(3)),
      pitch: parseFloat(this.pitch.toFixed(3)),
      vx: parseFloat(this.velocity.x.toFixed(2)),
      vz: parseFloat(this.velocity.z.toFixed(2)),
      hp: this.hp,
      maxHp: this.maxHp,
      score: this.score,
      isDead: this.isDead
    };
  }

  // Smooth interpolation for remote peer state
  applyNetworkState(state, dt) {
    if (this.isDead && !state.isDead) {
      this.respawn(new THREE.Vector3(state.x, state.y, state.z));
    }
    this.isDead = state.isDead;
    this.hp = state.hp;
    this.score = state.score;
    this.updateBillboard();

    // Lerp position & rotation smoothly
    const targetPos = new THREE.Vector3(state.x, state.y, state.z);
    this.position.lerp(targetPos, Math.min(1.0, dt * 18.0));
    this.yaw = THREE.MathUtils.lerp(this.yaw, state.yaw, Math.min(1.0, dt * 18.0));
    this.roll = THREE.MathUtils.lerp(this.roll, state.roll, Math.min(1.0, dt * 15.0));
    this.pitch = THREE.MathUtils.lerp(this.pitch, state.pitch, Math.min(1.0, dt * 15.0));

    this.mesh.position.copy(this.position);
    this.mesh.rotation.set(this.pitch, this.yaw, this.roll);

    this.velocity.set(state.vx, 0, state.vz);
  }

  destroy() {
    this.scene.remove(this.mesh);
  }
}
