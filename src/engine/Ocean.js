import * as THREE from 'three';

export class Ocean {
  constructor(scene, size = 1200, segments = 160) {
    this.scene = scene;
    this.size = size;
    this.time = 0;

    // Ocean geometry
    const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
    geometry.rotateX(-Math.PI / 2);

    // Wave parameters (shared between CPU physics & GPU vertex shader)
    this.params = {
      waveA: { dir: new THREE.Vector2(1.0, 0.4).normalize(), length: 45.0, amplitude: 1.1, speed: 2.2 },
      waveB: { dir: new THREE.Vector2(-0.4, 1.0).normalize(), length: 26.0, amplitude: 0.65, speed: 2.8 },
      waveC: { dir: new THREE.Vector2(0.7, -0.7).normalize(), length: 14.0, amplitude: 0.35, speed: 3.5 },
      deepColor: new THREE.Color(0x0a4d68),
      shallowColor: new THREE.Color(0x19a7ce),
      foamColor: new THREE.Color(0xffffff)
    };

    // Material with custom shader injection for cartoon waves & foam
    this.material = new THREE.MeshStandardMaterial({
      color: this.params.shallowColor,
      roughness: 0.15,
      metalness: 0.05,
      flatShading: true,
      transparent: true,
      opacity: 0.94
    });

    this.uniforms = {
      uTime: { value: 0 },
      uDeepColor: { value: this.params.deepColor },
      uShallowColor: { value: this.params.shallowColor },
      uFoamColor: { value: this.params.foamColor }
    };

    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.uniforms.uTime;
      shader.uniforms.uDeepColor = this.uniforms.uDeepColor;
      shader.uniforms.uShallowColor = this.uniforms.uShallowColor;
      shader.uniforms.uFoamColor = this.uniforms.uFoamColor;

      // Vertex shader injection for wave animation
      shader.vertexShader = `
        uniform float uTime;
        varying float vWaveHeight;
        varying vec3 vWorldPosition;
      ` + shader.vertexShader;

      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        
        vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        vWorldPosition = worldPos;

        // Wave formula matching CPU
        float h = 0.0;
        
        // Wave A
        float kA = 6.28318 / 45.0;
        float phaseA = (worldPos.x * 0.928 + worldPos.z * 0.371) * kA - uTime * 2.2;
        h += sin(phaseA) * 1.1;

        // Wave B
        float kB = 6.28318 / 26.0;
        float phaseB = (-worldPos.x * 0.371 + worldPos.z * 0.928) * kB - uTime * 2.8;
        h += sin(phaseB) * 0.65;

        // Wave C
        float kC = 6.28318 / 14.0;
        float phaseC = (worldPos.x * 0.707 - worldPos.z * 0.707) * kC - uTime * 3.5;
        h += sin(phaseC) * 0.35;

        transformed.y += h;
        vWaveHeight = h;
        `
      );

      // Fragment shader injection for cartoon gradient and foam crests
      shader.fragmentShader = `
        uniform vec3 uDeepColor;
        uniform vec3 uShallowColor;
        uniform vec3 uFoamColor;
        varying float vWaveHeight;
        varying vec3 vWorldPosition;
      ` + shader.fragmentShader;

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `
        #include <color_fragment>
        
        float normalizedH = clamp((vWaveHeight + 1.8) / 3.6, 0.0, 1.0);
        vec3 waterColor = mix(uDeepColor, uShallowColor, normalizedH);

        // Foam on wave crests
        float foamFactor = smoothstep(1.3, 1.8, vWaveHeight);
        diffuseColor.rgb = mix(waterColor, uFoamColor, foamFactor * 0.75);
        `
      );
    };

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.receiveShadow = true;
    this.mesh.position.y = 0;
    scene.add(this.mesh);
  }

  // Exact CPU calculation for ships, cannonballs, and floating items
  getWaveHeight(x, z, time = this.time) {
    let h = 0;

    // Wave A
    const kA = (Math.PI * 2) / 45.0;
    const phaseA = (x * 0.928 + z * 0.371) * kA - time * 2.2;
    h += Math.sin(phaseA) * 1.1;

    // Wave B
    const kB = (Math.PI * 2) / 26.0;
    const phaseB = (-x * 0.371 + z * 0.928) * kB - time * 2.8;
    h += Math.sin(phaseB) * 0.65;

    // Wave C
    const kC = (Math.PI * 2) / 14.0;
    const phaseC = (x * 0.707 - z * 0.707) * kC - time * 3.5;
    h += Math.sin(phaseC) * 0.35;

    return h;
  }

  getWaveNormal(x, z, time = this.time) {
    const delta = 1.0;
    const hL = this.getWaveHeight(x - delta, z, time);
    const hR = this.getWaveHeight(x + delta, z, time);
    const hD = this.getWaveHeight(x, z - delta, time);
    const hU = this.getWaveHeight(x, z + delta, time);

    const normal = new THREE.Vector3(hL - hR, 2.0 * delta, hD - hU);
    return normal.normalize();
  }

  update(dt) {
    this.time += dt;
    this.uniforms.uTime.value = this.time;
  }
}
