export class UIManager {
  constructor() {
    this.minimapCanvas = document.getElementById('minimap-canvas');
    if (this.minimapCanvas) {
      this.minimapCtx = this.minimapCanvas.getContext('2d');
    }
  }

  showLobby() {
    document.getElementById('lobby-screen').style.display = 'flex';
    document.getElementById('hud-screen').style.display = 'none';
    document.getElementById('game-over-modal').style.display = 'none';
  }

  showHUD() {
    document.getElementById('lobby-screen').style.display = 'none';
    document.getElementById('hud-screen').style.display = 'block';
  }

  updatePlayerHUD(ship) {
    if (!ship) return;
    const hpPct = Math.max(0, Math.min(100, (ship.hp / ship.maxHp) * 100));
    const hpBar = document.getElementById('player-hp-bar');
    const hpText = document.getElementById('player-hp-text');
    const goldText = document.getElementById('player-gold-text');
    const scoreText = document.getElementById('player-score-text');

    if (hpBar) {
      hpBar.style.width = `${hpPct}%`;
      hpBar.style.backgroundColor = hpPct > 50 ? '#2ecc71' : hpPct > 25 ? '#f39c12' : '#e74c3c';
    }
    if (hpText) hpText.textContent = `${Math.ceil(ship.hp)} / ${ship.maxHp} PV`;
    if (goldText) goldText.textContent = `${ship.gold} Or`;
    if (scoreText) scoreText.textContent = `${ship.score} pts`;

    // Boost Energy Bar
    const boostBar = document.getElementById('player-boost-bar');
    if (boostBar) {
      const boostPct = Math.max(0, Math.min(100, (ship.boostEnergy / ship.maxBoostEnergy) * 100));
      boostBar.style.width = `${boostPct}%`;
      boostBar.style.backgroundColor = ship.isBoosting ? '#38ef7d' : '#06b6d4';
    }

    // Cannon Cooldown Bars
    // Cannon Charge & Barrage Bars
    const leftBar = document.getElementById('cannon-left-bar');
    const rightBar = document.getElementById('cannon-right-bar');

    if (leftBar) {
      const leftChargePct = Math.max(0, Math.min(100, (ship.leftCharge / (ship.maxCharge || 100)) * 100));
      leftBar.style.width = `${leftChargePct}%`;
      leftBar.style.backgroundColor = leftChargePct > 40 ? '#38ef7d' : leftChargePct > 18 ? '#f39c12' : '#e74c3c';
    }

    if (rightBar) {
      const rightChargePct = Math.max(0, Math.min(100, (ship.rightCharge / (ship.maxCharge || 100)) * 100));
      rightBar.style.width = `${rightChargePct}%`;
      rightBar.style.backgroundColor = rightChargePct > 40 ? '#38ef7d' : rightChargePct > 18 ? '#f39c12' : '#e74c3c';
    }

    // Throttle label
    const throttleLabel = document.getElementById('throttle-label');
    if (throttleLabel) {
      if (ship.isBoosting) throttleLabel.textContent = '⚡ BOOST DE VENT !';
      else if (ship.throttle > 0.5) throttleLabel.textContent = 'Pleines Voiles (100%)';
      else if (ship.throttle > 0.1) throttleLabel.textContent = 'Demi-Voiles (50%)';
      else if (ship.throttle < -0.1) throttleLabel.textContent = 'Marche Arrière';
      else throttleLabel.textContent = 'Au Mouillage (Arrêt)';
    }

    // Update shipyard displays
    this.updateShipyardUI(ship);
  }

  updateShipyardUI(ship) {
    if (!ship) return;
    const gold = ship.gold;
    const tier = ship.config;

    // Lobby text
    const lobbyShipName = document.getElementById('lobby-ship-name');
    const lobbyShipStats = document.getElementById('lobby-ship-stats');
    const lobbyGold = document.getElementById('lobby-gold-count');
    const modalGold = document.getElementById('modal-gold-count');

    if (lobbyShipName) lobbyShipName.textContent = `${tier.name} (Rang ${ship.tierIndex + 1}/5)`;
    if (lobbyShipStats) lobbyShipStats.textContent = `${ship.maxHp} PV • Vitesse: ${Math.round(ship.speed)} m/s • ${ship.cannonsPerSide} Canons/bordée`;
    if (lobbyGold) lobbyGold.textContent = gold;
    if (modalGold) modalGold.textContent = gold;

    // Hull upgrade info
    const isMaxHull = ship.tierIndex >= 4;
    const nextHullTier = !isMaxHull ? window.__SHIP_TIERS[ship.tierIndex + 1] : null;
    const hullCost = nextHullTier ? nextHullTier.cost : 0;

    const setHullText = (descId, costId, btnId) => {
      const descEl = document.getElementById(descId);
      const costEl = document.getElementById(costId);
      const btnEl = document.getElementById(btnId);
      if (descEl) descEl.textContent = isMaxHull ? 'Rang Maximum Atteint !' : `${tier.name} ➔ ${nextHullTier.name}`;
      if (costEl) costEl.textContent = isMaxHull ? 'MAX' : `${hullCost} Or`;
      if (btnEl) btnEl.disabled = isMaxHull || gold < hullCost;
    };
    setHullText('upgrade-hull-desc', 'cost-hull', 'btn-upgrade-hull');
    setHullText('modal-hull-desc', 'modal-cost-hull', 'btn-modal-upgrade-hull');

    // Sails upgrade info
    const isMaxSails = ship.sailUpgrade >= 4;
    const sailsCost = (ship.sailUpgrade + 1) * 75;
    const setSailsText = (descId, costId, btnId) => {
      const descEl = document.getElementById(descId);
      const costEl = document.getElementById(costId);
      const btnEl = document.getElementById(btnId);
      if (descEl) descEl.textContent = isMaxSails ? 'Voilure Maximale' : `Niveau ${ship.sailUpgrade + 1}/5 (+4 m/s)`;
      if (costEl) costEl.textContent = isMaxSails ? 'MAX' : `${sailsCost} Or`;
      if (btnEl) btnEl.disabled = isMaxSails || gold < sailsCost;
    };
    setSailsText('upgrade-sails-desc', 'cost-sails', 'btn-upgrade-sails');
    setSailsText('modal-sails-desc', 'modal-cost-sails', 'btn-modal-upgrade-sails');

    // Cannons upgrade info
    const isMaxCannons = ship.cannonUpgrade >= 4;
    const cannonsCost = (ship.cannonUpgrade + 1) * 90;
    const setCannonsText = (descId, costId, btnId) => {
      const descEl = document.getElementById(descId);
      const costEl = document.getElementById(costId);
      const btnEl = document.getElementById(btnId);
      if (descEl) descEl.textContent = isMaxCannons ? 'Artillerie Maximale' : `Niveau ${ship.cannonUpgrade + 1}/5 (+1 canon)`;
      if (costEl) costEl.textContent = isMaxCannons ? 'MAX' : `${cannonsCost} Or`;
      if (btnEl) btnEl.disabled = isMaxCannons || gold < cannonsCost;
    };
    setCannonsText('upgrade-cannons-desc', 'cost-cannons', 'btn-upgrade-cannons');
    setCannonsText('modal-cannons-desc', 'modal-cost-cannons', 'btn-modal-upgrade-cannons');
  }

