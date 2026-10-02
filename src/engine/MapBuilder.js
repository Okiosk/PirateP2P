import * as THREE from 'three';
import { assets } from './AssetLoader.js';

export class MapBuilder {
  constructor(scene, ocean, effects) {
    this.scene = scene;
    this.ocean = ocean;
    this.effects = effects;
    this.obstacles = []; // Collision circles { pos: Vector3, radius: number, type: 'island' | 'rock' }
    this.floatingLoot = []; // Array of { mesh, type: 'chest' | 'barrel', id, pos, basePos, rotSpeed, isTaken }
    this.lootIdCounter = 0;
  }

  buildWorld() {
    // 1. Central Island - "L'Île aux Trésors" (Citadel & Grand Port)
    this.buildKenneyIsland({
      centerX: 0,
      centerZ: 0,
      collisionRadius: 42,
      // Cluster of Kenney ground patches
      tiles: [
        { model: 'patch-sand-foliage', x: 0, z: 0, scale: 6.5, rot: 0 },
        { model: 'patch-grass-foliage', x: 2, z: 2, scale: 5.5, rot: 1.2 },
        { model: 'patch-sand', x: -14, z: 8, scale: 4.5, rot: 0.8 },
        { model: 'patch-grass', x: 12, z: -10, scale: 4.8, rot: 2.1 },
        { model: 'patch-sand-foliage', x: 8, z: 15, scale: 4.0, rot: 3.0 },
        { model: 'patch-sand', x: -10, z: -15, scale: 4.2, rot: 1.5 }
      ],
      // Foliage & Details
      foliage: [
        { model: 'grass-patch', x: -6, z: 6, scale: 2.5, rot: 0.4 },
        { model: 'grass-plant', x: 6, z: -4, scale: 2.2, rot: 1.8 },
        { model: 'grass-patch', x: 10, z: 8, scale: 2.0, rot: 2.6 }
      ],
      // Coastal Rocks & Reefs
      rocks: [
        { model: 'rocks-sand-a', x: 28, z: 8, scale: 3.2, rot: 0.4 },
        { model: 'rocks-b', x: -26, z: -12, scale: 3.5, rot: 1.9 },
        { model: 'rocks-sand-b', x: -6, z: 28, scale: 3.0, rot: 2.7 },
        { model: 'rocks-c', x: 15, z: -25, scale: 2.8, rot: 0.9 },
        { model: 'rocks-sand-c', x: -22, z: 18, scale: 2.5, rot: 1.3 }
      ],
      // Palm Trees
      palms: [
        { model: 'palm-detailed-bend', x: -10, z: 8, scale: 2.5, rot: 0.6 },
        { model: 'palm-detailed-straight', x: 12, z: 10, scale: 2.6, rot: 2.2 },
        { model: 'palm-bend', x: -8, z: -10, scale: 2.4, rot: 1.4 },
        { model: 'palm-straight', x: 14, z: -8, scale: 2.3, rot: 3.1 },
        { model: 'palm-bend', x: 4, z: 18, scale: 2.2, rot: 0.2 }
      ],
      // Structures & Fortifications
      structures: [
        { model: 'tower-complete-large', x: 0, z: 0, scale: 3.2, rot: 0 },
        { model: 'castle-wall', x: 10, z: 4, scale: 2.6, rot: 0.8 },
        { model: 'castle-wall', x: -10, z: -4, scale: 2.6, rot: 0.8 },
        { model: 'castle-gate', x: 0, z: 12, scale: 2.5, rot: 0 },
        { model: 'structure-platform-dock', x: 0, z: -32, scale: 2.8, rot: 0 },
        { model: 'structure-fence', x: -4, z: -28, scale: 2.0, rot: Math.PI / 2 },
        { model: 'boat-row-large', x: 8, z: -33, scale: 2.2, rot: 0.4 },
        { model: 'cannon-mobile', x: 6, z: 10, scale: 2.0, rot: 0.3 }
      ],
      // Props
      props: [
        { model: 'crate-bottles', x: -3, z: -26, scale: 2.0, rot: 0.5 },
        { model: 'barrel', x: -1, z: -27, scale: 2.0, rot: 1.2 },
        { model: 'crate', x: 3, z: -26, scale: 2.0, rot: 0.1 },
        { model: 'chest', x: 0, z: 4, scale: 2.2, rot: 0 },
        { model: 'flag-pirate-high', x: 0, z: -1, scale: 2.4, rot: 0 }
      ]
    });

    // 2. North Fort - "Le Bastion du Crâne"
    this.buildKenneyIsland({
      centerX: 0,
      centerZ: -200,
      collisionRadius: 36,
      tiles: [
        { model: 'patch-sand-foliage', x: 0, z: 0, scale: 5.5, rot: 0.5 },
        { model: 'patch-grass', x: 0, z: 0, scale: 4.8, rot: 2.0 },
        { model: 'patch-sand', x: -10, z: -8, scale: 3.8, rot: 1.1 },
        { model: 'patch-sand', x: 10, z: 8, scale: 3.8, rot: 2.8 }
      ],
      rocks: [
        { model: 'rocks-a', x: 22, z: 6, scale: 3.2, rot: 0.3 },
        { model: 'rocks-sand-a', x: -20, z: -8, scale: 3.0, rot: 1.8 },
        { model: 'rocks-b', x: 4, z: 22, scale: 3.4, rot: 2.5 }
      ],
      palms: [
        { model: 'palm-detailed-bend', x: -8, z: 8, scale: 2.4, rot: 1.5 },
        { model: 'palm-straight', x: 10, z: -6, scale: 2.3, rot: 0.4 }
      ],
      structures: [
        { model: 'tower-watch', x: 0, z: 0, scale: 3.2, rot: Math.PI },
        { model: 'castle-wall', x: 8, z: 0, scale: 2.4, rot: Math.PI / 2 },
        { model: 'castle-wall', x: -8, z: 0, scale: 2.4, rot: Math.PI / 2 },
        { model: 'structure-platform-dock-small', x: 0, z: 24, scale: 2.5, rot: Math.PI }
      ],
      props: [
        { model: 'barrel', x: 4, z: 20, scale: 2.0, rot: 0.3 },
        { model: 'barrel', x: 2, z: 21, scale: 1.8, rot: 1.1 }
      ]
    });

    // 3. South Island - "L'Épave du Galion Maudit"
    this.buildKenneyIsland({
      centerX: -40,
      centerZ: 210,
      collisionRadius: 38,
      tiles: [
        { model: 'patch-sand-foliage', x: 0, z: 0, scale: 6.0, rot: 1.4 },
        { model: 'patch-sand', x: -12, z: -10, scale: 4.2, rot: 0.7 },
        { model: 'patch-grass', x: 8, z: 8, scale: 4.0, rot: 2.5 }
      ],
      rocks: [
        { model: 'rocks-sand-b', x: -24, z: 12, scale: 3.6, rot: 0.8 },
        { model: 'rocks-a', x: 18, z: -20, scale: 3.4, rot: 2.2 },
        { model: 'rocks-sand-c', x: 24, z: 14, scale: 3.0, rot: 1.6 }
      ],
      palms: [
        { model: 'palm-bend', x: -10, z: -10, scale: 2.5, rot: 0.8 },
        { model: 'palm-detailed-straight', x: 12, z: 12, scale: 2.4, rot: 2.1 }
      ],
      structures: [
        // Large stranded shipwreck on the sand & rocks
        { model: 'ship-wreck', x: -5, z: 8, scale: 2.6, rot: 0.7 },
        { model: 'platform-planks', x: 8, z: 0, scale: 2.2, rot: 1.2 }
      ],
      props: [
        { model: 'chest', x: -2, z: 18, scale: 2.2, rot: 0.9 },
        { model: 'barrel', x: 4, z: 5, scale: 2.0, rot: 0.5 },
        { model: 'crate', x: 6, z: 4, scale: 2.0, rot: 1.3 }
      ]
    });

    // 4. East Island - "L'Atoll aux Palmiers"
    this.buildKenneyIsland({
      centerX: 220,
      centerZ: 40,
      collisionRadius: 35,
      tiles: [
        { model: 'patch-sand-foliage', x: 0, z: 0, scale: 5.8, rot: 2.1 },
        { model: 'patch-grass-foliage', x: 0, z: 0, scale: 4.6, rot: 0.4 },
        { model: 'patch-sand', x: 10, z: -10, scale: 3.8, rot: 1.6 }
      ],
      rocks: [
        { model: 'rocks-sand-a', x: -18, z: 16, scale: 3.2, rot: 0.5 },
        { model: 'rocks-b', x: 22, z: -14, scale: 3.0, rot: 2.9 }
      ],
      palms: [
        { model: 'palm-detailed-bend', x: 6, z: 6, scale: 2.7, rot: 0.8 },
        { model: 'palm-bend', x: -8, z: -6, scale: 2.5, rot: 2.3 },
        { model: 'palm-straight', x: 8, z: -10, scale: 2.4, rot: 1.7 },
        { model: 'palm-detailed-straight', x: -6, z: 10, scale: 2.3, rot: 3.0 }
      ],
      structures: [
        { model: 'tower-complete-small', x: 0, z: 0, scale: 2.8, rot: 0.5 },
        { model: 'structure-platform-dock-small', x: -22, z: 0, scale: 2.4, rot: -Math.PI / 2 },
        { model: 'boat-row-small', x: -26, z: 4, scale: 2.0, rot: 0.8 }
      ],
      props: [
        { model: 'chest', x: 2, z: 4, scale: 2.0, rot: 0.4 }
      ]
    });

    // 5. West Island - "Le Récif des Tempêtes"
    this.buildKenneyIsland({
      centerX: -220,
      centerZ: -50,
      collisionRadius: 36,
      tiles: [
        { model: 'patch-sand', x: 0, z: 0, scale: 5.6, rot: 0.8 },
        { model: 'patch-grass', x: 4, z: 4, scale: 4.4, rot: 1.9 }
      ],
      rocks: [
        { model: 'rocks-b', x: 0, z: 0, scale: 4.2, rot: 0.2 },
        { model: 'rocks-sand-a', x: -18, z: 14, scale: 3.5, rot: 1.4 },
        { model: 'rocks-sand-b', x: 20, z: -16, scale: 3.4, rot: 2.8 },
        { model: 'rocks-a', x: -15, z: -18, scale: 3.2, rot: 0.9 }
      ],
      palms: [
        { model: 'palm-bend', x: 10, z: 8, scale: 2.5, rot: 1.1 },
        { model: 'palm-detailed-bend', x: -8, z: 12, scale: 2.4, rot: 2.7 }
      ],
      structures: [
        { model: 'tower-watch', x: 4, z: -4, scale: 2.8, rot: 0.8 }
      ],
      props: [
        { model: 'barrel', x: -4, z: 6, scale: 2.0, rot: 0.2 }
      ]
    });

    // 6. Tactical Sea Rocks & Navigation Breakwaters
    const seaPinnacles = [
      { x: 110, z: -110, model: 'rocks-a', scale: 3.6, rot: 0.4 },
      { x: -120, z: -100, model: 'rocks-sand-b', scale: 3.8, rot: 1.8 },
      { x: 100, z: 120, model: 'rocks-sand-a', scale: 3.4, rot: 2.3 },
      { x: -130, z: 90, model: 'rocks-b', scale: 4.0, rot: 1.0 },
      { x: 170, z: -180, model: 'rocks-sand-c', scale: 3.2, rot: 3.1 },
      { x: -180, z: 170, model: 'rocks-a', scale: 3.5, rot: 0.7 }
    ];

    seaPinnacles.forEach(p => {
      const rockMesh = assets.getModel(p.model);
      rockMesh.position.set(p.x, 0.4, p.z);
      rockMesh.scale.setScalar(p.scale);
      rockMesh.rotation.y = p.rot;
      this.scene.add(rockMesh);

      this.obstacles.push({
        pos: new THREE.Vector3(p.x, 0, p.z),
        radius: p.scale * 3.0,
        type: 'rock'
      });
    });

    // 7. Spawn Floating Loot (Chests & Rum Barrels)
    this.spawnLootGrid();
  }

