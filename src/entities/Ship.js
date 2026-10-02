import * as THREE from 'three';
import { assets } from '../engine/AssetLoader.js';
import { sounds } from '../engine/Audio.js';

// Evolution tiers for the player's ship
export const SHIP_TIERS = [
  {
    level: 1,
    name: 'Sloop Léger',
    model: 'ship-pirate-small',
    scale: 2.3,
    baseHp: 300,
    baseSpeed: 38.0,
    turnSpeed: 1.7,
    cannons: 4,
    reloadTime: 2.2,
    hitRadius: 3.8,
    cost: 0
  },
  {
    level: 2,
    name: 'Brigantin Corsaire',
    model: 'ship-medium',
    scale: 2.2,
    baseHp: 480,
    baseSpeed: 42.0,
    turnSpeed: 1.5,
    cannons: 5,
    reloadTime: 2.0,
    hitRadius: 4.2,
    cost: 150
  },
  {
    level: 3,
    name: 'Galion Pirate',
    model: 'ship-pirate-medium',
    scale: 2.2,
    baseHp: 700,
    baseSpeed: 46.0,
    turnSpeed: 1.35,
    cannons: 6,
    reloadTime: 1.8,
    hitRadius: 4.4,
    cost: 350
  },
  {
    level: 4,
    name: 'Dreadnought des Mers',
    model: 'ship-pirate-large',
    scale: 2.3,
    baseHp: 950,
    baseSpeed: 50.0,
    turnSpeed: 1.25,
    cannons: 7,
    reloadTime: 1.6,
    hitRadius: 4.8,
    cost: 600
  },
  {
    level: 5,
    name: 'Hollandais Maudit',
    model: 'ship-ghost',
    scale: 2.4,
    baseHp: 1300,
    baseSpeed: 56.0,
    turnSpeed: 1.2,
    cannons: 8,
    reloadTime: 1.4,
    hitRadius: 5.0,
    cost: 1000
  }
];

export class Ship {
  constructor(id, name, tierIndex = 0, scene, ocean, effects, isLocal = false) {
    this.id = id;
    this.name = name;
    this.scene = scene;
    this.ocean = ocean;
    this.effects = effects;
    this.isLocal = isLocal;

    // Upgrades state (persistent for local player)
    this.tierIndex = Math.max(0, Math.min(SHIP_TIERS.length - 1, tierIndex));
    this.sailUpgrade = 0; // 0 to 4 (+3 m/s per level)
    this.cannonUpgrade = 0; // 0 to 4 (+1 cannon or faster reload)

    this.loadUpgrades();

    // Movement & Physics
    this.position = new THREE.Vector3(0, 0, 0);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.yaw = 0; // Heading in radians
    this.angularVelocity = 0;
    this.roll = 0;
    this.pitch = 0;
    this.throttle = 0; // -0.5 to 1.0
    this.steering = 0;

    // Boost Mechanic
    this.isBoosting = false;
    this.boostEnergy = 100.0;
    this.maxBoostEnergy = 100.0;
    this.boostCooldown = 0;

    // Combat Stats
    this.updateStats();
    this.hp = this.maxHp;
    this.isDead = false;
    this.sinkTimer = 0;
    this.respawnTimer = 0;
    this.score = 0;
    this.gold = parseInt(localStorage.getItem('PIRATE_GOLD') || '0', 10);

    // Reload timers
    this.leftCooldown = 0;
    this.rightCooldown = 0;

    // 3D Mesh
    this.mesh = new THREE.Group();
    this.buildModel();

    // 3D Floating Name & Health Bar billboard above ship
    this.billboard = this.createBillboard();
    this.mesh.add(this.billboard);

    this.scene.add(this.mesh);
  }

  loadUpgrades() {
    if (this.isLocal) {
      try {
        const saved = JSON.parse(localStorage.getItem('PIRATE_UPGRADES') || '{}');
        if (saved.tierIndex !== undefined) this.tierIndex = saved.tierIndex;
        if (saved.sailUpgrade !== undefined) this.sailUpgrade = saved.sailUpgrade;
        if (saved.cannonUpgrade !== undefined) this.cannonUpgrade = saved.cannonUpgrade;
      } catch (e) {
        console.warn("Could not read upgrades from localStorage", e);
      }
    }
  }

  saveUpgrades() {
    if (this.isLocal) {
      try {
        localStorage.setItem('PIRATE_UPGRADES', JSON.stringify({
          tierIndex: this.tierIndex,
          sailUpgrade: this.sailUpgrade,
          cannonUpgrade: this.cannonUpgrade
        }));
        localStorage.setItem('PIRATE_GOLD', this.gold.toString());
      } catch (e) {
        console.warn("Could not save upgrades", e);
      }
    }
  }

