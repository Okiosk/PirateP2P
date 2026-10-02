import * as THREE from 'three';

export class Ocean {
  constructor(scene, size = 1400, segments = 180) {
    this.scene = scene;
    this.size = size;
    this.time = 0;

    // Ocean geometry
    const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
    geometry.rotateX(-Math.PI / 2);

    // Cel-shaded Cartoon Colors
    this.colors = {
      deep: new THREE.Color(0x064e6b),      // Deep Caribbean turquoise navy
      mid: new THREE.Color(0x0891b2),       // Vivid tropical lagoon cyan
      shallow: new THREE.Color(0x22d3ee),   // Crystal shallow cyan
      foam: new THREE.Color(0xffffff),      // Crisp white seafoam
      sun: new THREE.Color(0xfffbeb)        // Warm sun highlight
    };

    this.uniforms = {
      uTime: { value: 0 },
      uDeepColor: { value: this.colors.deep },
      uMidColor: { value: this.colors.mid },
      uShallowColor: { value: this.colors.shallow },
      uFoamColor: { value: this.colors.foam },
      uSunDir: { value: new THREE.Vector3(120, 160, 100).normalize() }
    };

    // Custom Cartoon Ocean Shader Material
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: `
        uniform float uTime;
        varying vec3 vWorldPos;
        varying vec3 vNormal;
        varying float vWaveHeight;

        // Wave formula matching CPU
        float calcWave(vec2 p, float t) {
          float h = 0.0;

          // Wave 1: Broad ocean swell
          float k1 = 6.28318 / 55.0;
          float p1 = (p.x * 0.85 + p.y * 0.52) * k1 - t * 2.2;
          h += sin(p1) * 1.5;

          // Wave 2: Choppy cross-wave
          float k2 = 6.28318 / 28.0;
          float p2 = (-p.x * 0.52 + p.y * 0.85) * k2 - t * 2.8;
          h += sin(p2) * 0.75;

          // Wave 3: Fine cartoon ripple
          float k3 = 6.28318 / 14.0;
          float p3 = (p.x * 0.707 - p.y * 0.707) * k3 - t * 3.6;
          h += sin(p3) * 0.35;

          return h;
        }

        void main() {
          vec3 pos = position;
          vec4 worldPos = modelMatrix * vec4(pos, 1.0);
          
          float h = calcWave(worldPos.xz, uTime);
          worldPos.y += h;
          vWaveHeight = h;
          vWorldPos = worldPos.xyz;

          // Analytical normals for crisp cartoon shading
          float delta = 0.4;
          float hR = calcWave(worldPos.xz + vec2(delta, 0.0), uTime);
          float hL = calcWave(worldPos.xz - vec2(delta, 0.0), uTime);
          float hU = calcWave(worldPos.xz + vec2(0.0, delta), uTime);
          float hD = calcWave(worldPos.xz - vec2(0.0, delta), uTime);

          vec3 norm = normalize(vec3(hL - hR, 2.0 * delta, hD - hU));
          vNormal = norm;

          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uDeepColor;
        uniform vec3 uMidColor;
        uniform vec3 uShallowColor;
        uniform vec3 uFoamColor;
        uniform vec3 uSunDir;

        varying vec3 vWorldPos;
        varying vec3 vNormal;
        varying float vWaveHeight;

        // Procedural cartoon foam pattern
        float cartoonNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float n00 = sin(dot(i, vec2(12.9898, 78.233)) * 43758.5453);
          float n10 = sin(dot(i + vec2(1.0, 0.0), vec2(12.9898, 78.233)) * 43758.5453);
          float n01 = sin(dot(i + vec2(0.0, 1.0), vec2(12.9898, 78.233)) * 43758.5453);
          float n11 = sin(dot(i + vec2(1.0, 1.0), vec2(12.9898, 78.233)) * 43758.5453);
          return mix(mix(fract(n00), fract(n10), f.x), mix(fract(n01), fract(n11), f.x), f.y);
        }

        void main() {
          vec3 N = normalize(vNormal);
          vec3 L = normalize(uSunDir);
          vec3 V = normalize(cameraPosition - vWorldPos);

          // Cel-shaded Diffuse Lighting (stepped cartoon shading)
          float NdotL = dot(N, L);
          float lightStep = smoothstep(0.0, 0.15, NdotL) * 0.4 + smoothstep(0.45, 0.6, NdotL) * 0.6;

          // Water Depth Gradient based on wave height
          float normH = clamp((vWaveHeight + 2.0) / 4.0, 0.0, 1.0);
          vec3 waterCol;
          if (normH < 0.45) {
            waterCol = mix(uDeepColor, uMidColor, normH / 0.45);
          } else {
            waterCol = mix(uMidColor, uShallowColor, (normH - 0.45) / 0.55);
          }

          // Apply cartoon lighting
          vec3 finalColor = waterCol * (0.65 + 0.45 * lightStep);

          // Cartoon Specular Sun Highlight (sharp toon disc)
          vec3 H = normalize(L + V);
          float NdotH = max(0.0, dot(N, H));
          float spec = step(0.97, pow(NdotH, 32.0));
          finalColor += vec3(1.0, 0.98, 0.85) * spec * 0.75;

          // Stylized Cartoon Seafoam on wave crests
          vec2 foamUV = vWorldPos.xz * 0.12 + vec2(uTime * 0.08, uTime * 0.04);
          float foamNoise = cartoonNoise(foamUV * 4.0);
          float crestFoam = smoothstep(1.35, 2.2, vWaveHeight) * step(0.38, foamNoise);
          
          // Stylized foam rim borders
          float foamEdge = smoothstep(1.4, 1.7, vWaveHeight);
          float totalFoam = clamp(crestFoam + foamEdge * 0.65, 0.0, 1.0);
          finalColor = mix(finalColor, uFoamColor, totalFoam);

          // Distance atmospheric fade
          float dist = length(cameraPosition - vWorldPos);
          float fogFactor = smoothstep(250.0, 650.0, dist);
          vec3 fogColor = vec3(0.53, 0.81, 0.92); // Tropical sky horizon
          finalColor = mix(finalColor, fogColor, fogFactor * 0.8);

          gl_FragColor = vec4(finalColor, 0.96);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide
    });

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.position.y = 0;
    scene.add(this.mesh);
  }

  // CPU Wave Calculation matching vertex shader 100%
  getWaveHeight(x, z, time = this.time) {
    let h = 0;

    // Wave 1
    const k1 = (Math.PI * 2) / 55.0;
    const p1 = (x * 0.85 + z * 0.52) * k1 - time * 2.2;
    h += Math.sin(p1) * 1.5;

    // Wave 2
    const k2 = (Math.PI * 2) / 28.0;
    const p2 = (-x * 0.52 + z * 0.85) * k2 - time * 2.8;
    h += Math.sin(p2) * 0.75;

    // Wave 3
    const k3 = (Math.PI * 2) / 14.0;
    const p3 = (x * 0.707 - z * 0.707) * k3 - time * 3.6;
    h += Math.sin(p3) * 0.35;

    return h;
  }

  getWaveNormal(x, z, time = this.time) {
    const delta = 0.5;
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
