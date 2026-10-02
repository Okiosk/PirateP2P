import * as THREE from 'three';
import { assets } from './engine/AssetLoader.js';
import { sounds } from './engine/Audio.js';
import { Ocean } from './engine/Ocean.js';
import { EffectsManager } from './engine/Effects.js';
import { MapBuilder } from './engine/MapBuilder.js';
import { CameraFollow } from './engine/CameraFollow.js';
import { Ship, SHIP_TIERS } from './entities/Ship.js';
import { AIShip } from './entities/AIShip.js';
import { ProjectileManager } from './entities/ProjectileManager.js';
import { NetworkManager } from './network/NetworkManager.js';
import { UIManager } from './ui/UIManager.js';

window.__SHIP_TIERS = SHIP_TIERS;

class Game {
  constructor() {
    this.container = document.getElementById('canvas-container');
    this.clock = new THREE.Clock();

    // Core systems
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.ocean = null;
    this.effects = null;
    this.map = null;
    this.cameraFollow = null;
    this.projectiles = null;
    this.network = new NetworkManager();
    this.ui = new UIManager();

    // Game State
    this.playerShip = null;
    this.peerShip = null;
    this.aiShips = [];
    this.gameActive = false;
    this.gameMode = 'solo'; // 'solo' | 'host' | 'client'
    this.selectedShipType = 'galleon';
    this.playerName = 'Capitaine Jack';

    // Controls
    this.keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      boost: false
    };

    // Cannon Hold-to-fire state
    this.fireInputs = {
      left: false,
      right: false,
      both: false
    };

    // Network sync throttle
    this.netTickTimer = 0;
    this.netTickInterval = 1 / 30; // 30 Hz

