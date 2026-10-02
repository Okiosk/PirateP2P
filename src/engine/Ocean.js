import * as THREE from 'three';

export class Ocean {
  constructor(scene, size = 1400, segments = 512) {
    this.scene = scene;
    this.size = size;
    this.time = 0;

    // Ultra high-detail ocean mesh (512x512 = 262k vertices)
    const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
    geometry.rotateX(-Math.PI / 2);

    // Cel-shaded Cartoon Tropical Palette
    this.colors = {
      deep: new THREE.Color(0x04344d),      // Deep Caribbean navy abyss
      mid: new THREE.Color(0x087e9d),       // Vivid tropical azure
      shallow: new THREE.Color(0x18c8dc),   // Crystal shallow lagoon cyan
      crest: new THREE.Color(0x5eead4),     // Luminous crest mint
      foam: new THREE.Color(0xf8fafc),      // Crisp white seafoam
      sun: new THREE.Color(0xfffbeb)        // Warm sunlight
    };

    this.uniforms = {
      uTime: { value: 0 },
      uDeepColor: { value: this.colors.deep },
      uMidColor: { value: this.colors.mid },
      uShallowColor: { value: this.colors.shallow },
      uCrestColor: { value: this.colors.crest },
      uFoamColor: { value: this.colors.foam },
      uSunDir: { value: new THREE.Vector3(120, 160, 100).normalize() }
    };

    // Custom Noise-Based Cartoon Ocean Shader Material
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        uniform float uTime;
        varying vec3 vWorldPos;
        varying vec3 vNormal;
        varying float vWaveHeight;
        varying float vIslandDamp;

        //
        // 2D Simplex Noise (Ashima Arts / Ian McEwan)
        //
        vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec3 permute(vec3 x) { return mod289(((x * 34.0) + 10.0) * x); }

        float snoise(vec2 v) {
          const vec4 C = vec4(
            0.211324865405187,   // (3.0 - sqrt(3.0)) / 6.0
            0.366025403784439,   // 0.5 * (sqrt(3.0) - 1.0)
           -0.577350269189626,   // -1.0 + 2.0 * C.x
            0.024390243902439    // 1.0 / 41.0
          );

          vec2 i  = floor(v + dot(v, C.yy));
          vec2 x0 = v - i + dot(i, C.xx);

          vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
          vec4 x12 = x0.xyxy + C.xxzz;
          x12.xy -= i1;

          i = mod289(i);
          vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                                      + i.x + vec3(0.0, i1.x, 1.0));

          vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
          m = m * m;
          m = m * m;

          vec3 x  = 2.0 * fract(p * C.www) - 1.0;
          vec3 h  = abs(x) - 0.5;
          vec3 ox = floor(x + 0.5);
          vec3 a0 = x - ox;

          m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);

          vec3 g;
          g.x  = a0.x  * x0.x   + h.x  * x0.y;
          g.yz = a0.yz * x12.xz + h.yz * x12.yw;

