import * as THREE from 'three';
import { assets } from './AssetLoader.js';
import { sounds } from './Audio.js';

export class MapBuilder {
  constructor(scene, ocean, effects) {
    this.scene = scene;
    this.ocean = ocean;
    this.effects = effects;
    this.obstacles = []; // Array of { pos: Vector3, radius: number, type: 'island' | 'rock' }
    this.floatingLoot = []; // Array of { mesh, type: 'chest' | 'barrel', id, pos, basePos, rotSpeed, isTaken }
    this.lootIdCounter = 0;
  }

  buildWorld() {
    // 1. Center Citadel Island
    this.createIsland({
      x: 0,
      z: 0,
      radius: 40,
      sandScales: [35, 30],
      palms: [
        { x: -12, z: 8, rot: 0.5, model: 'palm-detailed-bend' },
        { x: 14, z: -10, rot: 2.1, model: 'palm-bend' },
        { x: 8, z: 15, rot: 1.2, model: 'palm-straight' },
        { x: -15, z: -12, rot: 3.4, model: 'palm-bend' }
      ],
      rocks: [
        { x: 28, z: 12, rot: 0.8, scale: 3.0, model: 'rocks-sand-a' },
        { x: -30, z: -15, rot: 1.9, scale: 3.5, model: 'rocks-b' },
        { x: -5, z: 32, rot: 2.7, scale: 2.8, model: 'rocks-a' }
      ],
      structures: [
        { model: 'tower-complete-large', x: 0, z: 0, scale: 3.2, rot: 0 },
        { model: 'castle-wall', x: 8, z: 4, scale: 2.5, rot: 0.8 },
        { model: 'castle-wall', x: -8, z: -4, scale: 2.5, rot: 0.8 },
        { model: 'structure-platform-dock', x: 0, z: -32, scale: 2.5, rot: 0 }
      ]
    });

    // 2. North Fort Island
    this.createIsland({
      x: 0,
      z: -180,
      radius: 32,
      sandScales: [28, 25],
      palms: [
        { x: -8, z: -185, rot: 1.1, model: 'palm-bend' },
        { x: 10, z: -175, rot: 2.8, model: 'palm-detailed-bend' }
      ],
      rocks: [
        { x: 22, z: -170, rot: 0.4, scale: 2.8, model: 'rocks-sand-a' },
        { x: -25, z: -195, rot: 2.1, scale: 3.2, model: 'rocks-a' }
      ],
      structures: [
        { model: 'tower-watch', x: 0, z: -180, scale: 3.0, rot: Math.PI }
      ]
    });

    // 3. South Shipwreck Cove
    this.createIsland({
      x: -30,
      z: 190,
      radius: 35,
      sandScales: [30, 26],
      palms: [
        { x: -38, z: 180, rot: 0.3, model: 'palm-bend' },
        { x: -20, z: 205, rot: 1.7, model: 'palm-straight' }
      ],
      rocks: [
        { x: -45, z: 170, rot: 1.2, scale: 3.0, model: 'rocks-a' },
        { x: -10, z: 215, rot: 2.5, scale: 3.5, model: 'rocks-b' }
      ],
      structures: [
        { model: 'ship-wreck', x: -28, z: 195, scale: 2.0, rot: 0.6 }
      ]
    });

    // 4. East Palm Haven Island
    this.createIsland({
      x: 210,
      z: 30,
      radius: 30,
      sandScales: [26, 24],
      palms: [
        { x: 205, z: 25, rot: 0.9, model: 'palm-detailed-bend' },
        { x: 220, z: 35, rot: 2.4, model: 'palm-bend' },
        { x: 212, z: 42, rot: 1.5, model: 'palm-straight' }
      ],
      rocks: [
        { x: 228, z: 15, rot: 3.0, scale: 2.5, model: 'rocks-sand-a' }
      ]
    });

    // 5. West Skull Reef Island
    this.createIsland({
      x: -210,
      z: -40,
      radius: 34,
      sandScales: [30, 28],
      palms: [
        { x: -200, z: -35, rot: 1.8, model: 'palm-bend' },
        { x: -222, z: -48, rot: 0.5, model: 'palm-detailed-bend' }
      ],
      rocks: [
        { x: -190, z: -25, rot: 0.2, scale: 4.2, model: 'rocks-b' },
        { x: -230, z: -55, rot: 1.7, scale: 3.8, model: 'rocks-sand-a' }
      ]
    });

    // 6. Scattered sea rocks / pinnacles in open waters (tactical cover)
    const seaRocks = [
      { x: 100, z: -100, scale: 3.0, rot: 0.5, model: 'rocks-a' },
      { x: -110, z: -90, scale: 3.2, rot: 1.8, model: 'rocks-b' },
      { x: 95, z: 110, scale: 2.8, rot: 2.3, model: 'rocks-sand-a' },
      { x: -120, z: 85, scale: 3.5, rot: 0.9, model: 'rocks-b' },
      { x: 160, z: -160, scale: 2.6, rot: 3.1, model: 'rocks-a' },
      { x: -170, z: 160, scale: 3.0, rot: 1.4, model: 'rocks-sand-a' }
    ];

    seaRocks.forEach(r => {
      const rockMesh = assets.getModel(r.model);
      rockMesh.position.set(r.x, -0.5, r.z);
      rockMesh.scale.setScalar(r.scale);
      rockMesh.rotation.y = r.rot;
      this.scene.add(rockMesh);

      this.obstacles.push({
        pos: new THREE.Vector3(r.x, 0, r.z),
        radius: r.scale * 3.2,
        type: 'rock'
      });
    });

    // 7. Spawn Floating Loot (Chests & Rum Barrels)
    this.spawnLootGrid();
  }

