import * as THREE from 'three';
import { Ship } from './Ship.js';

export class AIShip extends Ship {
  constructor(id, name, typeKey, scene, ocean, effects, waypoints = []) {
    super(id, name, typeKey, scene, ocean, effects, false);
    this.waypoints = waypoints;
    this.currentWpIndex = 0;
    this.state = 'PATROL'; // 'PATROL' | 'COMBAT'
    this.fireTimer = 1.0 + Math.random() * 2.0;
    this.target = null;
    this.combatCooldown = 0;
  }

  updateAI(dt, players = [], projectileManager, map) {
    if (this.isDead) {
      super.update(dt, map);
      return;
    }

    // 1. Find closest valid target among players
    let closestTarget = null;
    let minDist = 95.0; // Detection radius

    players.forEach(p => {
      if (p && !p.isDead) {
        const d = this.position.distanceTo(p.position);
        if (d < minDist) {
          minDist = d;
          closestTarget = p;
        }
      }
    });

    this.target = closestTarget;

    // 2. State Machine: COMBAT or PATROL
    if (this.target) {
      this.state = 'COMBAT';
      this.handleCombat(dt, projectileManager);
    } else {
      this.state = 'PATROL';
      this.handlePatrol(dt);
    }

    // Run physics & collision update
    super.update(dt, map);
  }

  handlePatrol(dt) {
    if (!this.waypoints || this.waypoints.length === 0) {
      this.setInputs(true, false, false, false);
      return;
    }

    const currentWp = this.waypoints[this.currentWpIndex];
    const distToWp = this.position.distanceTo(currentWp);

    if (distToWp < 25.0) {
      this.currentWpIndex = (this.currentWpIndex + 1) % this.waypoints.length;
    }

    this.steerTowards(currentWp, 0.7);
  }

  handleCombat(dt, projectileManager) {
    const targetPos = this.target.position;
    const dist = this.position.distanceTo(targetPos);

    // Vector to target
    const toTarget = targetPos.clone().sub(this.position).normalize();

    // Ship vectors
    const forward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);

    // Dot products
    const forwardDot = forward.dot(toTarget);
    const rightDot = right.dot(toTarget);

    // If too far, approach
    if (dist > 55.0) {
      this.steerTowards(targetPos, 0.95);
    } else {
      // Circle target to present broadside (flank)
      // Decide whether Port (left) or Starboard (right) is closer
      const useRightBroadside = rightDot > 0;
      const flankDir = useRightBroadside ? right : right.clone().negate();

      // Check alignment of broadside with target
      const broadsideAlignment = flankDir.dot(toTarget);

      if (broadsideAlignment > 0.82) {
        // Aligned for broadside! Maintain speed and prepare fire
        this.setInputs(true, false, false, false);

        this.fireTimer -= dt;
        if (this.fireTimer <= 0) {
          const side = useRightBroadside ? 'right' : 'left';
          if (this.canFire(side)) {
            this.fire(side, projectileManager);
            this.fireTimer = 3.0 + Math.random() * 2.0;
          }
        }
      } else {
        // Turn towards broadside angle
        const steerLeft = rightDot > 0;
        this.setInputs(true, false, !steerLeft, steerLeft);
      }
    }
  }

  steerTowards(targetPoint, throttleAmount = 0.8) {
    const toTarget = targetPoint.clone().sub(this.position).normalize();
    const forward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);

    const rightDot = right.dot(toTarget);

    let left = false;
    let rightTurn = false;

    if (rightDot > 0.12) {
      rightTurn = true;
    } else if (rightDot < -0.12) {
      left = true;
    }

    this.setInputs(true, false, left, rightTurn);
    this.throttle = throttleAmount;
  }
}