          return 130.0 * dot(m, g);
        }

        // fBM with peaked wave harmonics for stylized cartoon crests
        float fbm(vec2 p, float t) {
          float value = 0.0;
          float amplitude = 1.0;
          float frequency = 1.0;

          for (int i = 0; i < 5; i++) {
            float n = snoise(p * frequency + t * vec2(0.38, 0.28) * float(i + 1) * 0.35);
            // Cartoon wave shaping: slightly sharper wave crests
            float peaked = 1.0 - abs(n);
            value += amplitude * mix(n, peaked * 1.3 - 0.3, 0.45);
            amplitude *= 0.48;
            frequency *= 2.15;
            p += vec2(1.7, 1.3);
          }

          return value;
        }

        // Island Proximity Dampening: Calms ocean near all 5 islands so water never submerges land
        float getIslandDamp(vec2 p) {
          float d0 = length(p - vec2(0.0, 0.0)) / 48.0;          // Central Island
          float d1 = length(p - vec2(0.0, -200.0)) / 42.0;       // North Fort
          float d2 = length(p - vec2(-40.0, 210.0)) / 44.0;      // South Wreck
          float d3 = length(p - vec2(220.0, 40.0)) / 42.0;       // East Atoll
          float d4 = length(p - vec2(-220.0, -50.0)) / 42.0;     // West Reef
          float minD = min(min(min(d0, d1), min(d2, d3)), d4);
          return smoothstep(0.42, 1.25, minD);
        }

        // Main Wave Height function
        float calcRawWave(vec2 p, float t) {
          float h = 0.0;
          // Layer 1: Broad organic ocean swell
          h += fbm(p * 0.014 + vec2(t * 0.16, t * 0.11), t * 0.18) * 1.9;
          // Layer 2: Cross rolling swells
          h += fbm(p.yx * 0.038 + vec2(-t * 0.28, t * 0.20), t * 0.30) * 0.80;
          // Layer 3: Fine choppy cartoon ripples
          h += snoise(p * 0.085 + vec2(t * 0.50, -t * 0.38)) * 0.32;
          // Layer 4: Micro ripples
          h += snoise(p * 0.20 + vec2(-t * 0.85, t * 0.60)) * 0.12;
          return h;
        }

        float calcWaveWithIslands(vec2 p, float t) {
          float raw = calcRawWave(p, t);
          float damp = getIslandDamp(p);
          // Wave amplitude scales down near shore; safely rests at -0.45m inside islands
          return raw * damp - (1.0 - damp) * 0.45;
        }

        void main() {
          vec3 pos = position;
          vec4 worldPos = modelMatrix * vec4(pos, 1.0);

          float h = calcWaveWithIslands(worldPos.xz, uTime);
          worldPos.y += h;

          vWaveHeight = h;
          vIslandDamp = getIslandDamp(worldPos.xz);
          vWorldPos = worldPos.xyz;

          // Analytical normals via finite differences
          float delta = 0.35;
          float hR = calcWaveWithIslands(worldPos.xz + vec2(delta, 0.0), uTime);
          float hL = calcWaveWithIslands(worldPos.xz - vec2(delta, 0.0), uTime);
          float hU = calcWaveWithIslands(worldPos.xz + vec2(0.0, delta), uTime);
          float hD = calcWaveWithIslands(worldPos.xz - vec2(0.0, delta), uTime);

          vec3 norm = normalize(vec3(hL - hR, 2.0 * delta, hD - hU));
          vNormal = norm;

          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uDeepColor;
        uniform vec3 uMidColor;
        uniform vec3 uShallowColor;
        uniform vec3 uCrestColor;
        uniform vec3 uFoamColor;
        uniform vec3 uSunDir;

        varying vec3 vWorldPos;
        varying vec3 vNormal;
        varying float vWaveHeight;
        varying float vIslandDamp;

        // Compact noise helper for fragment effects
        vec3 mod289f(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec2 mod289f(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec3 permutef(vec3 x) { return mod289f(((x * 34.0) + 10.0) * x); }

        float snoise(vec2 v) {
          const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
          vec2 i  = floor(v + dot(v, C.yy));
          vec2 x0 = v - i + dot(i, C.xx);
          vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
          vec4 x12 = x0.xyxy + C.xxzz;
          x12.xy -= i1;
          i = mod289f(i);
          vec3 p = permutef(permutef(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
          vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
          m = m * m; m = m * m;
          vec3 x  = 2.0 * fract(p * C.www) - 1.0;
          vec3 h  = abs(x) - 0.5;
          vec3 ox = floor(x + 0.5);
          vec3 a0 = x - ox;
          m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
          vec3 g;
          g.x  = a0.x  * x0.x   + h.x  * x0.y;
          g.yz = a0.yz * x12.xz + h.yz * x12.yw;
          return 130.0 * dot(m, g);
        }

        // Stylized Cartoon Caustics (interlocking light web beneath water surface)
        float caustics(vec2 p, float t) {
          vec2 uv1 = p * 0.12 + vec2(t * 0.15, t * 0.09);
          vec2 uv2 = p * 0.16 + vec2(-t * 0.11, t * 0.14);
          float s1 = snoise(uv1);
          float s2 = snoise(uv2);
          float lines = 1.0 - abs(s1 + s2);
          return smoothstep(0.66, 0.95, lines);
        }

        float foamFbm(vec2 p) {
          float v = 0.0;
          v += snoise(p * 1.0) * 0.5;
          v += snoise(p * 2.3 + 3.1) * 0.25;
          v += snoise(p * 5.1 + 7.7) * 0.125;
          return v;
        }

        void main() {
          vec3 N = normalize(vNormal);
          vec3 L = normalize(uSunDir);
          vec3 V = normalize(cameraPosition - vWorldPos);

          // 1. Stepped Cartoon Diffuse Lighting
          float NdotL = dot(N, L);
          float lightStep = smoothstep(-0.08, 0.10, NdotL) * 0.35
                          + smoothstep(0.32, 0.52, NdotL) * 0.35
                          + smoothstep(0.68, 0.85, NdotL) * 0.30;

          // 2. Multi-tone Cartoon Color Ramp based on wave height
          float normH = clamp((vWaveHeight + 2.2) / 4.8, 0.0, 1.0);
          vec3 waterCol;
          if (normH < 0.35) {
            waterCol = mix(uDeepColor, uMidColor, normH / 0.35);
          } else if (normH < 0.72) {
            waterCol = mix(uMidColor, uShallowColor, (normH - 0.35) / 0.37);
          } else {
            waterCol = mix(uShallowColor, uCrestColor, (normH - 0.72) / 0.28);
          }

          // Subtle organic color modulation
          float colVar = snoise(vWorldPos.xz * 0.007 + uTime * 0.025) * 0.10;
          waterCol = mix(waterCol, uCrestColor, max(0.0, colVar));

          // 3. Cartoon Caustics in shallows & mid depths
          float cLight = caustics(vWorldPos.xz, uTime) * smoothstep(0.2, 0.8, normH);
          waterCol += uCrestColor * cLight * 0.32;

          // Apply cartoon lighting (clean matte cel-shaded surface without sun glare)
          vec3 finalColor = waterCol * (0.58 + 0.52 * lightStep);

          // 4. Subtle Fresnel Aqua Rim on wave contours
          float fresnel = pow(1.0 - max(0.0, dot(N, V)), 4.0);
          finalColor += uCrestColor * fresnel * 0.15;

          // 6. Stylized Wave Crest Seafoam
          vec2 foamUV = vWorldPos.xz * 0.055 + vec2(uTime * 0.05, uTime * 0.03);
          float foamPattern = foamFbm(foamUV);
          float crestFoam = smoothstep(1.15, 2.3, vWaveHeight) * smoothstep(0.05, 0.32, foamPattern);

          // Crest contour rim
          float crestEdge = smoothstep(0.95, 1.7, vWaveHeight);
          float edgeNoise = snoise(vWorldPos.xz * 0.13 + uTime * 0.09);
          crestEdge *= smoothstep(-0.05, 0.28, edgeNoise);

          // 7. Shoreline Lapping Foam (gentle pulsing rings near island beaches)
          float shoreDist = vIslandDamp; // 0 near island center, 1 in open sea
          float shorePulse = sin(uTime * 1.8 - shoreDist * 16.0) * 0.5 + 0.5;
          float shoreFoam = smoothstep(0.92, 0.48, shoreDist) * smoothstep(0.35, 0.85, shorePulse);
          shoreFoam *= smoothstep(0.38, 0.48, shoreDist); // Fade deep inside land

          // Total combined cartoon seafoam
          float totalFoam = clamp(crestFoam * 1.2 + crestEdge * 0.55 + shoreFoam * 0.85, 0.0, 1.0);
          finalColor = mix(finalColor, uFoamColor, totalFoam);

          // 8. Distance Atmospheric Fog
          float dist = length(cameraPosition - vWorldPos);
          float fogFactor = smoothstep(220.0, 680.0, dist);
          vec3 fogColor = vec3(0.53, 0.81, 0.92);
          finalColor = mix(finalColor, fogColor, fogFactor * 0.85);

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

  // Island proximity calculation matching GLSL getIslandDamp
  _getIslandDamp(x, z) {
    const d0 = Math.hypot(x - 0, z - 0) / 48.0;
    const d1 = Math.hypot(x - 0, z - -200) / 42.0;
    const d2 = Math.hypot(x - -40, z - 210) / 44.0;
    const d3 = Math.hypot(x - 220, z - 40) / 42.0;
    const d4 = Math.hypot(x - -220, z - -50) / 42.0;
    const minD = Math.min(d0, d1, d2, d3, d4);
    if (minD <= 0.42) return 0.0;
    if (minD >= 1.25) return 1.0;
    const t = (minD - 0.42) / (1.25 - 0.42);
    return t * t * (3.0 - 2.0 * t);
  }

  // CPU Wave Calculation matching vertex shader 1:1
  getWaveHeight(x, z, time = this.time) {
    const damp = this._getIslandDamp(x, z);

    let h = 0;
    // Layer 1: Broad swell
    h += this._fbmCPU(x * 0.014 + time * 0.16, z * 0.014 + time * 0.11, time * 0.18) * 1.9;
    // Layer 2: Cross rolling swells
    h += this._fbmCPU(z * 0.038 - time * 0.28, x * 0.038 + time * 0.20, time * 0.30) * 0.80;
    // Layer 3: Fine choppy detail
    h += this._snoiseCPU(x * 0.085 + time * 0.50, z * 0.085 - time * 0.38) * 0.32;
    // Layer 4: Micro ripples
    h += this._snoiseCPU(x * 0.20 - time * 0.85, z * 0.20 + time * 0.60) * 0.12;

    return h * damp - (1.0 - damp) * 0.45;
  }

  getWaveNormal(x, z, time = this.time) {
    const delta = 0.35;
    const hL = this.getWaveHeight(x - delta, z, time);
    const hR = this.getWaveHeight(x + delta, z, time);
    const hD = this.getWaveHeight(x, z - delta, time);
    const hU = this.getWaveHeight(x, z + delta, time);

    const normal = new THREE.Vector3(hL - hR, 2.0 * delta, hD - hU);
    return normal.normalize();
  }

  // Simple 2D simplex-style noise for CPU matching
  _snoiseCPU(x, y) {
    const F2 = 0.5 * (Math.sqrt(3.0) - 1.0);
    const G2 = (3.0 - Math.sqrt(3.0)) / 6.0;

    const s = (x + y) * F2;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);

    const t = (i + j) * G2;
    const X0 = i - t;
    const Y0 = j - t;
    const x0 = x - X0;
    const y0 = y - Y0;

    let i1, j1;
    if (x0 > y0) { i1 = 1; j1 = 0; }
    else { i1 = 0; j1 = 1; }

    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1.0 + 2.0 * G2;
    const y2 = y0 - 1.0 + 2.0 * G2;

    const ii = ((i % 289) + 289) % 289;
    const jj = ((j % 289) + 289) % 289;

    const hash = (a) => {
      let val = ((a * 34.0 + 10.0) * a) % 289;
      return ((val % 289) + 289) % 289;
    };
    const grad = (h, gx, gy) => {
      const r = (h * 0.024390243902439) % 1.0;
      const grd = r * 2.0 - 1.0;
      const abs_grd = Math.abs(grd);
      return grd * gx + (abs_grd - 0.5) * gy;
    };

    const p0 = hash(hash(jj) + ii);
    const p1 = hash(hash(jj + j1) + ii + i1);
    const p2 = hash(hash(jj + 1) + ii + 1);

    let n0 = 0, n1 = 0, n2 = 0;

    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) { t0 *= t0; n0 = t0 * t0 * grad(p0, x0, y0); }

    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) { t1 *= t1; n1 = t1 * t1 * grad(p1, x1, y1); }

    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) { t2 *= t2; n2 = t2 * t2 * grad(p2, x2, y2); }

    return 130.0 * (n0 + n1 + n2);
  }

  // fBM for CPU matching (3 octaves)
  _fbmCPU(x, y, t) {
    let value = 0;
    let amplitude = 1.0;
    let frequency = 1.0;
    let px = x, py = y;

    for (let i = 0; i < 3; i++) {
      const n = this._snoiseCPU(
        px * frequency + t * 0.38 * (i + 1) * 0.35,
        py * frequency + t * 0.28 * (i + 1) * 0.35
      );
      const peaked = 1.0 - Math.abs(n);
      value += amplitude * (n * 0.55 + (peaked * 1.3 - 0.3) * 0.45);
      amplitude *= 0.48;
      frequency *= 2.15;
      px += 1.7;
      py += 1.3;
    }

    return value;
  }

  update(dt) {
    this.time += dt;
    this.uniforms.uTime.value = this.time;
  }
}