  buildKenneyIsland(cfg) {
    const islandGroup = new THREE.Group();
    islandGroup.position.set(cfg.centerX, 0, cfg.centerZ);

    // 1. Modular Ground Patches
    if (cfg.tiles) {
      cfg.tiles.forEach(t => {
        const tileMesh = assets.getModel(t.model);
        tileMesh.position.set(t.x, 0.6, t.z);
        tileMesh.scale.set(t.scale * 3.2, 2.2, t.scale * 3.2);
        tileMesh.rotation.y = t.rot;
        islandGroup.add(tileMesh);
      });
    }

    // 2. Foliage & Plants
    if (cfg.foliage) {
      cfg.foliage.forEach(f => {
        const fMesh = assets.getModel(f.model);
        fMesh.position.set(f.x, 1.4, f.z);
        fMesh.scale.setScalar(f.scale);
        fMesh.rotation.y = f.rot;
        islandGroup.add(fMesh);
      });
    }

    // 3. Boulders & Rocks
    if (cfg.rocks) {
      cfg.rocks.forEach(r => {
        const rMesh = assets.getModel(r.model);
        rMesh.position.set(r.x, 1.0, r.z);
        rMesh.scale.setScalar(r.scale);
        rMesh.rotation.y = r.rot;
        islandGroup.add(rMesh);
      });
    }

    // 4. Palm Trees
    if (cfg.palms) {
      cfg.palms.forEach(p => {
        const pMesh = assets.getModel(p.model);
        pMesh.position.set(p.x, 1.4, p.z);
        pMesh.scale.setScalar(p.scale);
        pMesh.rotation.y = p.rot;
        islandGroup.add(pMesh);
      });
    }

    // 5. Structures
    if (cfg.structures) {
      cfg.structures.forEach(s => {
        const sMesh = assets.getModel(s.model);
        sMesh.position.set(s.x, 1.2, s.z);
        sMesh.scale.setScalar(s.scale);
        sMesh.rotation.y = s.rot;
        islandGroup.add(sMesh);
      });
    }

    // 6. Props & Loot
    if (cfg.props) {
      cfg.props.forEach(pr => {
        const prMesh = assets.getModel(pr.model);
        prMesh.position.set(pr.x, 1.4, pr.z);
        prMesh.scale.setScalar(pr.scale);
        prMesh.rotation.y = pr.rot;
        islandGroup.add(prMesh);
      });
    }

    this.scene.add(islandGroup);

    // Collision Bounding Obstacle
    this.obstacles.push({
      pos: new THREE.Vector3(cfg.centerX, 0, cfg.centerZ),
      radius: cfg.collisionRadius,
      type: 'island'
    });
  }