  updateStats() {
    this.config = SHIP_TIERS[this.tierIndex];
    this.maxHp = this.config.baseHp;
    this.speed = this.config.baseSpeed + this.sailUpgrade * 4.0;
    this.turnSpeed = this.config.turnSpeed;
    this.cannonsPerSide = this.config.cannons + Math.floor(this.cannonUpgrade * 0.6);
    this.reloadTime = Math.max(0.9, this.config.reloadTime - this.cannonUpgrade * 0.15);
    this.hitRadius = this.config.hitRadius;
    this.hitHeight = 5.5;
  }

  buildModel() {
    if (this.model) {
      this.mesh.remove(this.model);
    }
    this.updateStats();
    this.model = assets.getModel(this.config.model);
    this.model.scale.setScalar(this.config.scale);
    this.mesh.add(this.model);
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
    sprite.position.set(0, 7.5, 0);
    sprite.scale.set(6.5, 1.6, 1.0);
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
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.beginPath();
    ctx.roundRect(10, 4, w - 20, h - 8, 8);
    ctx.fill();
    ctx.strokeStyle = this.isLocal ? '#38ef7d' : '#e74c3c';
    ctx.lineWidth = 3.0;
    ctx.stroke();

    // Player Name & Tier
    ctx.font = 'bold 18px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(`${this.name} (${this.config.name})`, w / 2, 26);

    // HP Bar background
    const barX = 24;
    const barY = 34;
    const barW = w - 48;
    const barH = 14;

    ctx.fillStyle = '#222222';
    ctx.fillRect(barX, barY, barW, barH);

    // HP Bar fill
    const pct = Math.max(0, this.hp / this.maxHp);
    const hpColor = pct > 0.5 ? '#2ecc71' : pct > 0.25 ? '#f39c12' : '#e74c3c';
    ctx.fillStyle = hpColor;
    ctx.fillRect(barX, barY, barW * pct, barH);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(barX, barY, barW, barH);

    this.billboardTexture.needsUpdate = true;
  }

  setInputs(forward, backward, left, right, boost = false) {
    if (this.isDead) {
      this.throttle = 0;
      this.steering = 0;
      this.isBoosting = false;
      return;
    }

    let targetThrottle = 0;
    if (forward) targetThrottle += 1.0;
    if (backward) targetThrottle -= 0.5;
    this.throttle = targetThrottle;

    // Steering: Left = turn LEFT on screen (positive yaw towards world +X), Right = turn RIGHT on screen (negative yaw towards world -X)
    let targetSteer = 0;
    if (left) targetSteer += 1.0;
    if (right) targetSteer -= 1.0;
    this.steering = targetSteer;

    // Boost (Shift key)
    if (boost && this.boostEnergy > 10.0 && forward) {
      if (!this.isBoosting) {
        sounds.playBoost();
      }
      this.isBoosting = true;
    } else {
      this.isBoosting = false;
    }
  }

  takeDamage(amount, attackerId) {
    if (this.isDead) return;

    this.hp = Math.max(0, this.hp - amount);
    this.updateBillboard();
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
    this.saveUpgrades();
    sounds.playLoot();
    this.effects.createLootEffect(this.position, `+${amount} Or 💰`, '#f1c40f');
  }

  // Ship Upgrades
  upgradeTier() {
    if (this.tierIndex >= SHIP_TIERS.length - 1) return false;
    const nextTier = SHIP_TIERS[this.tierIndex + 1];
    if (this.gold < nextTier.cost) return false;

    this.gold -= nextTier.cost;
    this.tierIndex++;
    this.buildModel();
    this.hp = this.maxHp;
    this.saveUpgrades();
    this.updateBillboard();
    sounds.playUpgrade();
    this.effects.createLootEffect(this.position, `👑 ${nextTier.name} Débloqué !`, '#ffd700');
    return true;
  }

  upgradeSails() {
    const cost = (this.sailUpgrade + 1) * 75;
    if (this.sailUpgrade >= 4 || this.gold < cost) return false;

    this.gold -= cost;
    this.sailUpgrade++;
    this.updateStats();
    this.saveUpgrades();
    sounds.playUpgrade();
    this.effects.createLootEffect(this.position, `⛵ Vitesse Niv. ${this.sailUpgrade + 1}`, '#38ef7d');
    return true;
  }

