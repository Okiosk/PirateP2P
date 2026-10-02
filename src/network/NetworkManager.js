import { Peer } from 'peerjs';

export class NetworkManager {
  constructor() {
    this.peer = null;
    this.conn = null;
    this.isHost = false;
    this.roomCode = null;
    this.connected = false;
    this.callbacks = {};
  }

  on(event, cb) {
    this.callbacks[event] = cb;
  }

  emit(event, ...args) {
    if (this.callbacks[event]) {
      this.callbacks[event](...args);
    }
  }

  // Generate a friendly 5-character pirate room code
  generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'PIRATE-';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  // Host a game
  hostGame(customCode = null) {
    this.isHost = true;
    this.roomCode = customCode || this.generateRoomCode();

    // Use PeerJS default cloud signaling
    const peerId = `piratep2p_${this.roomCode.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    this.peer = new Peer(peerId, {
      debug: 1
    });

    this.peer.on('open', (id) => {
      console.log('PeerJS Host open with ID:', id);
      this.emit('host_ready', this.roomCode);
    });

    this.peer.on('connection', (conn) => {
      console.log('Incoming peer connection from:', conn.peer);
      this.setupConnection(conn);
    });

    this.peer.on('error', (err) => {
      console.warn('PeerJS Host Error:', err);
      if (err.type === 'unavailable-id') {
        // Retry with another code if taken
        this.hostGame(this.generateRoomCode());
      } else {
        this.emit('error', err.type || err.message);
      }
    });
  }

  // Join an existing game
  joinGame(roomCode) {
    this.isHost = false;
    this.roomCode = roomCode.trim().toUpperCase();
    const targetPeerId = `piratep2p_${this.roomCode.toLowerCase().replace(/[^a-z0-9]/g, '')}`;

    this.peer = new Peer({
      debug: 1
    });

    this.peer.on('open', (myId) => {
      console.log('PeerJS Client open, connecting to host:', targetPeerId);
      const conn = this.peer.connect(targetPeerId, {
        reliable: true
      });
      this.setupConnection(conn);
    });

    this.peer.on('error', (err) => {
      console.warn('PeerJS Client Error:', err);
      this.emit('error', err.type || err.message);
    });
  }

  setupConnection(conn) {
    this.conn = conn;

    this.conn.on('open', () => {
      console.log('WebRTC P2P DataChannel connected!');
      this.connected = true;
      this.emit('connected', {
        isHost: this.isHost,
        roomCode: this.roomCode,
        peerId: conn.peer
      });
    });

    this.conn.on('data', (data) => {
      this.handleIncomingData(data);
    });

    this.conn.on('close', () => {
      console.log('WebRTC Connection closed');
      this.connected = false;
      this.emit('disconnected');
    });

    this.conn.on('error', (err) => {
      console.warn('WebRTC DataChannel error:', err);
      this.emit('error', err.message);
    });
  }

  handleIncomingData(data) {
    if (!data || !data.type) return;

    switch (data.type) {
      case 'STATE':
        this.emit('remote_state', data.state);
        break;
      case 'FIRE':
        this.emit('remote_fire', data);
        break;
      case 'DAMAGE':
        this.emit('remote_damage', data);
        break;
      case 'SINK':
        this.emit('remote_sink', data);
        break;
      case 'LOOT_PICKUP':
        this.emit('remote_loot', data);
        break;
      case 'AI_SYNC':
        this.emit('ai_sync', data.ais);
        break;
      case 'CHAT':
        this.emit('chat', data);
        break;
      case 'REMATCH':
        this.emit('rematch', data);
        break;
      default:
        this.emit(data.type, data);
        break;
    }
  }

  send(data) {
    if (this.conn && this.connected) {
      try {
        this.conn.send(data);
      } catch (e) {
        console.warn('Failed to send P2P message:', e);
      }
    }
  }

  sendState(shipState) {
    this.send({
      type: 'STATE',
      state: shipState
    });
  }

  sendFire(side, positions, directions) {
    this.send({
      type: 'FIRE',
      side: side,
      shots: positions.map((p, i) => ({
        pos: { x: p.x, y: p.y, z: p.z },
        vel: {
          x: directions[i].x * 48.0,
          y: 7.5,
          z: directions[i].z * 48.0
        }
      }))
    });
  }

  sendDamage(targetId, dmg, attackerId) {
    this.send({
      type: 'DAMAGE',
      targetId: targetId,
      damage: dmg,
      attackerId: attackerId
    });
  }

  sendSink(targetId, attackerId) {
    this.send({
      type: 'SINK',
      targetId: targetId,
      attackerId: attackerId
    });
  }

  sendLootPickup(lootId, playerId) {
    this.send({
      type: 'LOOT_PICKUP',
      lootId: lootId,
      playerId: playerId
    });
  }

  sendAISync(aiStates) {
    this.send({
      type: 'AI_SYNC',
      ais: aiStates
    });
  }

  sendChat(senderName, message) {
    this.send({
      type: 'CHAT',
      sender: senderName,
      message: message
    });
  }

  sendRematch() {
    this.send({
      type: 'REMATCH'
    });
  }

  disconnect() {
    if (this.conn) {
      this.conn.close();
      this.conn = null;
    }
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
    this.connected = false;
    this.isHost = false;
  }
}