  spawnLootGrid() {
    const lootSpawns = [
      { x: 50, z: -50, type: 'chest' },
      { x: -50, z: 50, type: 'barrel' },
      { x: 70, z: 70, type: 'chest' },
      { x: -70, z: -70, type: 'barrel' },
      { x: 0, z: 100, type: 'chest' },
      { x: 0, z: -100, type: 'barrel' },
      { x: 130, z: 0, type: 'chest' },
      { x: -130, z: 0, type: 'barrel' },
      { x: 150, z: 100, type: 'barrel' },
      { x: -150, z: -100, type: 'chest' },
      { x: 80, z: -160, type: 'chest' },
      { x: -90, z: 160, type: 'barrel' }
    ];

    lootSpawns.forEach(item => {
      this.createLootItem(item.x, item.z, item.type);
    });
  }

  createLootItem(x, z, type) {
    const modelName = type === 'chest' ? 'chest' : 'barrel';
    const mesh = assets.getModel(modelName);
    const scale = type === 'chest' ? 1.8 : 2.0;
    mesh.scale.setScalar(scale);

    const lootObj = {
      id: `loot_${this.lootIdCounter++}`,
      type: type,
      mesh: mesh,
      basePos: new THREE.Vector3(x, 0, z),
      pos: new THREE.Vector3(x, 0, z),
      rotSpeed: 0.9 + Math.random() * 0.6,
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

  checkLootPickup(shipPos, pickupRadius = 5.0) {
    const collected = [];
    for (const item of this.floatingLoot) {
      if (item.isTaken) continue;
      const dist = shipPos.distanceTo(item.pos);
      if (dist < pickupRadius) {
        item.isTaken = true;
        item.respawnTimer = 18.0; // Respawns after 18s
        item.mesh.visible = false;
        collected.push(item);
      }
    }
    return collected;
  }

  update(dt, time) {
    for (const item of this.floatingLoot) {
      if (item.isTaken) {
        item.respawnTimer -= dt;
        if (item.respawnTimer <= 0) {
          item.isTaken = false;
          item.mesh.visible = true;
          this.effects.createWaterSplash(item.pos);
        }
        continue;
      }

      item.mesh.rotation.y += item.rotSpeed * dt;
      const waveH = this.ocean.getWaveHeight(item.basePos.x, item.basePos.z, time);
      item.pos.set(
        item.basePos.x,
        waveH + (item.type === 'chest' ? 0.35 : 0.45),
        item.basePos.z
      );
      item.mesh.position.copy(item.pos);
      item.mesh.rotation.x = Math.sin(time * 2.0 + item.bobOffset) * 0.15;
      item.mesh.rotation.z = Math.cos(time * 1.8 + item.bobOffset) * 0.15;
    }
  }
}