  upgradeCannons() {
    const cost = (this.cannonUpgrade + 1) * 90;
    if (this.cannonUpgrade >= 4 || this.gold < cost) return false;

    this.gold -= cost;
    this.cannonUpgrade++;
    this.updateStats();
    this.saveUpgrades();
    sounds.playUpgrade();
    this.effects.createLootEffect(this.position, `💣 Artillerie Niv. ${this.cannonUpgrade + 1}`, '#ff7675');
    return true;
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
    this.boostEnergy = 100.0;
    this.mesh.rotation.set(0, this.yaw, 0);
    this.updateBillboard();
    this.effects.createWaterSplash(this.position);
  }

  getCannonWorldPositions(side) {
    const positions = [];
    const directions = [];
    const count = this.cannonsPerSide;

    const forward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);

    // Left broadside: fires to LEFT on screen (world +X)
    // Right broadside: fires to RIGHT on screen (world -X)
    const sign = side === 'left' ? 1 : -1;
    const cannonDir = right.clone().multiplyScalar(sign);

    const spacing = 1.4;
    const startZ = -((count - 1) * spacing) / 2;

    for (let i = 0; i < count; i++) {
      const zOffset = startZ + i * spacing;
      const pos = this.position.clone()
        .add(forward.clone().multiplyScalar(zOffset))
        .add(right.clone().multiplyScalar(sign * 2.3));
      pos.y += 1.3;

      // Slight fan spread in volley
      const angleSpread = ((i / (count - 1 || 1)) - 0.5) * 0.28;
      const spreadDir = cannonDir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angleSpread);

