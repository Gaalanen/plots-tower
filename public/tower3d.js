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
    const CW = 3.2, CH = 3.6;                 // window cell w/h
    const gridW = cols * CW, gridH = rows * CH;
    const SHAFT_W = gridW + 10, SHAFT_D = 46, SHAFT_H = gridH + 16;
    const PODIUM_H = 15;
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

    // ---- orbit state ----
    const target = new THREE.Vector3(0, centreY * 0.86, 0);
    const orbit = { radius: 360, theta: 0, phi: Math.PI * 0.46 };
    const PHI_MIN = 0.16, PHI_MAX = Math.PI * 0.5 - 0.02, R_MIN = 120, R_MAX = 820;
    let autoRotate = false;

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
      const c = document.createElement('canvas'); c.width = 16; c.height = 256;
      const g = c.getContext('2d'); const grd = g.createLinearGradient(0, 0, 0, 256);
      grd.addColorStop(0.00, '#05070f'); grd.addColorStop(0.42, '#0a1330');
      grd.addColorStop(0.64, '#132049'); grd.addColorStop(0.80, '#2a3566');
      grd.addColorStop(0.90, '#b5713f'); grd.addColorStop(1.00, '#17121f');
      g.fillStyle = grd; g.fillRect(0, 0, 16, 256);
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
    scene.fog = new THREE.Fog(0x0a1330, 520, 2000);

    // ---- lights ----
    const hemi = new THREE.HemisphereLight(0x9fb4e8, 0x1a1626, 0.4); scene.add(hemi);
    const moon = new THREE.DirectionalLight(0xffca96, 0.7);
    moon.position.set(-320, 360, 200); moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    const sc = moon.shadow.camera; sc.near = 60; sc.far = 1400; sc.left = -200; sc.right = 200; sc.top = 320; sc.bottom = -40;
    scene.add(moon);
    const fill = new THREE.DirectionalLight(0x6ea8ff, 0.3); fill.position.set(260, 140, -200); scene.add(fill);

    // ---- ground ----
    (function () {
      const c = document.createElement('canvas'); c.width = c.height = 512;
      const g = c.getContext('2d'); g.fillStyle = '#05070e'; g.fillRect(0, 0, 512, 512);
      const rg = g.createRadialGradient(256, 256, 20, 256, 256, 256);
      rg.addColorStop(0, 'rgba(228,190,110,.30)'); rg.addColorStop(0.5, 'rgba(40,58,110,.12)'); rg.addColorStop(1, 'rgba(5,7,14,0)');
      g.fillStyle = rg; g.fillRect(0, 0, 512, 512);
      const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding;
      const m = new THREE.Mesh(new THREE.CircleGeometry(1600, 64),
        new THREE.MeshStandardMaterial({ map: tex, color: 0x090d16, roughness: 0.35, metalness: 0.6 }));
      m.rotation.x = -Math.PI / 2; m.receiveShadow = true; scene.add(m);
    })();

    // ---- tower structure ----
    const tower = new THREE.Group(); scene.add(tower);
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x242c4a, roughness: 0.6, metalness: 0.4 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x3a4880, roughness: 0.35, metalness: 0.75 });

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
        if (h < 0.26) { const p = warm[i % 3]; const j = 0.7 + 0.3 * (((Math.sin(i * 7.3) * 1e3) % 1 + 1) % 1); col.setRGB(p[0] * j, p[1] * j, p[2] * j); }
        else { const j = 0.6 + 0.6 * (((Math.sin(i * 3.1) * 1e3) % 1 + 1) % 1); col.setRGB(0.05 * j, 0.08 * j, 0.16 * j); }
        mesh.setColorAt(i, col);
      }
      mesh.instanceColor.needsUpdate = true;
      tower.add(mesh);
    })();

    // ---- claimable front windows (InstancedMesh, index = r*cols + c) ----
    const COUNT = cols * rows;
    const idOf = i => pid(i % cols, Math.floor(i / cols));   // index -> `${r}-${c}`
    const winMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(CW * 0.82, CH * 0.82),
      new THREE.MeshBasicMaterial({ toneMapped: true }), COUNT);
    winMesh.name = 'claimable';
    const dummy = new THREE.Object3D();
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = r * cols + c, p = winCentre(c, r);
      dummy.position.set(p.x, p.y, p.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
      dummy.updateMatrix(); winMesh.setMatrixAt(i, dummy.matrix);
    }
    tower.add(winMesh);
    // mullion field behind the claimable grid, so gaps read as structure
    block(gridW + 1.2, gridH + 1.2, 0.4, (yGridTop + (yGridTop - gridH)) / 2 + 0, new THREE.MeshStandardMaterial({ color: 0x11162c, roughness: 0.8, metalness: 0.2 }))
      .position.set(0, yGridTop - gridH / 2, SHAFT_D / 2 + 0.12);

    // ---- window colour model ----
    let store = {}, selection = new Set(), preview = new Set(), hoverIdx = -1;
    const DARK = new THREE.Color(0x0c1324);
    const SEL = new THREE.Color(0xffcf6a);
    const PREV = new THREE.Color(0xe8c070);
    const tmp = new THREE.Color();

    function baseColor(i, out) {
      const id = idOf(i);
      if (selection.has(id)) return out.copy(SEL);
      if (preview.has(id)) return out.copy(PREV);
      const rec = store[id];
      if (rec) { out.set(rec.color || '#7FD3FF'); return out.multiplyScalar(1.25); }
      // available: dark glass with faint deterministic variance
      const j = 0.7 + 0.5 * (((Math.sin(i * 2.17) * 1e3) % 1 + 1) % 1);
      return out.copy(DARK).multiplyScalar(j);
    }
    function paint(i) {
      baseColor(i, tmp);
      if (i === hoverIdx && !selection.has(idOf(i))) tmp.lerp(new THREE.Color(0xffffff), 0.35);
      winMesh.setColorAt(i, tmp);
    }
    function paintAll() { for (let i = 0; i < COUNT; i++) paint(i); winMesh.instanceColor.needsUpdate = true; }

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
      winMesh.instanceColor.needsUpdate = true;
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
    canvas.addEventListener('pointerleave', () => { if (hoverIdx >= 0) { const p = hoverIdx; hoverIdx = -1; paint(p); winMesh.instanceColor.needsUpdate = true; onHoverLeave(); } });

    canvas.addEventListener('wheel', ev => {
      ev.preventDefault();
      orbit.radius = Math.min(R_MAX, Math.max(R_MIN, orbit.radius * (1 + Math.sign(ev.deltaY) * 0.09)));
      applyCamera();
    }, { passive: false });

    // ---- framing presets ----
    function frameTo(radius, phi, theta) {
      orbit.radius = radius; orbit.phi = phi; if (theta != null) orbit.theta = theta; applyCamera();
    }
    const frameCity = () => frameTo(420, Math.PI * 0.46, orbit.theta);
    const frameTower = () => frameTo(240, Math.PI * 0.44, orbit.theta);
    const reset = () => frameTo(360, Math.PI * 0.46, 0);
    const zoom = f => { orbit.radius = Math.min(R_MAX, Math.max(R_MIN, orbit.radius / f)); applyCamera(); };
    const toggleAutoRotate = () => { autoRotate = !autoRotate; return autoRotate; };

    // ---- resize + loop ----
    function resize() {
      const w = mount.clientWidth || window.innerWidth, h = mount.clientHeight || window.innerHeight;
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
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
      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    // ---- public API ----
    return {
      el: canvas,
      setStore(s) { store = s || {}; if (hoverIdx >= 0) hoverIdx = -1; paintAll(); },
      setSelection(sel) { selection = sel || new Set(); paintAll(); },
      refresh: paintAll,
      resize, zoom, frameCity, frameTower, reset, toggleAutoRotate,
      dispose() {
        running = false; cancelAnimationFrame(raf);
        window.removeEventListener('resize', resize);
        renderer.dispose();
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      },
    };
  }

  window.Tower3D = { init, supported };
})();
