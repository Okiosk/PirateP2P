import * as THREE from 'three';
import { Ship } from './Ship.js';

export class AIShip extends Ship {
  constructor(id, name, tierIndex = 1, scene, ocean, effects, waypoints = []) {
    super(id, name, tierIndex, scene, ocean, effects, false);
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
    if (dist > 50.0) {
      this.steerTowards(targetPos, 0.95);
    } else {
      // Flank target to present broadside
      const useLeftBroadside = rightDot >= 0;
      const broadsideNormal = useLeftBroadside ? right : right.clone().negate();
      const broadsideAlignment = broadsideNormal.dot(toTarget);

      if (broadsideAlignment > 0.75) {
        // Aligned for broadside! Maintain speed and fire
        this.setInputs(true, false, false, false);

        this.fireTimer -= dt;
        if (this.fireTimer <= 0) {
          const side = useLeftBroadside ? 'left' : 'right';
          if (this.canFire(side)) {
            this.fire(side, projectileManager);
            this.fireTimer = 2.5 + Math.random() * 1.5;
          }
        }
      } else {
        // Steer towards flank
        if (forwardDot > 0.2) {
          this.setInputs(true, false, !useLeftBroadside, useLeftBroadside);
        } else {
          this.steerTowards(targetPos, 0.75);
        }
      }
    }
  }

  steerTowards(targetPoint, throttleAmount = 0.8) {
    const toTarget = targetPoint.clone().sub(this.position).normalize();
    const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);

    const rightDot = right.dot(toTarget);

    let left = false;
    let rightTurn = false;

    if (rightDot > 0.1) {
      left = true;
    } else if (rightDot < -0.1) {
      rightTurn = true;
    }

    this.setInputs(true, false, left, rightTurn);
    this.throttle = throttleAmount;
  }
}