    this.init();
  }

  async init() {
    // 1. Setup Three.js Scene, Camera, Renderer
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb); // Tropical sky blue
    this.scene.fog = new THREE.FogExp2(0x87ceeb, 0.0022);

    this.camera = new THREE.PerspectiveCamera(
      58,
      window.innerWidth / window.innerHeight,
      0.5,
      1500
    );

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.container.appendChild(this.renderer.domElement);

    // 2. Lighting (Sunny tropical Caribbean atmosphere)
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x19a7ce, 0.75);
    this.scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xfffaed, 1.4);
    dirLight.position.set(120, 160, 100);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 10;
    dirLight.shadow.camera.far = 400;
    const shadowD = 140;
    dirLight.shadow.camera.left = -shadowD;
    dirLight.shadow.camera.right = shadowD;
    dirLight.shadow.camera.top = shadowD;
    dirLight.shadow.camera.bottom = -shadowD;
    dirLight.shadow.bias = -0.0005;
    this.scene.add(dirLight);

    // 3. Engine Managers
    this.effects = new EffectsManager(this.scene, this.camera);
    this.ocean = new Ocean(this.scene, 1400, 512);
    this.map = new MapBuilder(this.scene, this.ocean, this.effects);
    this.cameraFollow = new CameraFollow(this.camera, this.renderer.domElement, this.effects);
    this.projectiles = new ProjectileManager(this.scene, this.ocean, this.effects, this.map);

    // 4. Preload Kenney Models
    await assets.init((pct, name) => {
      // console.log(`Loaded ${name} (${Math.round(pct * 100)}%)`);
    });

    // 5. Build Map & Archipelago
    this.map.buildWorld();

    // Create local player ship for lobby preview & persistence
    this.playerShip = new Ship(
      'local_player',
      this.playerName,
      0,
      this.scene,
      this.ocean,
      this.effects,
      true
    );
    this.playerShip.position.set(-60, 0, -60);
    this.cameraFollow.setTarget(this.playerShip);

    // 6. Setup Inputs, Network & UI Listeners
    this.setupInputs();
    this.setupNetworkCallbacks();
    this.setupUI();
    this.ui.updateShipyardUI(this.playerShip);

    // Check URL parameters for direct room joining (?room=PIRATE-XXXX)
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    if (roomParam) {
      const joinInput = document.getElementById('join-code');
      if (joinInput) joinInput.value = roomParam.toUpperCase();
    }

    // Window resize
    window.addEventListener('resize', () => this.onResize());

    // Start Render Loop
    this.animate();
  }

  setupUI() {
    // Player name input
    const nameInput = document.getElementById('player-name');
    if (nameInput) {
      nameInput.addEventListener('input', (e) => {
        this.playerName = e.target.value.trim() || 'Capitaine';
        if (this.playerShip) this.playerShip.name = this.playerName;
      });
    }

    // Upgrades: Hull / Tier
    const handleUpgradeHull = () => {
      if (this.playerShip && this.playerShip.upgradeTier()) {
        this.ui.updatePlayerHUD(this.playerShip);
      }
    };
    document.getElementById('btn-upgrade-hull')?.addEventListener('click', handleUpgradeHull);
    document.getElementById('btn-modal-upgrade-hull')?.addEventListener('click', handleUpgradeHull);

    // Upgrades: Sails / Speed
    const handleUpgradeSails = () => {
      if (this.playerShip && this.playerShip.upgradeSails()) {
        this.ui.updatePlayerHUD(this.playerShip);
      }
    };
    document.getElementById('btn-upgrade-sails')?.addEventListener('click', handleUpgradeSails);
    document.getElementById('btn-modal-upgrade-sails')?.addEventListener('click', handleUpgradeSails);

    // Upgrades: Cannons / Artillery
    const handleUpgradeCannons = () => {
      if (this.playerShip && this.playerShip.upgradeCannons()) {
        this.ui.updatePlayerHUD(this.playerShip);
      }
    };
    document.getElementById('btn-upgrade-cannons')?.addEventListener('click', handleUpgradeCannons);
    document.getElementById('btn-modal-upgrade-cannons')?.addEventListener('click', handleUpgradeCannons);

    // Mid-game Shop open/close
    const shopModal = document.getElementById('shipyard-modal');
    document.getElementById('btn-open-shop')?.addEventListener('click', () => {
      if (shopModal) {
        shopModal.style.display = 'flex';
        this.ui.updateShipyardUI(this.playerShip);
      }
    });
    document.getElementById('btn-close-shop')?.addEventListener('click', () => {
      if (shopModal) shopModal.style.display = 'none';
    });

    // Host Button
    const btnHost = document.getElementById('btn-host');
    if (btnHost) {
      btnHost.addEventListener('click', () => {
        sounds.ensureContext();
        this.gameMode = 'host';
        this.network.hostGame();
      });
    }

    // Join Button
    const btnJoin = document.getElementById('btn-join');
    if (btnJoin) {
      btnJoin.addEventListener('click', () => {
        sounds.ensureContext();
        const codeInput = document.getElementById('join-code');
        const code = codeInput ? codeInput.value.trim() : '';
        if (!code) {
          alert('Veuillez entrer un code de salon valide !');
          return;
        }
        this.gameMode = 'client';
        this.ui.showAnnouncement('Connexion au salon P2P...');
        this.network.joinGame(code);
      });
    }

    // Solo vs AI Button
    const btnSolo = document.getElementById('btn-solo');
    if (btnSolo) {
      btnSolo.addEventListener('click', () => {
        sounds.ensureContext();
        this.startMatch('solo', 'SOLO');
      });
    }

    // Copy room link
    const btnCopy = document.getElementById('btn-copy-link');
    if (btnCopy) {
      btnCopy.addEventListener('click', () => {
        const link = `${window.location.origin}${window.location.pathname}?room=${this.network.roomCode}`;
        navigator.clipboard.writeText(link).then(() => {
          btnCopy.textContent = '✅ Lien copié dans le presse-papier !';
          setTimeout(() => {
            btnCopy.textContent = '📋 Copier le lien d\'invitation directe';
          }, 3000);
        });
      });
    }

    // Room badge in HUD (click to copy)
    const roomBadge = document.getElementById('room-badge');
    if (roomBadge) {
      roomBadge.addEventListener('click', () => {
        if (this.network.roomCode) {
          const link = `${window.location.origin}${window.location.pathname}?room=${this.network.roomCode}`;
          navigator.clipboard.writeText(link);
          this.ui.showAnnouncement('Lien du salon P2P copié !');
        }
      });
    }

    // Emotes buttons
    const emoteBtns = document.querySelectorAll('.emote-btn');
    emoteBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const msg = btn.dataset.emote;
        this.triggerEmote(msg);
      });
    });

    // Mute button
    const muteBtn = document.getElementById('mute-btn');
    if (muteBtn) {
      muteBtn.addEventListener('click', () => {
        const isMuted = sounds.toggleMute();
        muteBtn.textContent = isMuted ? '🔇' : '🔊';
      });
    }

    // Rematch button
    const btnRematch = document.getElementById('btn-rematch');
    if (btnRematch) {
      btnRematch.addEventListener('click', () => {
        document.getElementById('game-over-modal').style.display = 'none';
        if (this.gameMode === 'solo') {
          this.resetMatch();
        } else {
          this.network.sendRematch();
          this.resetMatch();
        }
      });
    }

    // Return to lobby button
    const btnReturn = document.getElementById('btn-return-lobby');
    if (btnReturn) {
      btnReturn.addEventListener('click', () => {
        this.network.disconnect();
        this.cleanupMatch();
        this.ui.showLobby();
      });
    }

    // On-screen Cannon HUD buttons (with hold-to-fire support)
    const btnFireLeft = document.getElementById('btn-fire-left');
    if (btnFireLeft) {
      const startLeft = (e) => {
        e.preventDefault();
        sounds.ensureContext();
        this.fireInputs.left = true;
        this.fireBroadside('left');
      };
      const stopLeft = () => { this.fireInputs.left = false; };
      btnFireLeft.addEventListener('mousedown', startLeft);
      window.addEventListener('mouseup', stopLeft);
      btnFireLeft.addEventListener('touchstart', startLeft, { passive: false });
      window.addEventListener('touchend', stopLeft, { passive: true });
    }
    const btnFireRight = document.getElementById('btn-fire-right');
    if (btnFireRight) {
      const startRight = (e) => {
        e.preventDefault();
        sounds.ensureContext();
        this.fireInputs.right = true;
        this.fireBroadside('right');
      };
      const stopRight = () => { this.fireInputs.right = false; };
      btnFireRight.addEventListener('mousedown', startRight);
      window.addEventListener('mouseup', stopRight);
      btnFireRight.addEventListener('touchstart', startRight, { passive: false });
      window.addEventListener('touchend', stopRight, { passive: true });
    }
    const btnFireBoth = document.getElementById('btn-fire-both');
    if (btnFireBoth) {
      const startBoth = (e) => {
        e.preventDefault();
        sounds.ensureContext();
        this.fireInputs.both = true;
        this.fireBroadside('left');
        this.fireBroadside('right');
      };
      const stopBoth = () => { this.fireInputs.both = false; };
      btnFireBoth.addEventListener('mousedown', startBoth);
      window.addEventListener('mouseup', stopBoth);
      btnFireBoth.addEventListener('touchstart', startBoth, { passive: false });
      window.addEventListener('touchend', stopBoth, { passive: true });
    }

    // Boost bar on-screen click/touch
    const boostBar = document.querySelector('.boost-container');
    if (boostBar) {
      boostBar.addEventListener('mousedown', () => { this.keys.boost = true; });
      window.addEventListener('mouseup', () => { this.keys.boost = false; });
      boostBar.addEventListener('touchstart', () => { this.keys.boost = true; }, { passive: true });
      window.addEventListener('touchend', () => { this.keys.boost = false; }, { passive: true });
    }
  }

  setupInputs() {
    // Prevent right click menu for flawless starboard cannon firing
    window.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('keydown', (e) => {
      sounds.ensureContext();

      // Navigation (Z/Q/S/D or W/A/S/D or Arrows)
      if (e.code === 'KeyW' || e.code === 'KeyZ' || e.code === 'ArrowUp') this.keys.forward = true;
      if (e.code === 'KeyS' || e.code === 'ArrowDown') this.keys.backward = true;
      if (e.code === 'KeyA' || e.code === 'KeyQ' || e.code === 'ArrowLeft') this.keys.left = true;
      if (e.code === 'KeyD' || e.code === 'ArrowRight') this.keys.right = true;

      // Boost: Shift
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        this.keys.boost = true;
      }

      // Shop: Key B
      if (e.code === 'KeyB') {
        const modal = document.getElementById('shipyard-modal');
        if (modal) {
          const isShown = modal.style.display === 'flex';
          modal.style.display = isShown ? 'none' : 'flex';
          if (!isShown) this.ui.updateShipyardUI(this.playerShip);
        }
      }

      if (!this.gameActive || !this.playerShip) return;

      // Cannons: Port (Left) broadside -> F or X (Hold-to-fire support)
      if (e.code === 'KeyF' || e.code === 'KeyX') {
        this.fireInputs.left = true;
        this.fireBroadside('left');
      }
      // Cannons: Starboard (Right) broadside -> E or C
      if (e.code === 'KeyE' || e.code === 'KeyC') {
        this.fireInputs.right = true;
        this.fireBroadside('right');
      }

      // Space = Fire double broadside / volley!
      if (e.code === 'Space') {
        e.preventDefault();
        this.fireInputs.both = true;
        this.fireBroadside('left');
        this.fireBroadside('right');
      }

      // Quick chat emotes 1, 2, 3, 4
      if (e.code === 'Digit1') this.triggerEmote("Ahoy ! 🏴‍☠️");
      if (e.code === 'Digit2') this.triggerEmote("À l'abordage ! ⚔️");
      if (e.code === 'Digit3') this.triggerEmote("Feu à volonté ! 💣");
      if (e.code === 'Digit4') this.triggerEmote("Bien joué marin ! 🍺");
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'KeyW' || e.code === 'KeyZ' || e.code === 'ArrowUp') this.keys.forward = false;
      if (e.code === 'KeyS' || e.code === 'ArrowDown') this.keys.backward = false;
      if (e.code === 'KeyA' || e.code === 'KeyQ' || e.code === 'ArrowLeft') this.keys.left = false;
      if (e.code === 'KeyD' || e.code === 'ArrowRight') this.keys.right = false;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.keys.boost = false;

      if (e.code === 'KeyF' || e.code === 'KeyX') this.fireInputs.left = false;
      if (e.code === 'KeyE' || e.code === 'KeyC') this.fireInputs.right = false;
      if (e.code === 'Space') this.fireInputs.both = false;
    });

    // Mouse click & hold shooting (Left click = Port broadside, Right click = Starboard broadside)
    this.renderer.domElement.addEventListener('mousedown', (e) => {
      sounds.ensureContext();
      if (!this.gameActive || !this.playerShip) return;
      if (e.button === 0 && !e.shiftKey && !e.ctrlKey) {
        this.fireInputs.left = true;
        this.fireBroadside('left');
      } else if (e.button === 2) {
        this.fireInputs.right = true;
        this.fireBroadside('right');
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.fireInputs.left = false;
      if (e.button === 2) this.fireInputs.right = false;
    });
  }

  setupNetworkCallbacks() {
    this.network.on('host_ready', (code) => {
      const box = document.getElementById('host-status-box');
      const disp = document.getElementById('host-code-display');
      if (box && disp) {
        box.style.display = 'block';
        disp.textContent = code;
      }
    });

    this.network.on('connected', (info) => {
      this.ui.showAnnouncement('Adversaire connecté ! La bataille commence !');
      this.startMatch(info.isHost ? 'host' : 'client', info.roomCode);
    });

    this.network.on('disconnected', () => {
      this.ui.showAnnouncement('Adversaire déconnecté !');
      this.ui.addFeedMessage('⚠️ Connexion P2P perdue avec l\'adversaire');
      if (this.peerShip) {
        this.peerShip.destroy();
        this.peerShip = null;
      }
    });

    this.network.on('remote_state', (state) => {
      if (!this.peerShip && state) {
        this.createPeerShip(state.id, state.name, state.tierIndex);
      }
      if (this.peerShip) {
        this.peerShip.applyNetworkState(state, 1 / 30);
      }
    });

    this.network.on('remote_fire', (data) => {
      if (this.projectiles) {
        this.projectiles.spawnRemoteVolley(data.shooterId || 'peer', data.shots);
      }
    });

    this.network.on('remote_damage', (data) => {
      if (this.playerShip && this.playerShip.id === data.targetId) {
        this.playerShip.takeDamage(data.damage, data.attackerId);
      }
    });

    this.network.on('remote_sink', (data) => {
      this.ui.addFeedMessage(`☠️ <strong>${data.targetId}</strong> a été coulé par <strong>${data.attackerId}</strong> !`);
      sounds.playBell();
    });

    this.network.on('ai_sync', (ais) => {
      // Client receives authoritative AI states from Host
      if (this.gameMode === 'client') {
        ais.forEach((aiData) => {
          let aiShip = this.aiShips.find(a => a.id === aiData.id);
          if (!aiShip) {
            aiShip = new AIShip(aiData.id, aiData.name, aiData.tierIndex, this.scene, this.ocean, this.effects);
            this.aiShips.push(aiShip);
          }
          aiShip.applyNetworkState(aiData, 1 / 30);
        });
      }
    });

    this.network.on('chat', (data) => {
      this.ui.addFeedMessage(`💬 <strong>${data.sender}</strong> : ${data.message}`);
      sounds.playLoot();
    });

    this.network.on('rematch', () => {
      this.ui.showAnnouncement('Revanche acceptée !');
      document.getElementById('game-over-modal').style.display = 'none';
      this.resetMatch();
    });

    this.network.on('error', (err) => {
      this.ui.showAnnouncement(`Erreur P2P : ${err}`);
    });
  }

  startMatch(mode, roomCode = 'SOLO') {
    this.cleanupMatch();
    this.gameMode = mode;
    this.gameActive = true;

    // Set Room Code badge
    const hudRoom = document.getElementById('hud-room-code');
    if (hudRoom) hudRoom.textContent = roomCode;

    // Create Local Player Ship
    const myId = `player_${Math.floor(Math.random() * 10000)}`;
    const startX = mode === 'client' ? 70 : -70;
    const startZ = mode === 'client' ? 70 : -70;
    const startYaw = mode === 'client' ? -Math.PI / 4 : (3 * Math.PI) / 4;

    this.playerShip = new Ship(
      myId,
      this.playerName,
      0, // loads saved tier from localStorage
      this.scene,
      this.ocean,
      this.effects,
      true
    );
    this.playerShip.position.set(startX, 0, startZ);
    this.playerShip.yaw = startYaw;

    this.playerShip.onSink = (victimId, attackerId) => {
      this.handleShipSink(this.playerShip, attackerId);
    };

    // Attach Camera
    this.cameraFollow.setTarget(this.playerShip);

    // Update Player HUD Name
    const hudName = document.getElementById('hud-player-name');
    if (hudName) hudName.textContent = this.playerName;

    // Spawn AI Ships if Solo or Host
    if (mode === 'solo' || mode === 'host') {
      this.spawnAIFleet();
    }

    // Switch UI
    this.ui.showHUD();
    this.ui.showAnnouncement('Capitaine à bord ! Tous aux postes de combat !', 3500);
  }

  createPeerShip(id, name, tierIndex) {
    if (this.peerShip) return;
    this.peerShip = new Ship(
      id,
      name,
      tierIndex || 0,
      this.scene,
      this.ocean,
      this.effects,
      false
    );
    this.ui.addFeedMessage(`⚔️ <strong>${name}</strong> a pris la mer !`);
  }

  spawnAIFleet() {
    const aiConfigs = [
      {
        id: 'ai_redbeard',
        name: 'Barbe-Rousse',
        tierIndex: 2, // Galion Pirate (700 PV)
        pos: new THREE.Vector3(120, 0, -120),
        waypoints: [
          new THREE.Vector3(120, 0, -120),
          new THREE.Vector3(-100, 0, -140),
          new THREE.Vector3(-120, 0, 100),
          new THREE.Vector3(100, 0, 120)
        ]
      },
      {
        id: 'ai_specter',
        name: 'Spectre des Mers',
        tierIndex: 4, // Hollandais Maudit (1300 PV)
        pos: new THREE.Vector3(-140, 0, -60),
        waypoints: [
          new THREE.Vector3(-140, 0, -60),
          new THREE.Vector3(-50, 0, 140),
          new THREE.Vector3(150, 0, -50)
        ]
      },
      {
        id: 'ai_swifthawk',
        name: 'Faucon Noir',
        tierIndex: 1, // Brigantin (480 PV)
        pos: new THREE.Vector3(0, 0, 160),
        waypoints: [
          new THREE.Vector3(0, 0, 160),
          new THREE.Vector3(-150, 0, 0),
          new THREE.Vector3(150, 0, 0)
        ]
      }
    ];

    aiConfigs.forEach(cfg => {
      const ai = new AIShip(
        cfg.id,
        cfg.name,
        cfg.tierIndex,
        this.scene,
        this.ocean,
        this.effects,
        cfg.waypoints
      );
      ai.position.copy(cfg.pos);
      ai.onSink = (victimId, attackerId) => {
        this.handleShipSink(ai, attackerId);
      };
      this.aiShips.push(ai);
    });
  }

  fireBroadside(side) {
    if (!this.playerShip || !this.projectiles) return;
    const fired = this.playerShip.fire(side, this.projectiles);
    if (fired) {
      // Replicate to network peer
      if (this.network.connected) {
        this.network.sendFire(side, fired.positions, fired.directions);
      }
    }
  }

  triggerEmote(msg) {
    if (!this.playerShip) return;
    this.ui.addFeedMessage(`💬 <strong>${this.playerName}</strong> : ${msg}`);
    sounds.playLoot();
    if (this.network.connected) {
      this.network.sendChat(this.playerName, msg);
    }
  }

  handleShipSink(victim, attackerId) {
    const isPlayerVictim = victim === this.playerShip;
    const isPlayerAttacker = this.playerShip && attackerId === this.playerShip.id;

    if (isPlayerAttacker) {
      this.playerShip.addGold(100);
      this.playerShip.score += 150;
      this.ui.showAnnouncement('🎯 Vous avez coulé un navire ennemi ! +100 Or', 3000);
      sounds.playVictory();
    }

    if (isPlayerVictim) {
      this.ui.showAnnouncement('☠️ Votre navire a été coulé ! Réapparition imminente...', 4000);
      setTimeout(() => {
        if (this.playerShip && this.gameActive) {
          const spawnX = (Math.random() - 0.5) * 120;
          const spawnZ = (Math.random() - 0.5) * 120;
          this.playerShip.respawn(new THREE.Vector3(spawnX, 0, spawnZ));
        }
      }, 4000);
    }

    if (this.network.connected) {
      this.network.sendSink(victim.name, attackerId === this.playerShip.id ? this.playerName : attackerId);
    }
  }

  resetMatch() {
    if (this.playerShip) {
      this.playerShip.respawn(new THREE.Vector3(0, 0, 0));
    }
    this.aiShips.forEach(ai => {
      ai.respawn(ai.waypoints[0] || new THREE.Vector3(50, 0, 50));
    });
  }

  cleanupMatch() {
    this.gameActive = false;
    if (this.playerShip) {
      this.playerShip.destroy();
      this.playerShip = null;
    }
    if (this.peerShip) {
      this.peerShip.destroy();
      this.peerShip = null;
    }
    this.aiShips.forEach(ai => ai.destroy());
    this.aiShips = [];
    if (this.projectiles) this.projectiles.clear();
    if (this.effects) this.effects.clear();
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const dt = Math.min(this.clock.getDelta(), 0.1);
    const time = this.clock.getElapsedTime();

    // 1. Update Ocean Waves
    this.ocean.update(dt);

    // 2. Update Map (Floating Loot bobbing, etc.)
    this.map.update(dt, time);

    if (this.gameActive && this.playerShip) {
      // 3. Player Ship Controls & Physics
      this.playerShip.setInputs(
        this.keys.forward,
        this.keys.backward,
        this.keys.left,
        this.keys.right,
        this.keys.boost
      );
      this.playerShip.update(dt, this.map);

      // Continuous Hold-To-Fire Barrage
      if (this.fireInputs.left || this.fireInputs.both) {
        if (this.playerShip.canFire('left')) {
          this.fireBroadside('left');
        }
      }
      if (this.fireInputs.right || this.fireInputs.both) {
        if (this.playerShip.canFire('right')) {
          this.fireBroadside('right');
        }
      }

      // Check Loot Pickups (Chests & Rum Barrels)
      const picked = this.map.checkLootPickup(this.playerShip.position);
      picked.forEach(item => {
        if (item.type === 'chest') {
          this.playerShip.addGold(50);
          this.ui.showAnnouncement('💰 Trésor ramassé ! +50 Or');
        } else if (item.type === 'barrel') {
          this.playerShip.heal(35);
          this.ui.showAnnouncement('🍺 Baril de Rhum ! +35 Réparation');
        }
        if (this.network.connected) {
          this.network.sendLootPickup(item.id, this.playerShip.id);
        }
      });

      // 4. Update AI Ships (Host & Solo)
      if (this.gameMode === 'solo' || this.gameMode === 'host') {
        const potentialTargets = [this.playerShip];
        if (this.peerShip) potentialTargets.push(this.peerShip);

        this.aiShips.forEach(ai => {
          ai.updateAI(dt, potentialTargets, this.projectiles, this.map);
        });
      }

      // 4b. Ship-to-Ship physical elastic bounce collisions & ramming
      if (this.peerShip) {
        this.playerShip.resolveShipCollision(this.peerShip);
      }
      this.aiShips.forEach(ai => {
        this.playerShip.resolveShipCollision(ai);
        if (this.peerShip) {
          this.peerShip.resolveShipCollision(ai);
        }
      });
      for (let i = 0; i < this.aiShips.length; i++) {
        for (let j = i + 1; j < this.aiShips.length; j++) {
          this.aiShips[i].resolveShipCollision(this.aiShips[j]);
        }
      }

      // 5. Update Cannonballs & Ballistics
      const allTargets = [this.playerShip];
      if (this.peerShip) allTargets.push(this.peerShip);
      this.aiShips.forEach(ai => allTargets.push(ai));

      this.projectiles.update(dt, allTargets, (target, dmg, attackerId) => {
        target.takeDamage(dmg, attackerId);
        if (this.network.connected && target === this.peerShip) {
          this.network.sendDamage(target.id, dmg, attackerId);
        }
      });

      // 6. Update HUD
      this.ui.updatePlayerHUD(this.playerShip);
      this.ui.updateMinimap(
        this.playerShip,
        this.peerShip,
        this.aiShips,
        this.map.obstacles,
        this.map.floatingLoot
      );

      // 7. Network State Sync (30 Hz)
      if (this.network.connected) {
        this.netTickTimer += dt;
        if (this.netTickTimer >= this.netTickInterval) {
          this.netTickTimer = 0;
          this.network.sendState(this.playerShip.getNetworkState());

          // If Host, synchronize AI fleet to peer
          if (this.gameMode === 'host' && this.aiShips.length > 0) {
            const aiStates = this.aiShips.map(ai => ai.getNetworkState());
            this.network.sendAISync(aiStates);
          }
        }
      }
    } else if (this.playerShip) {
      this.playerShip.setInputs(false, false, false, false, false);
      this.playerShip.update(dt, this.map);
    }

    // 8. Update Camera & Effects
    this.cameraFollow.update(dt);
    this.effects.update(dt);

    // 9. Render Scene
    this.renderer.render(this.scene, this.camera);
  }

  onResize() {
    if (!this.camera || !this.renderer) return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}

// Start game when DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
  new Game();
});
