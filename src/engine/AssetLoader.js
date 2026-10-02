import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';

class AssetManager {
  constructor() {
    this.loader = new GLTFLoader();
    this.cache = new Map();
    this.textureLoader = new THREE.TextureLoader();
    this.sharedColormap = null;
  }

  async init(onProgress) {
    const rawBase = import.meta.env.BASE_URL || './';
    const baseUrl = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;

    // Shared Kenney colormap texture
    try {
      this.sharedColormap = await this.textureLoader.loadAsync(`${baseUrl}models/Textures/colormap.png`);
      this.sharedColormap.colorSpace = THREE.SRGBColorSpace;
    } catch (e) {
      console.warn("Could not load colormap directly, GLB internal textures will be used.");
    }

    const modelsToLoad = [
      // Ships
      { name: 'ship-pirate-medium', url: `${baseUrl}models/ship-pirate-medium.glb` },
      { name: 'ship-medium', url: `${baseUrl}models/ship-medium.glb` },
      { name: 'ship-ghost', url: `${baseUrl}models/ship-ghost.glb` },
      { name: 'ship-pirate-small', url: `${baseUrl}models/ship-pirate-small.glb` },
      { name: 'ship-pirate-large', url: `${baseUrl}models/ship-pirate-large.glb` },

      // Island & Props
      { name: 'patch-sand', url: `${baseUrl}models/patch-sand.glb` },
      { name: 'patch-sand-foliage', url: `${baseUrl}models/patch-sand-foliage.glb` },
      { name: 'patch-grass', url: `${baseUrl}models/patch-grass.glb` },
      { name: 'patch-grass-foliage', url: `${baseUrl}models/patch-grass-foliage.glb` },
      { name: 'grass-patch', url: `${baseUrl}models/grass-patch.glb` },
      { name: 'grass-plant', url: `${baseUrl}models/grass-plant.glb` },
      { name: 'palm-bend', url: `${baseUrl}models/palm-bend.glb` },
      { name: 'palm-detailed-bend', url: `${baseUrl}models/palm-detailed-bend.glb` },
      { name: 'palm-detailed-straight', url: `${baseUrl}models/palm-detailed-straight.glb` },
      { name: 'palm-straight', url: `${baseUrl}models/palm-straight.glb` },
      { name: 'rocks-a', url: `${baseUrl}models/rocks-a.glb` },
      { name: 'rocks-b', url: `${baseUrl}models/rocks-b.glb` },
      { name: 'rocks-c', url: `${baseUrl}models/rocks-c.glb` },
      { name: 'rocks-sand-a', url: `${baseUrl}models/rocks-sand-a.glb` },
      { name: 'rocks-sand-b', url: `${baseUrl}models/rocks-sand-b.glb` },
      { name: 'rocks-sand-c', url: `${baseUrl}models/rocks-sand-c.glb` },
      { name: 'tower-complete-large', url: `${baseUrl}models/tower-complete-large.glb` },
      { name: 'tower-complete-small', url: `${baseUrl}models/tower-complete-small.glb` },
      { name: 'tower-watch', url: `${baseUrl}models/tower-watch.glb` },
      { name: 'castle-wall', url: `${baseUrl}models/castle-wall.glb` },
      { name: 'castle-gate', url: `${baseUrl}models/castle-gate.glb` },
      { name: 'ship-wreck', url: `${baseUrl}models/ship-wreck.glb` },
      { name: 'structure-platform-dock', url: `${baseUrl}models/structure-platform-dock.glb` },
      { name: 'structure-platform-dock-small', url: `${baseUrl}models/structure-platform-dock-small.glb` },
      { name: 'structure-fence', url: `${baseUrl}models/structure-fence.glb` },
      { name: 'platform-planks', url: `${baseUrl}models/platform-planks.glb` },
      { name: 'boat-row-large', url: `${baseUrl}models/boat-row-large.glb` },
      { name: 'boat-row-small', url: `${baseUrl}models/boat-row-small.glb` },

      // Items & Projectiles
      { name: 'cannon-ball', url: `${baseUrl}models/cannon-ball.glb` },
      { name: 'cannon-mobile', url: `${baseUrl}models/cannon-mobile.glb` },
      { name: 'chest', url: `${baseUrl}models/chest.glb` },
      { name: 'barrel', url: `${baseUrl}models/barrel.glb` },
      { name: 'crate', url: `${baseUrl}models/crate.glb` },
      { name: 'crate-bottles', url: `${baseUrl}models/crate-bottles.glb` },
      { name: 'flag-pirate', url: `${baseUrl}models/flag-pirate.glb` },
      { name: 'flag-pirate-high', url: `${baseUrl}models/flag-pirate-high.glb` }
    ];

    let loadedCount = 0;
    const total = modelsToLoad.length;

    const promises = modelsToLoad.map(item => {
      return new Promise((resolve) => {
        this.loader.load(
          item.url,
          (gltf) => {
            // Apply cartoon shading enhancements & shadows
            gltf.scene.traverse((node) => {
              if (node.isMesh) {
                node.castShadow = true;
                node.receiveShadow = true;
                if (node.material) {
                  node.material.roughness = 0.55;
                  node.material.metalness = 0.05;
                }
              }
            });
            this.cache.set(item.name, gltf);
            loadedCount++;
            if (onProgress) onProgress(loadedCount / total, item.name);
            resolve(gltf);
          },
          undefined,
          (err) => {
            console.error(`Failed to load ${item.name} from ${item.url}`, err);
            // Fallback empty model
            const dummy = { scene: new THREE.Group() };
            this.cache.set(item.name, dummy);
            loadedCount++;
            if (onProgress) onProgress(loadedCount / total, item.name);
            resolve(dummy);
          }
        );
      });
    });

    await Promise.all(promises);
  }

  getModel(name) {
    const gltf = this.cache.get(name);
    if (!gltf) {
      console.warn(`Model ${name} not found in asset cache!`);
      return new THREE.Group();
    }
    // Deep clone scene
    const clone = gltf.scene.clone(true);
    // Clone materials so highlights or damage flashes don't bleed between instances
    clone.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material = child.material.clone();
      }
    });
    return clone;
  }
}

export const assets = new AssetManager();
