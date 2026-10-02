import * as THREE from 'three';

export class Ocean {
  constructor(scene, size = 1400, segments = 400) {
    this.scene = scene;
    this.size = size;
    this.time = 0;

    // High-detail ocean geometry (400x400 = 160k vertices)
    const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
    geometry.rotateX(-Math.PI / 2);

    // Cel-shaded Cartoon Colors
    this.colors = {
      deep: new THREE.Color(0x064e6b),
      mid: new THREE.Color(0x0891b2),
      shallow: new THREE.Color(0x22d3ee),
      foam: new THREE.Color(0xffffff),
      sun: new THREE.Color(0xfffbeb)
    };

    this.uniforms = {
      uTime: { value: 0 },
      uDeepColor: { value: this.colors.deep },
      uMidColor: { value: this.colors.mid },
      uShallowColor: { value: this.colors.shallow },
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

        //
        // Classic 2D / 3D Simplex-style value noise (hash-based, no textures)
        //
        vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec3 permute(vec3 x) { return mod289(((x * 34.0) + 10.0) * x); }

        // 2D simplex noise  (Ashima Arts / Ian McEwan)
        float snoise(vec2 v) {
          const vec4 C = vec4(
            0.211324865405187,   // (3.0 - sqrt(3.0)) / 6.0
            0.366025403784439,   // 0.5 * (sqrt(3.0) - 1.0)
           -0.577350269189626,   // -1.0 + 2.0 * C.x
            0.024390243902439    // 1.0 / 41.0
          );

          // First corner
          vec2 i  = floor(v + dot(v, C.yy));
          vec2 x0 = v - i + dot(i, C.xx);

          // Other corners
          vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
          vec4 x12 = x0.xyxy + C.xxzz;
          x12.xy -= i1;

          // Permutations
          i = mod289(i);
          vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                                      + i.x + vec3(0.0, i1.x, 1.0));

          vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
          m = m * m;
          m = m * m;

          // Gradients
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

        // fBM (fractal Brownian motion) for organic non-repeating waves
        float fbm(vec2 p, float t) {
          float value = 0.0;
          float amplitude = 1.0;
          float frequency = 1.0;

          // 5 octaves for rich detail
          for (int i = 0; i < 5; i++) {
            value += amplitude * snoise(p * frequency + t * vec2(0.4, 0.3) * float(i + 1) * 0.35);
            amplitude *= 0.48;
            frequency *= 2.15;
            p += vec2(1.7, 1.3);  // Domain rotation / offset to break symmetry
          }

          return value;
        }

        // Main wave height function
        float calcWave(vec2 p, float t) {
          float h = 0.0;

          // Layer 1: Large organic ocean swell (slow, broad)
          h += fbm(p * 0.015 + vec2(t * 0.18, t * 0.12), t * 0.2) * 2.0;

          // Layer 2: Medium rolling waves (cross direction)
          h += fbm(p.yx * 0.04 + vec2(-t * 0.3, t * 0.22), t * 0.35) * 0.85;

          // Layer 3: Fine choppy surface detail
          h += snoise(p * 0.09 + vec2(t * 0.55, -t * 0.42)) * 0.38;

          // Layer 4: Micro ripples
          h += snoise(p * 0.22 + vec2(-t * 0.9, t * 0.65)) * 0.15;

          return h;
        }

        void main() {
          vec3 pos = position;
          vec4 worldPos = modelMatrix * vec4(pos, 1.0);

          float h = calcWave(worldPos.xz, uTime);
          worldPos.y += h;
          vWaveHeight = h;
          vWorldPos = worldPos.xyz;

          // Analytical normals via finite differences
          float delta = 0.35;
          float hR = calcWave(worldPos.xz + vec2(delta, 0.0), uTime);
          float hL = calcWave(worldPos.xz - vec2(delta, 0.0), uTime);
          float hU = calcWave(worldPos.xz + vec2(0.0, delta), uTime);
          float hD = calcWave(worldPos.xz - vec2(0.0, delta), uTime);

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
        uniform vec3 uFoamColor;
        uniform vec3 uSunDir;

        varying vec3 vWorldPos;
        varying vec3 vNormal;
        varying float vWaveHeight;

        // Compact hash noise for foam detail
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

          // Cel-shaded Diffuse Lighting (stepped cartoon shading)
          float NdotL = dot(N, L);
          float lightStep = smoothstep(-0.05, 0.12, NdotL) * 0.35
                          + smoothstep(0.35, 0.55, NdotL) * 0.35
                          + smoothstep(0.7, 0.85, NdotL) * 0.3;

          // Water depth gradient based on wave height
          float normH = clamp((vWaveHeight + 2.5) / 5.5, 0.0, 1.0);
          vec3 waterCol;
          if (normH < 0.4) {
            waterCol = mix(uDeepColor, uMidColor, normH / 0.4);
          } else {
            waterCol = mix(uMidColor, uShallowColor, (normH - 0.4) / 0.6);
          }

          // Noise-based subtle color variation to break uniformity
          float colorNoise = snoise(vWorldPos.xz * 0.008 + uTime * 0.03) * 0.12;
          waterCol = mix(waterCol, uShallowColor, max(0.0, colorNoise));

          // Apply cartoon lighting
          vec3 finalColor = waterCol * (0.55 + 0.55 * lightStep);

          // Cartoon specular sun highlight (sharp toon disc)
          vec3 H = normalize(L + V);
          float NdotH = max(0.0, dot(N, H));
          float spec = step(0.96, pow(NdotH, 40.0));
          finalColor += vec3(1.0, 0.97, 0.82) * spec * 0.8;

          // Fresnel rim glow (subtle edge light on waves facing camera)
          float fresnel = pow(1.0 - max(0.0, dot(N, V)), 3.5);
          finalColor += uShallowColor * fresnel * 0.18;

          // Stylized Cartoon Seafoam on wave crests (noise-based, non-repetitive)
          vec2 foamUV = vWorldPos.xz * 0.06 + vec2(uTime * 0.06, uTime * 0.03);
          float foamPattern = foamFbm(foamUV);
          float crestFoam = smoothstep(1.2, 2.4, vWaveHeight) * smoothstep(0.08, 0.35, foamPattern);

          // Noise-driven foam rim borders (organic edge)
          float foamEdge = smoothstep(1.0, 1.8, vWaveHeight);
          float edgeNoise = snoise(vWorldPos.xz * 0.14 + uTime * 0.1);
          foamEdge *= smoothstep(-0.1, 0.3, edgeNoise);
          float totalFoam = clamp(crestFoam + foamEdge * 0.5, 0.0, 1.0);
          finalColor = mix(finalColor, uFoamColor * 0.95, totalFoam);

          // Subsurface scattering hint (light passing through waves)
          float sss = pow(max(0.0, dot(V, -L + N * 0.3)), 4.0) * smoothstep(-0.5, 1.0, vWaveHeight) * 0.15;
          finalColor += vec3(0.1, 0.7, 0.6) * sss;

          // Distance atmospheric fade
          float dist = length(cameraPosition - vWorldPos);
          float fogFactor = smoothstep(200.0, 600.0, dist);
          vec3 fogColor = vec3(0.53, 0.81, 0.92);
          finalColor = mix(finalColor, fogColor, fogFactor * 0.82);

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

  // CPU Wave Calculation matching vertex shader noise (simplified 4-octave approximation)
  // Uses the same layering logic but with a JS simplex noise implementation
  getWaveHeight(x, z, time = this.time) {
    let h = 0;

    // Layer 1: Large organic swell
    h += this._fbmCPU(x * 0.015 + time * 0.18, z * 0.015 + time * 0.12, time * 0.2) * 2.0;

    // Layer 2: Medium rolling waves
    h += this._fbmCPU(z * 0.04 - time * 0.3, x * 0.04 + time * 0.22, time * 0.35) * 0.85;

    // Layer 3: Fine choppy detail
    h += this._snoiseCPU(x * 0.09 + time * 0.55, z * 0.09 - time * 0.42) * 0.38;

    // Layer 4: Micro ripples
    h += this._snoiseCPU(x * 0.22 - time * 0.9, z * 0.22 + time * 0.65) * 0.15;

    return h;
  }

  getWaveNormal(x, z, time = this.time) {
    const delta = 0.4;
    const hL = this.getWaveHeight(x - delta, z, time);
    const hR = this.getWaveHeight(x + delta, z, time);
    const hD = this.getWaveHeight(x, z - delta, time);
    const hU = this.getWaveHeight(x, z + delta, time);

    const normal = new THREE.Vector3(hL - hR, 2.0 * delta, hD - hU);
    return normal.normalize();
  }

  // Simple 2D simplex-style noise for CPU matching
  _snoiseCPU(x, y) {
    // Hash-based gradient noise (matches simplex noise character)
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
      let x = ((a * 34.0 + 10.0) * a) % 289;
      return ((x % 289) + 289) % 289;
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

  // fBM for CPU matching (3 octaves is enough for ship physics)
  _fbmCPU(x, y, t) {
    let value = 0;
    let amplitude = 1.0;
    let frequency = 1.0;
    let px = x, py = y;

    for (let i = 0; i < 3; i++) {
      value += amplitude * this._snoiseCPU(
        px * frequency + t * 0.4 * (i + 1) * 0.35,
        py * frequency + t * 0.3 * (i + 1) * 0.35
      );
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