  createIsland(config) {
    const group = new THREE.Group();

    // Sand patch base
    const sandMesh = assets.getModel('patch-sand');
    sandMesh.position.set(0, 0.4, 0);
    sandMesh.scale.set(config.sandScales[0], 2.5, config.sandScales[1]);
    group.add(sandMesh);

    // Grass patch on top
    const grassMesh = assets.getModel('patch-grass');
    grassMesh.position.set(0, 0.8, 0);
    grassMesh.scale.set(config.sandScales[0] * 0.75, 2.0, config.sandScales[1] * 0.75);
    group.add(grassMesh);

    // Place island at world coords
    group.position.set(config.x, 0, config.z);
    this.scene.add(group);

    // Add palms
    if (config.palms) {
      config.palms.forEach(p => {
        const palm = assets.getModel(p.model);
        palm.position.set(p.x, 1.2, p.z);
        palm.scale.setScalar(2.2 + Math.random() * 0.6);
        palm.rotation.y = p.rot;
        this.scene.add(palm);
      });
    }

    // Add rocks
    if (config.rocks) {
      config.rocks.forEach(r => {
        const rock = assets.getModel(r.model);
        rock.position.set(r.x, 0.6, r.z);
        rock.scale.setScalar(r.scale);
        rock.rotation.y = r.rot;
        this.scene.add(rock);
      });
    }

    // Add structures (towers, walls, docks)
    if (config.structures) {
      config.structures.forEach(s => {
        const struct = assets.getModel(s.model);
        struct.position.set(s.x, 1.0, s.z);
        struct.scale.setScalar(s.scale);
        struct.rotation.y = s.rot;
        this.scene.add(struct);
      });
    }

    // Add circular collision obstacle
    this.obstacles.push({
      pos: new THREE.Vector3(config.x, 0, config.z),
      radius: config.radius,
      type: 'island'
    });
  }

  spawnLootGrid() {
    // Defined spawn positions for chests and barrels in navigation channels
    const lootSpawns = [
      { x: 50, z: -50, type: 'chest' },
      { x: -50, z: 50, type: 'barrel' },
      { x: 60, z: 60, type: 'chest' },
      { x: -60, z: -60, type: 'barrel' },
      { x: 0, z: 90, type: 'chest' },
      { x: 0, z: -90, type: 'barrel' },
      { x: 120, z: 0, type: 'chest' },
      { x: -120, z: 0, type: 'barrel' },
      { x: 140, z: 90, type: 'barrel' },
      { x: -140, z: -90, type: 'chest' }
    ];

    lootSpawns.forEach(item => {
      this.createLootItem(item.x, item.z, item.type);
    });
  }

  createLootItem(x, z, type) {
    const modelName = type === 'chest' ? 'chest' : 'barrel';
    const mesh = assets.getModel(modelName);
    const scale = type === 'chest' ? 1.6 : 1.8;
    mesh.scale.setScalar(scale);

    const lootObj = {
      id: `loot_${this.lootIdCounter++}`,
      type: type,
      mesh: mesh,
      basePos: new THREE.Vector3(x, 0, z),
      pos: new THREE.Vector3(x, 0, z),
      rotSpeed: 0.8 + Math.random() * 0.6,
      bobOffset: Math.random() * Math.PI * 2,
      isTaken: false,
      respawnTimer: 0
    };

    mesh.position.copy(lootObj.pos);
    this.scene.add(mesh);
    this.floatingLoot.push(lootObj);
    return lootObj;
  }

  checkCollision(pos, shipRadius = 4.0) {
    for (const obs of this.obstacles) {
      const dx = pos.x - obs.pos.x;
      const dz = pos.z - obs.pos.z;
      const distSq = dx * dx + dz * dz;
      const minDist = obs.radius + shipRadius;

      if (distSq < minDist * minDist) {
        const dist = Math.sqrt(distSq);
        const overlap = minDist - dist;
        const pushDir = dist > 0.001
          ? new THREE.Vector3(dx / dist, 0, dz / dist)
          : new THREE.Vector3(1, 0, 0);

        return {
          collided: true,
          pushDir: pushDir,
          overlap: overlap,
          type: obs.type
        };
      }
    }
    return { collided: false };
  }

  checkLootPickup(shipPos, pickupRadius = 4.5) {
    const collected = [];
    for (const item of this.floatingLoot) {
      if (item.isTaken) continue;
      const dist = shipPos.distanceTo(item.pos);
      if (dist < pickupRadius) {
        item.isTaken = true;
        item.respawnTimer = 20.0; // Respawns after 20s
        item.mesh.visible = false;
        collected.push(item);
      }
    }
    return collected;
  }

  update(dt, time) {
    // Animate floating loot on ocean waves
    for (const item of this.floatingLoot) {
      if (item.isTaken) {
        item.respawnTimer -= dt;
        if (item.respawnTimer <= 0) {
          item.isTaken = false;
          item.mesh.visible = true;
          // Puff effect on respawn
          this.effects.createWaterSplash(item.pos);
        }
        continue;
      }

      // Rotate slowly
      item.mesh.rotation.y += item.rotSpeed * dt;

      // Bob with ocean wave height
      const waveH = this.ocean.getWaveHeight(item.basePos.x, item.basePos.z, time);
      item.pos.set(
        item.basePos.x,
        waveH + (item.type === 'chest' ? 0.3 : 0.4),
        item.basePos.z
      );
      item.mesh.position.copy(item.pos);

      // Gentle pitch & roll
      item.mesh.rotation.x = Math.sin(time * 2.0 + item.bobOffset) * 0.15;
      item.mesh.rotation.z = Math.cos(time * 1.8 + item.bobOffset) * 0.15;
    }
  }
}