      positions.push(pos);
      directions.push(spreadDir);
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
      this.leftCooldown = this.reloadTime;
    } else {
      this.rightCooldown = this.reloadTime;
    }

    const { positions, directions } = this.getCannonWorldPositions(side);
    projectileManager.spawnVolley(this.id, positions, directions, this.velocity);

    // Recoil (hull tilts in opposite direction of fire)
    const recoilRoll = (side === 'left' ? -1 : 1) * 0.12;
    this.roll += recoilRoll;

    return { side, positions, directions };
  }

  // Ship-to-Ship Physical Bounce & Collision (0 Damage)
  resolveShipCollision(other) {
    if (this.isDead || other.isDead) return;

    const dx = other.position.x - this.position.x;
    const dz = other.position.z - this.position.z;
    const distSq = dx * dx + dz * dz;
    const minDist = this.hitRadius + other.hitRadius;

    if (distSq < minDist * minDist && distSq > 0.001) {
      const dist = Math.sqrt(distSq);
      const overlap = minDist - dist;
      const normal = new THREE.Vector3(dx / dist, 0, dz / dist);

      // Separate ships
      this.position.addScaledVector(normal, -overlap * 0.55);
      other.position.addScaledVector(normal, overlap * 0.55);

      // Elastic bounce momentum exchange
      const relativeVel = this.velocity.clone().sub(other.velocity);
      const velAlongNormal = relativeVel.dot(normal);

      if (velAlongNormal > 0) {
        // Moving towards each other: bounce!
        const restitution = 1.3; // Bouncy cartoon impulse
        const impulseMag = velAlongNormal * restitution * 0.7;

        this.velocity.addScaledVector(normal, -impulseMag);
        other.velocity.addScaledVector(normal, impulseMag);

        // Visual & Sound Feedback (Splashes, wood particles, sound, but 0 damage)
        const contactPos = this.position.clone().addScaledVector(normal, this.hitRadius);
        this.effects.createShipHit(contactPos, 0);
        sounds.playHit();

        // Hull tilt away from impact
        this.roll += (Math.random() - 0.5) * 0.3;
        other.roll += (Math.random() - 0.5) * 0.3;
      }
    }
  }

  update(dt, map) {
    // Cooldowns
    if (this.leftCooldown > 0) this.leftCooldown = Math.max(0, this.leftCooldown - dt);
    if (this.rightCooldown > 0) this.rightCooldown = Math.max(0, this.rightCooldown - dt);

    // Boost Energy Regen & Drain
    if (this.isBoosting) {
      this.boostEnergy = Math.max(0, this.boostEnergy - 32.0 * dt);
      if (this.boostEnergy <= 0) this.isBoosting = false;
    } else {
      this.boostEnergy = Math.min(this.maxBoostEnergy, this.boostEnergy + 16.0 * dt);
    }

    // Sinking Animation
    if (this.isDead) {
      if (this.sinkTimer > 0) {
        this.sinkTimer -= dt;
        this.position.y -= 2.2 * dt;
        this.pitch -= 0.3 * dt;
        this.roll += 0.35 * dt;
        this.mesh.position.copy(this.position);
        this.mesh.rotation.set(this.pitch, this.yaw, this.roll);

        if (Math.random() < 0.25) {
          this.effects.createWaterSplash(this.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 3)));
        }
      }
      return;
    }

    // Steering & Angular velocity
    const targetTurnRate = this.steering * this.turnSpeed;
    const speedRatio = this.velocity.length() / (this.speed || 1);
    const effectiveTurnFactor = Math.max(0.4, Math.min(1.1, speedRatio + 0.3));
    this.angularVelocity = THREE.MathUtils.lerp(this.angularVelocity, targetTurnRate * effectiveTurnFactor, dt * 6.0);
    this.yaw += this.angularVelocity * dt;

    // Forward Direction
    const forward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);

    // Acceleration & Speed (with Boost multiplier)
    const boostMultiplier = this.isBoosting ? 1.85 : 1.0;
    const targetSpeed = this.throttle * this.speed * boostMultiplier;
    const currentSpeed = this.velocity.dot(forward);
    const accelRate = this.isBoosting ? 28.0 : 16.0;
    const newSpeed = THREE.MathUtils.lerp(currentSpeed, targetSpeed, dt * accelRate);
    this.velocity.copy(forward).multiplyScalar(newSpeed);

    // Position integration
    this.position.addScaledVector(this.velocity, dt);

    // Island Collisions
    const col = map.checkCollision(this.position, this.hitRadius);
    if (col.collided) {
      this.position.addScaledVector(col.pushDir, col.overlap + 0.2);
      this.velocity.multiplyScalar(0.2);
      this.effects.createWaterSplash(this.position);
      sounds.playHit();
    }

    // World Boundary Clamp
    const maxBound = 380;
    this.position.x = Math.max(-maxBound, Math.min(maxBound, this.position.x));
    this.position.z = Math.max(-maxBound, Math.min(maxBound, this.position.z));

    // Flotation & Wave Bobbing
    const waveH = this.ocean.getWaveHeight(this.position.x, this.position.z);
    const waveNorm = this.ocean.getWaveNormal(this.position.x, this.position.z);

    // Centripetal turn tilt
    const turnHeel = -this.angularVelocity * 0.32;
    const targetRoll = (-waveNorm.x * 0.45) + turnHeel;
    const targetPitch = waveNorm.z * 0.45;

    this.roll = THREE.MathUtils.lerp(this.roll, targetRoll, dt * 4.5);
    this.pitch = THREE.MathUtils.lerp(this.pitch, targetPitch, dt * 4.5);

    // Apply to 3D Transform
    this.position.y = THREE.MathUtils.lerp(this.position.y, waveH - 0.2, dt * 10.0);
    this.mesh.position.copy(this.position);
    this.mesh.rotation.set(this.pitch, this.yaw, this.roll);

    // Wake & Boost particles
    if (Math.abs(newSpeed) > 4.0) {
      const sternPos = this.position.clone().add(forward.clone().multiplyScalar(-3.0));
      this.effects.createWakeFoam(sternPos, forward);

      if (this.isBoosting) {
        // Extra white speed foam and spray when boosting
        this.effects.createWaterSplash(sternPos);
      }
    }

    // Low HP smoke
    if (this.hp < this.maxHp * 0.45 && Math.random() < 0.28) {
      this.effects.createCannonBlast(
        this.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.5, 2.5, (Math.random() - 0.5) * 1.5)),
        new THREE.Vector3(0, 1, 0)
      );
    }
  }

  getNetworkState() {
    return {
      id: this.id,
      name: this.name,
      tierIndex: this.tierIndex,
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
      gold: this.gold,
      isBoosting: this.isBoosting,
      isDead: this.isDead
    };
  }

  applyNetworkState(state, dt) {
    if (this.isDead && !state.isDead) {
      this.respawn(new THREE.Vector3(state.x, state.y, state.z));
    }
    if (state.tierIndex !== undefined && state.tierIndex !== this.tierIndex) {
      this.tierIndex = state.tierIndex;
      this.buildModel();
    }
    this.isDead = state.isDead;
    this.hp = state.hp;
    this.score = state.score;
    this.isBoosting = state.isBoosting;
    this.updateBillboard();

    const targetPos = new THREE.Vector3(state.x, state.y, state.z);
    this.position.lerp(targetPos, Math.min(1.0, dt * 20.0));
    this.yaw = THREE.MathUtils.lerp(this.yaw, state.yaw, Math.min(1.0, dt * 20.0));
    this.roll = THREE.MathUtils.lerp(this.roll, state.roll, Math.min(1.0, dt * 16.0));
    this.pitch = THREE.MathUtils.lerp(this.pitch, state.pitch, Math.min(1.0, dt * 16.0));

    this.mesh.position.copy(this.position);
    this.mesh.rotation.set(this.pitch, this.yaw, this.roll);
    this.velocity.set(state.vx, 0, state.vz);
  }

  destroy() {
    this.scene.remove(this.mesh);
  }
}