  showAnnouncement(text, duration = 3000) {
    const el = document.getElementById('announcement-banner');
    if (!el) return;
    el.textContent = text;
    el.classList.remove('hidden');
    el.classList.add('visible');

    clearTimeout(this.announcementTimer);
    this.announcementTimer = setTimeout(() => {
      el.classList.remove('visible');
      el.classList.add('hidden');
    }, duration);
  }

  addFeedMessage(msg) {
    const feed = document.getElementById('kill-feed');
    if (!feed) return;
    const item = document.createElement('div');
    item.className = 'feed-item';
    item.innerHTML = msg;
    feed.appendChild(item);

    setTimeout(() => {
      if (item.parentNode) item.parentNode.removeChild(item);
    }, 4500);
  }

  updateMinimap(playerShip, peerShip, aiShips = [], obstacles = [], loot = []) {
    if (!this.minimapCtx || !playerShip) return;
    const ctx = this.minimapCtx;
    const w = this.minimapCanvas.width;
    const h = this.minimapCanvas.height;
    const center = w / 2;
    const worldRadius = 380; // World bounds mapped to minimap radius
    const mapScale = (w * 0.45) / worldRadius;

    ctx.clearRect(0, 0, w, h);

    // Compass Background
    ctx.fillStyle = 'rgba(10, 25, 47, 0.85)';
    ctx.beginPath();
    ctx.arc(center, center, center - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Cardinal marks
    ctx.fillStyle = '#ffffff';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', center, 14);
    ctx.fillText('S', center, h - 6);
    ctx.fillText('O', 10, center + 4);
    ctx.fillText('E', w - 10, center + 4);

    const worldToMap = (x, z) => ({
      x: center + x * mapScale,
      y: center + z * mapScale
    });

    // 1. Draw Obstacles (Islands & Rocks)
    obstacles.forEach(obs => {
      const pt = worldToMap(obs.pos.x, obs.pos.z);
      const rad = obs.radius * mapScale;

      ctx.fillStyle = obs.type === 'island' ? '#d4a373' : '#7f8c8d';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, Math.max(2, rad), 0, Math.PI * 2);
      ctx.fill();
    });

    // 2. Draw Floating Loot
    loot.forEach(item => {
      if (item.isTaken) return;
      const pt = worldToMap(item.pos.x, item.pos.z);
      ctx.fillStyle = item.type === 'chest' ? '#f1c40f' : '#e67e22';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // 3. Draw AI Ships
    aiShips.forEach(ai => {
      if (ai.isDead) return;
      const pt = worldToMap(ai.position.x, ai.position.z);
      ctx.fillStyle = '#9b59b6';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // 4. Draw Peer Ship (Opponent)
    if (peerShip && !peerShip.isDead) {
      const pt = worldToMap(peerShip.position.x, peerShip.position.z);
      ctx.fillStyle = '#e74c3c';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // 5. Draw Player Ship (Green Arrow with direction)
    const playerPt = worldToMap(playerShip.position.x, playerShip.position.z);
    ctx.save();
    ctx.translate(playerPt.x, playerPt.y);
    ctx.rotate(playerShip.yaw);

    ctx.fillStyle = '#2ecc71';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4, 5);
    ctx.lineTo(0, 3);
    ctx.lineTo(-4, 5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  showGameOver(isWinner, stats) {
    const modal = document.getElementById('game-over-modal');
    const title = document.getElementById('game-over-title');
    const statsEl = document.getElementById('game-over-stats');

    if (!modal) return;
    modal.style.display = 'flex';

    if (title) {
      title.textContent = isWinner ? '🏆 VICTOIRE ÉPIQUE !' : '☠️ VOTRE NAVIRE A COULÉ...';
      title.style.color = isWinner ? '#f1c40f' : '#e74c3c';
    }

    if (statsEl) {
      statsEl.innerHTML = `
        <p>⚔️ Navires coulés : <strong>${stats.kills || 0}</strong></p>
        <p>💰 Or récolté : <strong>${stats.gold || 0}</strong></p>
        <p>🎯 Score Final : <strong>${stats.score || 0}</strong></p>
      `;
    }
  }
}
