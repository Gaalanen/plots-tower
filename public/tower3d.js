/* Lumora Tower — 3D facade renderer (vanilla Three.js, no build step).
 *
 * Progressive enhancement for the hero. It renders an Art-Deco setback tower
 * whose FRONT facade is a COLS×ROWS grid of claimable windows mapped 1:1 to the
 * existing parcel ids (`${r}-${c}`). It owns only the visual + pointer layer;
 * all state (store, selection, checkout) stays in index.html and is pushed in
 * through setStore()/setSelection(). Interactions are reported back via callbacks.
 *
 * Window id format and the 20×30 / 600 business contract are UNCHANGED.
 */
(function () {
  "use strict";

  function supported() {
    try {
      const c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext &&
        (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) { return false; }
  }

  function init(opts) {
    if (typeof THREE === 'undefined' || !supported()) return null;

    const {
      mount, cols, rows, reduce = false,
      pid = (c, r) => r + '-' + c,
      onPick = () => {},            // (id, { leased, record }) — click on a single window
      onDragSelect = () => {},      // (ids[]) — committed block drag over available windows
      onHoverEnter = () => {},      // (id, { x, y }, { leased, record })
      onHoverLeave = () => {},
      onZone = () => {},            // ('city'|'tower'|'facade'|'window')
    } = opts;

    // ---- facade metrics (world units) ----
    const CW = 2.7, CH = 4.3;                 // slender residential proportions
    const gridW = cols * CW, gridH = rows * CH;
    const SHAFT_W = gridW + 8, SHAFT_D = 40, SHAFT_H = gridH + 12;
    const PODIUM_H = 16;
    const yShaft0 = PODIUM_H;                  // shaft base
    const yGridTop = yShaft0 + (SHAFT_H + gridH) / 2;   // top row centre band
    const centreY = yShaft0 + SHAFT_H / 2;

    // front-face window centre for (col c, row r): r=0 is the TOP floor
    function winCentre(c, r) {
      return {
        x: -gridW / 2 + (c + 0.5) * CW,
        y: yGridTop - (r + 0.5) * CH,
        z: SHAFT_D / 2 + 0.35,
      };
    }

    // ---- renderer / scene / camera ----
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const canvas = renderer.domElement;
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none';

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 6000);

    // optional cinematic bloom (loaded via vendored postprocessing modules)
    let composer = null, bloomPass = null;
    if (THREE.EffectComposer && THREE.RenderPass && THREE.UnrealBloomPass) {
      composer = new THREE.EffectComposer(renderer);
      composer.addPass(new THREE.RenderPass(scene, camera));
      bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(1, 1), 0.42, 0.5, 0.88); // strength, radius, threshold
      composer.addPass(bloomPass);
    }

    // ---- orbit state ----
    const target = new THREE.Vector3(0, 108, 0);
    const orbit = { radius: 300, theta: -0.6, phi: 1.38 };   // 3/4, slightly above — depth + setbacks read
    const PHI_MIN = 0.5, PHI_MAX = Math.PI * 0.5 - 0.02, R_MIN = 150, R_MAX = 460;
    let autoRotate = !reduce;   // gentle idle spin; stops the moment the viewer grabs it

    function applyCamera() {
      const { radius: r, phi: p, theta: t } = orbit;
      camera.position.set(
        target.x + r * Math.sin(p) * Math.sin(t),
        target.y + r * Math.cos(p),
        target.z + r * Math.sin(p) * Math.cos(t)
      );
      camera.lookAt(target);
      emitZone();
    }
    let lastZone = '';
    function emitZone() {
      const r = orbit.radius;
      const z = r > 430 ? 'city' : r > 300 ? 'tower' : r > 190 ? 'facade' : 'window';
      if (z !== lastZone) { lastZone = z; onZone(z); }
    }

    // ---- sky + environment ----
    const pmrem = new THREE.PMREMGenerator(renderer); pmrem.compileEquirectangularShader();
    function skyTexture() {
      const W = 1024, H = 512;
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d'); const grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0.00, '#17264f');   // deep blue zenith
      grd.addColorStop(0.26, '#33457a');   // blue
      grd.addColorStop(0.40, '#6d6498');   // lavender
      grd.addColorStop(0.47, '#bf7a78');   // pink
      grd.addColorStop(0.505, '#f2a568');  // orange
      grd.addColorStop(0.525, '#ffd69c');  // bright sunset glow at the horizon
      grd.addColorStop(0.545, '#13223f');  // water line
      grd.addColorStop(0.72, '#0c1930');
      grd.addColorStop(1.00, '#0a1526');   // far water
      g.fillStyle = grd; g.fillRect(0, 0, W, H);
      // streaky sunset clouds, concentrated just above the horizon (warm below → mauve above)
      const horizon = H * 0.525, zone = H * 0.34;
      let s = 1234567; const R = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
      for (let i = 0; i < 150; i++) {
        const k = Math.pow(R(), 1.7);                 // bias toward horizon
        const y = horizon - 5 - k * zone, x = R() * W, len = W * (0.12 + R() * 0.52), th = 2 + R() * 7;
        const warm = [255, 150, 92], cool = [168, 132, 170];
        const cr = Math.round(warm[0] + (cool[0] - warm[0]) * k), cg = Math.round(warm[1] + (cool[1] - warm[1]) * k), cb = Math.round(warm[2] + (cool[2] - warm[2]) * k);
        const a = (0.05 + R() * 0.17) * (1 - 0.35 * k);
        g.save(); g.globalCompositeOperation = 'lighter';
        const lg = g.createLinearGradient(x, y - th, x, y + th);
        lg.addColorStop(0, `rgba(${cr},${cg},${cb},0)`);
        lg.addColorStop(0.5, `rgba(${cr},${cg},${cb},${a.toFixed(3)})`);
        lg.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
        g.fillStyle = lg; g.beginPath(); g.ellipse(x, y, len / 2, th, 0, 0, 7); g.fill(); g.restore();
      }
      for (let i = 0; i < 46; i++) {                   // darker undersides for depth
        const y = horizon - 7 - Math.pow(R(), 1.5) * zone * 0.9, x = R() * W, len = W * (0.1 + R() * 0.4), th = 2 + R() * 5;
        g.save(); g.globalAlpha = 0.05 + R() * 0.09; g.fillStyle = '#2a2440';
        g.beginPath(); g.ellipse(x, y, len / 2, th, 0, 0, 7); g.fill(); g.restore();
      }
      const t = new THREE.CanvasTexture(c);
      t.mapping = THREE.EquirectangularReflectionMapping; t.encoding = THREE.sRGBEncoding;
      return t;
    }
    const sky = skyTexture();
    const skyDome = new THREE.Mesh(
      new THREE.SphereGeometry(2600, 40, 20),
      new THREE.MeshBasicMaterial({ map: sky, side: THREE.BackSide, fog: false })
    );
    scene.add(skyDome);
    scene.environment = pmrem.fromEquirectangular(sky).texture;
    scene.fog = new THREE.Fog(0x33406a, 520, 2800);

    // ---- lights (golden-hour setup) ----
    const hemi = new THREE.HemisphereLight(0xb9c4ea, 0x241a2a, 0.55); scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffb978, 1.05);          // warm low sunset key
    sun.position.set(-360, 180, 140); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004;
    const sc = sun.shadow.camera; sc.near = 60; sc.far = 1800; sc.left = -260; sc.right = 260; sc.top = 420; sc.bottom = -80;
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xffd0a0, 0.30); fill.position.set(300, 120, 120); scene.add(fill);
    const rim = new THREE.DirectionalLight(0xaecbff, 0.70); rim.position.set(120, 260, -360); scene.add(rim);  // cool back-rim separates tower from sky

    // ---- reflective water (mirrors the sunset → photoreal ground) ----
    (function water() {
      const m = new THREE.Mesh(new THREE.CircleGeometry(2600, 96),
        new THREE.MeshStandardMaterial({ color: 0x0b1726, roughness: 0.14, metalness: 0.95, envMapIntensity: 1.2 }));
      m.rotation.x = -Math.PI / 2; m.position.y = -0.5; m.receiveShadow = true; scene.add(m);
      // matte land under the city with a faint street grid + lamp dots (sea stays beyond it)
      const lc = document.createElement('canvas'); lc.width = lc.height = 256;
      const lg = lc.getContext('2d'); lg.fillStyle = '#070b14'; lg.fillRect(0, 0, 256, 256);
      lg.strokeStyle = 'rgba(70,90,130,0.16)'; lg.lineWidth = 1;
      for (let i = 0; i <= 8; i++) { const p = i * 32; lg.beginPath(); lg.moveTo(p, 0); lg.lineTo(p, 256); lg.moveTo(0, p); lg.lineTo(256, p); lg.stroke(); }
      for (let i = 0; i < 130; i++) { lg.fillStyle = Math.random() < 0.6 ? 'rgba(255,200,130,0.7)' : 'rgba(150,190,255,0.55)'; lg.fillRect(Math.random() * 256, Math.random() * 256, 1.4, 1.4); }
      const lt = new THREE.CanvasTexture(lc); lt.wrapS = lt.wrapT = THREE.RepeatWrapping; lt.repeat.set(18, 18); lt.encoding = THREE.sRGBEncoding;
      const land = new THREE.Mesh(new THREE.CircleGeometry(1500, 96),
        new THREE.MeshStandardMaterial({ color: 0x0a0f1a, map: lt, emissive: 0xffffff, emissiveMap: lt, emissiveIntensity: 0.5, roughness: 0.9, metalness: 0.1 }));
      land.rotation.x = -Math.PI / 2; land.position.y = 0.0; land.receiveShadow = true; scene.add(land);
      const c = document.createElement('canvas'); c.width = c.height = 256;
      const g = c.getContext('2d'); const rg = g.createRadialGradient(128, 128, 8, 128, 128, 128);
      rg.addColorStop(0, 'rgba(255,170,110,.26)'); rg.addColorStop(1, 'rgba(255,170,110,0)');
      g.fillStyle = rg; g.fillRect(0, 0, 256, 256);
      const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
      const glow = new THREE.Mesh(new THREE.CircleGeometry(340, 48),
        new THREE.MeshBasicMaterial({ map: t, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.rotation.x = -Math.PI / 2; glow.position.y = 0.2; scene.add(glow);
    })();

    // ---- surrounding night city (real boxes with lit-window facades → scale + depth) ----
    function facadeTexture() {
      const c = document.createElement('canvas'); c.width = 64; c.height = 128;
      const g = c.getContext('2d'); g.fillStyle = '#070c18'; g.fillRect(0, 0, 64, 128);
      const cols = 6, rows = 14, m = 3, cw = (64 - m * 2) / cols, rh = (128 - m * 2) / rows;
      for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
        const lit = Math.random() < 0.5;
        if (lit) { const warm = Math.random() < 0.62;
          g.fillStyle = warm ? `rgba(255,200,130,${(0.6 + Math.random() * 0.4).toFixed(2)})`
                             : `rgba(150,190,255,${(0.5 + Math.random() * 0.4).toFixed(2)})`;
        } else g.fillStyle = 'rgba(18,28,52,0.9)';
        g.fillRect(m + k * cw, m + r * rh, cw * 0.72, rh * 0.6);
      }
      const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding;
      return t;
    }
    (function buildCity() {
      const base = facadeTexture();
      const group = new THREE.Group(); scene.add(group);
      let s = 20260808; const R = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
      function place(ang, dist, w, d, h) {
        const t = base.clone(); t.needsUpdate = true;
        t.repeat.set(Math.max(1, Math.round(w / 15)), Math.max(2, Math.round(h / 15)));
        const mat = new THREE.MeshStandardMaterial({ color: 0x0a1120, map: t, emissive: 0xffffff,
          emissiveMap: t, emissiveIntensity: 0.85, roughness: 0.8, metalness: 0.12 });
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        m.position.set(Math.cos(ang) * dist, h / 2, Math.sin(ang) * dist);
        m.rotation.y = R() * 0.5 - 0.25; group.add(m);
      }
      // dense city, grounded on the land disc (clear plaza stays inside the camera orbit)
      for (let i = 0; i < 150; i++) {
        const ang = R() * Math.PI * 2, dist = 330 + R() * 660;
        place(ang, dist, 20 + R() * 46, 20 + R() * 46, 38 + R() * 160 + (dist > 620 ? R() * 90 : 0));
      }
      // hazy far skyline ring that fades into the sunset
      for (let i = 0; i < 56; i++) {
        const ang = R() * Math.PI * 2, dist = 1010 + R() * 420;
        place(ang, dist, 28 + R() * 52, 28 + R() * 52, 70 + R() * 170);
      }
      // low-rise carpet filling the foreground around the tower's feet (short → never blocks it)
      for (let i = 0; i < 96; i++) {
        const ang = R() * Math.PI * 2, dist = 128 + R() * 196;
        place(ang, dist, 14 + R() * 30, 14 + R() * 30, 9 + R() * 32);
      }
    })();

    // ---- road light-trails on the water/ground (city traffic from above) ----
    (function roadLights() {
      const g = new THREE.Group(); scene.add(g);
      let s = 9091; const R = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
      for (let i = 0; i < 115; i++) {
        const ang = R() * Math.PI * 2, dist = 130 + R() * 700, len = 8 + R() * 48;
        const col = R() < 0.6 ? 0xffcf9a : 0xff5a4d;   // headlights warm / taillights red
        const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.5, 1.0 + R() * 1.3),
          new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
        m.position.set(Math.cos(ang) * dist, 0.6, Math.sin(ang) * dist);
        m.rotation.y = R() * Math.PI; g.add(m);
      }
    })();

    // ---- tower structure ----
    const tower = new THREE.Group(); scene.add(tower);
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x151f36, roughness: 0.38, metalness: 0.55, envMapIntensity: 0.7 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x223355, roughness: 0.22, metalness: 0.8, envMapIntensity: 0.9 });

    function block(w, h, d, y, mat) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat || stoneMat);
      m.position.y = y; m.castShadow = true; m.receiveShadow = true; tower.add(m); return m;
    }
    // podium, shaft
    block(SHAFT_W + 18, PODIUM_H, SHAFT_D + 16, PODIUM_H / 2);
    block(SHAFT_W + 20, 2.4, SHAFT_D + 18, PODIUM_H + 0.4, trimMat);
    block(SHAFT_W, SHAFT_H, SHAFT_D, yShaft0 + SHAFT_H / 2);

    // setback crown tiers
    const crown = [
      { w: SHAFT_W - 16, d: SHAFT_D - 12, h: 22 },
      { w: SHAFT_W - 32, d: SHAFT_D - 22, h: 16 },
      { w: SHAFT_W - 46, d: SHAFT_D - 30, h: 12 },
    ];
    let cy = yShaft0 + SHAFT_H;
    const crownBounds = [];
    crown.forEach(t => {
      block(t.w + 3, 2.2, t.d + 3, cy + 1, trimMat);   // cornice
      block(t.w, t.h, t.d, cy + t.h / 2);
      crownBounds.push({ ...t, base: cy });
      cy += t.h;
    });
    const topY = cy;
    // spire + beacon
    block(10, 4, 10, topY + 2, trimMat);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(3.6, 40, 8),
      new THREE.MeshStandardMaterial({ color: 0x4a5890, roughness: 0.2, metalness: 0.95 }));
    spire.position.y = topY + 4 + 20; spire.castShadow = true; tower.add(spire);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.7, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xff5a4d }));
    beacon.position.y = topY + 4 + 42; tower.add(beacon);
    const beaconLight = new THREE.PointLight(0xff5a4d, 1.4, 120, 2);
    beaconLight.position.copy(beacon.position); tower.add(beaconLight);
    // warm penthouse wash on the crown
    const crownLight = new THREE.PointLight(0xffd39a, 0.9, 180, 2);
    crownLight.position.set(0, topY - 18, SHAFT_D / 2 + 8); tower.add(crownLight);

    // ---- decorative (non-claimable) windows: sides, back, podium, crown ----
    (function decorative() {
      const dummy = new THREE.Object3D();
      const places = [];
      const PW = 2.3, PH = 2.7;
      function face(cx0, baseY, h, spanHalf, axis, sign, hw, hd) {
        const n = Math.max(1, Math.floor((spanHalf * 2 - 6) / (PW + 1.6)));
        const rowsN = Math.max(1, Math.floor((h - 6) / (PH + 1.5)));
        const a0 = -(n - 1) * (PW + 1.6) / 2, y0 = baseY + (h - (rowsN - 1) * (PH + 1.5)) / 2;
        for (let r = 0; r < rowsN; r++) for (let k = 0; k < n; k++) {
          const along = a0 + k * (PW + 1.6), yy = y0 + r * (PH + 1.5);
          dummy.position.set(0, yy, 0);
          if (axis === 'z') { dummy.position.x = along; dummy.position.z = sign * (hd + 0.3); dummy.rotation.set(0, sign > 0 ? 0 : Math.PI, 0); }
          else { dummy.position.z = along; dummy.position.x = sign * (hw + 0.3); dummy.rotation.set(0, sign > 0 ? Math.PI / 2 : -Math.PI / 2, 0); }
          dummy.scale.set(PW, PH, 1); dummy.updateMatrix();
          places.push(dummy.matrix.clone());
        }
      }
      // shaft sides + back (not the claimable front)
      const hw = SHAFT_W / 2, hd = SHAFT_D / 2;
      face(0, yShaft0, SHAFT_H, hd, 'x', +1, hw, hd);
      face(0, yShaft0, SHAFT_H, hd, 'x', -1, hw, hd);
      face(0, yShaft0, SHAFT_H, hw, 'z', -1, hw, hd);
      // podium (all four)
      const pw = (SHAFT_W + 18) / 2, pd = (SHAFT_D + 16) / 2;
      face(0, 0, PODIUM_H, pw, 'z', +1, pw, pd); face(0, 0, PODIUM_H, pw, 'z', -1, pw, pd);
      face(0, 0, PODIUM_H, pd, 'x', +1, pw, pd); face(0, 0, PODIUM_H, pd, 'x', -1, pw, pd);
      // crown tiers (all four)
      crownBounds.forEach(t => {
        const w = t.w / 2, d = t.d / 2;
        face(0, t.base, t.h, w, 'z', +1, w, d); face(0, t.base, t.h, w, 'z', -1, w, d);
        face(0, t.base, t.h, d, 'x', +1, w, d); face(0, t.base, t.h, d, 'x', -1, w, d);
      });

      const N = places.length;
      const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ toneMapped: true }), N);
      const col = new THREE.Color();
      const warm = [[1.0, 0.80, 0.46], [1.0, 0.86, 0.58], [1.0, 0.72, 0.38]];
      for (let i = 0; i < N; i++) {
        mesh.setMatrixAt(i, places[i]);
        const h = ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;
        if (h < 0.4) { const p = warm[i % 3]; const j = 0.75 + 0.35 * (((Math.sin(i * 7.3) * 1e3) % 1 + 1) % 1); col.setRGB(p[0] * j, p[1] * j, p[2] * j); }
        else { const j = 0.6 + 0.6 * (((Math.sin(i * 3.1) * 1e3) % 1 + 1) % 1); col.setRGB(0.06 * j, 0.09 * j, 0.17 * j); }
        mesh.setColorAt(i, col);
      }
      mesh.instanceColor.needsUpdate = true;
      tower.add(mesh);
    })();

    // ---- claimable front windows: reflective glass panels + additive glow overlay ----
    const COUNT = cols * rows;
    const idOf = i => pid(i % cols, Math.floor(i / cols));   // index -> `${r}-${c}`
    const winMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(CW * 0.92, CH * 0.78),
      new THREE.MeshStandardMaterial({ metalness: 0.88, roughness: 0.2, envMapIntensity: 1.0 }), COUNT);
    winMesh.name = 'claimable';
    const glowMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(CW * 1.12, CH * 1.08),
      new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: true }), COUNT);
    const dummy = new THREE.Object3D();
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = r * cols + c, p = winCentre(c, r);
      dummy.position.set(p.x, p.y, p.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
      dummy.updateMatrix(); winMesh.setMatrixAt(i, dummy.matrix);
      dummy.position.z = p.z + 0.06; dummy.updateMatrix(); glowMesh.setMatrixAt(i, dummy.matrix);
    }
    tower.add(winMesh); tower.add(glowMesh);
    // curtain-wall backing: fine floor-slab + mullion grid so the facade reads as real floors
    const gridTex = (function () {
      const PX = 12, cw = cols * PX, ch = rows * PX;
      const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
      const g = cv.getContext('2d'); g.fillStyle = '#080d1a'; g.fillRect(0, 0, cw, ch);
      g.strokeStyle = 'rgba(120,140,185,0.20)'; g.lineWidth = 1;
      for (let c = 0; c <= cols; c++) { g.beginPath(); g.moveTo(c * PX + 0.5, 0); g.lineTo(c * PX + 0.5, ch); g.stroke(); }
      g.strokeStyle = 'rgba(95,115,155,0.32)';     // floor slabs a touch stronger than mullions
      for (let r = 0; r <= rows; r++) { g.beginPath(); g.moveTo(0, r * PX + 0.5); g.lineTo(cw, r * PX + 0.5); g.stroke(); }
      const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding; return t;
    })();
    block(gridW + 1.2, gridH + 1.2, 0.4, 0, new THREE.MeshStandardMaterial({ map: gridTex, color: 0x0a1020, roughness: 0.5, metalness: 0.5 }))
      .position.set(0, yGridTop - gridH / 2, SHAFT_D / 2 + 0.1);

    // front-facade floor slabs (residential read — casts the horizontal floor shadows)
    const slabMat = new THREE.MeshStandardMaterial({ color: 0x17223c, roughness: 0.5, metalness: 0.45 });
    for (let r = 1; r < rows; r++) {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(gridW + 1.0, 0.5, 0.7), slabMat);
      slab.position.set(0, yGridTop - r * CH, SHAFT_D / 2 + 0.5);
      slab.castShadow = true; slab.receiveShadow = true; tower.add(slab);
    }
    // one emphasised terrace in the upper third
    (function terrace() {
      const ty = yGridTop - Math.round(rows * 0.34) * CH;
      const deck = new THREE.Mesh(new THREE.BoxGeometry(gridW + 5, 1.1, 4.5), trimMat);
      deck.position.set(0, ty, SHAFT_D / 2 + 2.0); deck.castShadow = true; tower.add(deck);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(gridW + 5, 1.4, 0.3),
        new THREE.MeshStandardMaterial({ color: 0x3a4a72, roughness: 0.2, metalness: 0.7 }));
      rail.position.set(0, ty + 1.2, SHAFT_D / 2 + 4.1); tower.add(rail);
    })();

    // ---- window colour model ----
    let store = {}, selection = new Set(), preview = new Set(), hoverIdx = -1;
    const GLASS = new THREE.Color(0x1c2a43);   // available reflective glass tint
    const SEL = new THREE.Color(0xffcf6a);
    const PREV = new THREE.Color(0xe8c070);
    const WHITE = new THREE.Color(0xffffff);
    const tmp = new THREE.Color(), tmp2 = new THREE.Color();

    function winColor(i, out) {
      const id = idOf(i);
      if (selection.has(id)) return out.copy(SEL);
      if (preview.has(id)) return out.copy(PREV);
      const rec = store[id];
      if (rec) { out.set(rec.color || '#7FD3FF'); return out.multiplyScalar(0.95); }
      const j = 0.8 + 0.4 * (((Math.sin(i * 2.17) * 1e3) % 1 + 1) % 1);
      return out.copy(GLASS).multiplyScalar(j);
    }
    function glowColor(i, out) {
      const id = idOf(i);
      if (selection.has(id)) return out.copy(SEL).multiplyScalar(0.42);
      if (preview.has(id)) return out.copy(PREV).multiplyScalar(0.22);
      const rec = store[id];
      if (rec) { out.set(rec.color || '#7FD3FF'); return out.multiplyScalar(0.5); }
      return out.setRGB(0, 0, 0);   // available → no glow (additive black)
    }
    function paint(i) {
      const hov = (i === hoverIdx && !selection.has(idOf(i)));
      winColor(i, tmp); if (hov) tmp.lerp(WHITE, 0.3); winMesh.setColorAt(i, tmp);
      glowColor(i, tmp2); if (hov) tmp2.lerp(WHITE, 0.18); glowMesh.setColorAt(i, tmp2);
    }
    function paintAll() {
      for (let i = 0; i < COUNT; i++) paint(i);
      winMesh.instanceColor.needsUpdate = true; glowMesh.instanceColor.needsUpdate = true;
    }

    // ---- pointer: orbit vs. window pick / drag-block ----
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let mode = null;            // 'orbit' | 'select' | null
    let last = { x: 0, y: 0 };
    let startCell = null, dragged = false, lastClient = { x: 0, y: 0 };
    const pts = new Map(); let pinchD = 0, pinchR = 0;

    function pickIndex(ev) {
      const rect = canvas.getBoundingClientRect();
      ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObject(winMesh, false);
      return hit.length ? hit[0].instanceId : -1;
    }
    const cellOf = i => ({ c: i % cols, r: Math.floor(i / cols) });

    canvas.addEventListener('pointerdown', ev => {
      canvas.setPointerCapture(ev.pointerId);
      autoRotate = false;            // viewer took control of the camera
      pts.set(ev.pointerId, ev);
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinchD = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); pinchR = orbit.radius; mode = null; return; }
      last = { x: ev.clientX, y: ev.clientY };
      const i = pickIndex(ev);
      if (i >= 0 && !store[idOf(i)]) { mode = 'select'; startCell = cellOf(i); dragged = false; }
      else { mode = 'orbit'; }
    });

    canvas.addEventListener('pointermove', ev => {
      lastClient = { x: ev.clientX, y: ev.clientY };
      if (pts.has(ev.pointerId)) pts.set(ev.pointerId, ev);
      if (pts.size === 2 && pinchD) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        orbit.radius = Math.min(R_MAX, Math.max(R_MIN, pinchR * (pinchD / d))); applyCamera();
        return;
      }
      if (mode === 'orbit') {
        const dx = ev.clientX - last.x, dy = ev.clientY - last.y; last = { x: ev.clientX, y: ev.clientY };
        orbit.theta -= dx * 0.006;
        orbit.phi = Math.min(PHI_MAX, Math.max(PHI_MIN, orbit.phi - dy * 0.006));
        applyCamera();
        return;
      }
      if (mode === 'select' && startCell) {
        const i = pickIndex(ev); if (i < 0) return;
        const cell = cellOf(i);
        if (cell.c !== startCell.c || cell.r !== startCell.r) dragged = true;
        preview.clear();
        const c0 = Math.min(startCell.c, cell.c), c1 = Math.max(startCell.c, cell.c);
        const r0 = Math.min(startCell.r, cell.r), r1 = Math.max(startCell.r, cell.r);
        for (let rr = r0; rr <= r1; rr++) for (let cc = c0; cc <= c1; cc++) {
          const id = pid(cc, rr); if (!store[id] && !selection.has(id)) preview.add(id);
        }
        paintAll();
        return;
      }
      // hover (no button)
      if (mode === null) hover(ev);
    });

    function hover(ev) {
      const i = pickIndex(ev);
      if (i === hoverIdx) return;
      const prev = hoverIdx; hoverIdx = i;
      if (prev >= 0) { paint(prev); }
      if (i >= 0) {
        paint(i);
        const id = idOf(i), rec = store[id];
        onHoverEnter(id, { x: ev.clientX, y: ev.clientY }, { leased: !!rec, record: rec || null });
        canvas.style.cursor = rec ? (rec.linkUrl ? 'pointer' : 'default') : 'pointer';
      } else { onHoverLeave(); canvas.style.cursor = 'grab'; }
      winMesh.instanceColor.needsUpdate = true; glowMesh.instanceColor.needsUpdate = true;
    }

    function endPointer(ev) {
      pts.delete(ev.pointerId); if (pts.size < 2) pinchD = 0;
      if (mode === 'select' && startCell) {
        if (dragged) {
          const ids = [...preview]; preview.clear();
          if (ids.length) onDragSelect(ids);
          paintAll();
        } else {
          const id = pid(startCell.c, startCell.r);
          onPick(id, { leased: !!store[id], record: store[id] || null });
        }
      }
      mode = null; startCell = null; dragged = false;
    }
    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', ev => { pts.delete(ev.pointerId); if (pts.size < 2) pinchD = 0; mode = null; startCell = null; preview.clear(); paintAll(); });
    canvas.addEventListener('pointerleave', () => { if (hoverIdx >= 0) { const p = hoverIdx; hoverIdx = -1; paint(p); winMesh.instanceColor.needsUpdate = true; glowMesh.instanceColor.needsUpdate = true; onHoverLeave(); } });

    canvas.addEventListener('wheel', ev => {
      ev.preventDefault();
      orbit.radius = Math.min(R_MAX, Math.max(R_MIN, orbit.radius * (1 + Math.sign(ev.deltaY) * 0.09)));
      applyCamera();
    }, { passive: false });

    // ---- framing presets ----
    function frameTo(radius, phi, theta) {
      orbit.radius = radius; orbit.phi = phi; if (theta != null) orbit.theta = theta; applyCamera();
    }
    const frameCity = () => frameTo(400, 1.30, orbit.theta);
    const frameTower = () => frameTo(230, 1.40, orbit.theta);
    const reset = () => { autoRotate = !reduce; frameTo(300, 1.38, -0.6); };
    const zoom = f => { orbit.radius = Math.min(R_MAX, Math.max(R_MIN, orbit.radius / f)); applyCamera(); };
    const toggleAutoRotate = () => { autoRotate = !autoRotate; return autoRotate; };

    // ---- resize + loop ----
    function resize() {
      const w = mount.clientWidth || window.innerWidth, h = mount.clientHeight || window.innerHeight;
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
      if (composer) composer.setSize(w, h);
    }
    mount.appendChild(canvas); resize(); applyCamera(); paintAll();
    window.addEventListener('resize', resize);

    let raf, t0 = performance.now(), running = true;
    function frame(now) {
      if (!running) return;
      const dt = (now - t0) / 1000; t0 = now;
      if (autoRotate) { orbit.theta += dt * 0.12; applyCamera(); }
      if (!reduce) {
        const pulse = 0.55 + 0.45 * Math.sin(now * 0.004);
        beaconLight.intensity = 1.3 * pulse;
        beacon.material.color.set(0xff5a4d).multiplyScalar(0.55 + 0.6 * pulse);
      }
      if (composer) composer.render(); else renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    // ---- public API ----
    const api = {
      el: canvas,
      setStore(s) { store = s || {}; if (hoverIdx >= 0) hoverIdx = -1; paintAll(); },
      setSelection(sel) { selection = sel || new Set(); paintAll(); },
      refresh: paintAll,
      resize, zoom, frameCity, frameTower, reset, toggleAutoRotate,
      getTheta: () => orbit.theta,
      setTheta(t) { autoRotate = false; orbit.theta = t; applyCamera(); },   // used for scripted capture
      dispose() {
        running = false; cancelAnimationFrame(raf);
        window.removeEventListener('resize', resize);
        renderer.dispose();
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      },
    };
    try { window.__tower3d = api; } catch (e) {}
    return api;
  }

  window.Tower3D = { init, supported };
})();
