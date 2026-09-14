/* Landmark detection.

   Wraps MediaPipe FaceMesh (and, on demand, Pose / Hands). Everything runs in
   the browser and every asset is served from ./vendor, so there is no network
   or backend dependency at runtime.

   Two rules govern everything below.

   1. Output is NORMALISED to the image's own coordinate system (0..1 of image
      width / height), never to the viewport. Rendering multiplies those numbers
      by whatever size the image happens to be displayed at, so the same
      landmark data is correct on mobile, desktop, portrait or landscape.

   2. Geometry is computed in WIDTH UNITS, not in normalised units. A
      normalised x and a normalised y are fractions of different pixel counts,
      so on any photo that is not square, mixing them — a distance, an angle, a
      perpendicular — is silently wrong. Everything is therefore converted to
      "fractions of image width" (y_w = y_norm * height / width), measured
      there, and converted back on the way out. */

const VENDOR = 'vendor';

let faceMesh = null, pose = null, hands = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('load ' + src));
    document.head.appendChild(s);
  });
}

async function getFaceMesh() {
  if (faceMesh) return faceMesh;
  await loadScript(`${VENDOR}/face_mesh/face_mesh.js`);
  faceMesh = new window.FaceMesh({ locateFile: f => `${VENDOR}/face_mesh/${f}` });
  faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true,
                        minDetectionConfidence: 0.4, minTrackingConfidence: 0.4 });
  return faceMesh;
}

async function getPose() {
  if (pose) return pose;
  await loadScript(`${VENDOR}/pose/pose.js`);
  pose = new window.Pose({ locateFile: f => `${VENDOR}/pose/${f}` });
  pose.setOptions({ modelComplexity: 0, smoothLandmarks: false,
                    minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
  return pose;
}

async function getHands() {
  if (hands) return hands;
  await loadScript(`${VENDOR}/hands/hands.js`);
  hands = new window.Hands({ locateFile: f => `${VENDOR}/hands/${f}` });
  hands.setOptions({ maxNumHands: 2, modelComplexity: 0,
                     minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
  return hands;
}

function once(solution, image) {
  return new Promise(async (resolve) => {
    let settled = false;
    const done = r => { if (!settled) { settled = true; resolve(r); } };
    solution.onResults(done);
    const timer = setTimeout(() => done(null), 12000);
    try { await solution.send({ image }); } catch (e) { done(null); }
    finally { clearTimeout(timer); }
  });
}

/* FaceMesh indices (468-point mesh):
     234 / 454  face oval at cheekbone height (left / right in image space)
     152        chin
     10         top of forehead / hairline
     1          nose tip
     168        bridge of nose (facial centreline)                             */
const FM = { EAR_L: 234, EAR_R: 454, CHIN: 152, FOREHEAD: 10, NOSE_TIP: 1, NOSE_BRIDGE: 168 };

/* The face-oval silhouette, walking down from the temple past the jaw. The
   earlobe is found along these, not at a single fixed index. */
const SILHOUETTE_L = [127, 234, 93, 132, 58, 172, 136, 150];
const SILHOUETTE_R = [356, 454, 323, 361, 288, 397, 365, 379];

/* ---------------- detection at a usable resolution ---------------- */

/* FaceMesh resizes whatever you hand it down to a small square before looking
   for a face. Give it a 1920x1080 room shot with a head 15% of the frame wide
   and there is almost nothing left of the face to find — it misses, or worse,
   locks onto the scene and reports a "face" spanning most of the frame. Both
   were reproducible. So: look once at the whole frame, and if that does not
   yield a plausible face, sweep overlapping windows; then always re-run on a
   tight crop of whatever was found, so the final landmarks come from a face
   that fills the model's input. */
const FIRST_PASS = 1024;   // long edge of the whole-frame pass
const CROP_PASS = 448;     // a window or face crop is rescaled to this

function drawCrop(img, sx, sy, sw, sh, outW, outH) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(outW));
  c.height = Math.max(1, Math.round(outH));
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c;
}

/* landmarks from a crop come back relative to that crop — put them back into
   the full image's normalised space */
const remap = (L, sx, sy, sw, sh, W, H) =>
  L.map(p => ({ x: (sx + p.x * sw) / W, y: (sy + p.y * sh) / H, z: p.z }));

async function meshOn(canvas) {
  const res = await once(await getFaceMesh(), canvas);
  const L = res && res.multiFaceLandmarks && res.multiFaceLandmarks[0];
  return L && L.length ? L : null;
}

function bboxPx(L, W, H) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of L) {
    if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
  }
  return { x: x0 * W, y: y0 * H, w: (x1 - x0) * W, h: (y1 - y0) * H };
}

/* Reject a "detection" that is not shaped like a face. This is what stops a
   bogus whole-frame lock from throwing jewellery onto the back wall. */
function looksLikeFace(L, W, H) {
  if (!L) return false;
  const b = bboxPx(L, W, H);
  if (!(b.w > 0 && b.h > 0)) return false;
  if (b.w < 24 || b.h < 24) return false;                  // too small to trust
  if (b.w > W * 0.98 && b.h > H * 0.98) return false;      // the whole frame
  const ratio = b.h / b.w;
  if (ratio < 0.75 || ratio > 2.4) return false;           // not head-shaped
  const fore = L[FM.FOREHEAD], chin = L[FM.CHIN];
  const earL = L[FM.EAR_L], earR = L[FM.EAR_R], nose = L[FM.NOSE_TIP];
  if (!(fore && chin && earL && earR && nose)) return false;
  if (fore.y >= chin.y) return false;                      // upside down
  const lo = Math.min(earL.x, earR.x), hi = Math.max(earL.x, earR.x);
  if (nose.x < lo || nose.x > hi) return false;            // nose outside face
  return true;
}

/* Overlapping square windows, largest first, for finding a small face. */
function windows(W, H) {
  const out = [];
  for (const frac of [1, 0.55, 0.34]) {
    const side = Math.round(Math.min(W, H) * frac);
    if (side < 48) continue;
    const step = Math.max(1, Math.round(side * 0.55));
    for (let y = 0; y + side <= H + step; y += step) {
      for (let x = 0; x + side <= W + step; x += step) {
        const sx = Math.min(x, W - side), sy = Math.min(y, H - side);
        if (sx < 0 || sy < 0) continue;
        out.push({ x: sx, y: sy, w: side, h: side });
      }
    }
    if (out.length > 40) break;
  }
  return out;
}

/* Re-run on a padded crop of a found face so the model sees it big. */
async function refine(img, L, W, H) {
  const b = bboxPx(L, W, H);
  const pad = Math.max(b.w, b.h) * 0.45;
  const side = Math.min(Math.max(b.w, b.h) + pad * 2, Math.min(W, H));
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const sx = Math.max(0, Math.min(W - side, cx - side / 2));
  const sy = Math.max(0, Math.min(H - side, cy - side / 2));

  const fine = await meshOn(drawCrop(img, sx, sy, side, side, CROP_PASS, CROP_PASS));
  if (!fine) return L;
  const back = remap(fine, sx, sy, side, side, W, H);
  return looksLikeFace(back, W, H) ? back : L;
}

async function findFace(img, W, H) {
  const scale = Math.min(1, FIRST_PASS / Math.max(W, H));
  let L = await meshOn(drawCrop(img, 0, 0, W, H, W * scale, H * scale));
  if (looksLikeFace(L, W, H)) return refine(img, L, W, H);

  for (const win of windows(W, H)) {
    const sub = await meshOn(drawCrop(img, win.x, win.y, win.w, win.h, CROP_PASS, CROP_PASS));
    if (!sub) continue;
    const back = remap(sub, win.x, win.y, win.w, win.h, W, H);
    if (looksLikeFace(back, W, H)) return refine(img, back, W, H);
  }
  return null;
}

/* ---------------- geometry, in width units ---------------- */

const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const angle = (a, b) => Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;

/* Where the earring actually hangs.

   234 / 454 are the widest points of the face oval — cheekbone height, and
   slightly inside the ear. Hanging a drop earring there puts it on the cheek.
   Instead, walk the face-oval silhouette and take the point sitting at the
   nose tip's height in the face's own rotated frame: that is the jaw/ear edge
   at lobe level. Step outward from there, because the ear protrudes past the
   oval. Every number is read off this photo, so the result follows face size,
   position, roll and pitch. */
const LOBE_OUT = 0.055;    // of face width, outward past the silhouette

function earLobes(P, faceWidth, roll) {
  const rad = (roll * Math.PI) / 180;
  const u = { x: Math.cos(rad), y: Math.sin(rad) };     // along the ear line, L→R
  const v = { x: -Math.sin(rad), y: Math.cos(rad) };    // "down" the face
  const c = mid(P[FM.EAR_L], P[FM.EAR_R]);

  const frame = p => ({
    u: (p.x - c.x) * u.x + (p.y - c.y) * u.y,
    v: (p.x - c.x) * v.x + (p.y - c.y) * v.y,
  });
  const targetV = frame(P[FM.NOSE_TIP]).v;

  /* the silhouette point closest to lobe height, on each side */
  const pick = idx => {
    let best = null, bestD = Infinity;
    for (const i of idx) {
      const p = P[i];
      if (!p) continue;
      const d = Math.abs(frame(p).v - targetV);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  };

  const out = faceWidth * LOBE_OUT;
  const L = pick(SILHOUETTE_L), R = pick(SILHOUETTE_R);
  return {
    left: { x: L.x - u.x * out, y: L.y - u.y * out },
    right: { x: R.x + u.x * out, y: R.y + u.y * out },
  };
}

/* ---------------- public API ---------------- */

/* Detect the anchors the caller actually needs.
     need: array of anchor names ('ears', 'forehead', 'nose', 'neck',
           'finger', 'wrist'). Pose and Hands are only downloaded and run when
           something asks for an anchor that requires them.
   Returns { anchors, found, failures }; anchors that could not be resolved are
   simply absent and the caller decides how to handle that. */
export async function detectAnchors(imageEl, need) {
  const want = new Set(need && need.length
    ? need : ['ears', 'forehead', 'nose']);
  const anchors = {};
  const failures = [];

  const W = imageEl.naturalWidth || imageEl.width;
  const H = imageEl.naturalHeight || imageEl.height;
  if (!W || !H) return { anchors, found: [], failures: ['image'] };

  /* image aspect: how many width-units tall the image is */
  const asp = H / W;
  anchors.aspect = asp;
  const toW = p => ({ x: p.x, y: p.y * asp });
  const fromW = p => ({ x: p.x, y: p.y / asp });

  const needsFace = ['ears', 'forehead', 'nose', 'neck'].some(k => want.has(k));
  let P = null;

  if (needsFace) {
    const L = await findFace(imageEl, W, H);
    if (L) P = L.map(toW);                 // all face geometry in width units
    else failures.push('face');
  }

  if (P) {
    const earL = P[FM.EAR_L], earR = P[FM.EAR_R];
    const chin = P[FM.CHIN], fore = P[FM.FOREHEAD];
    const noseTip = P[FM.NOSE_TIP], bridge = P[FM.NOSE_BRIDGE];

    /* face width is the reference length for every face-anchored piece, and
       the ear line gives head roll directly */
    const faceWidth = dist(earL, earR);
    const roll = angle(earL, earR);          // 0 when the head is upright
    const faceHeight = dist(fore, chin);

    if (want.has('ears')) {
      const lobes = earLobes(P, faceWidth, roll);
      anchors.ears = {
        left: fromW(lobes.left), right: fromW(lobes.right),
        size: faceWidth, rotation: roll,
      };
    }
    if (want.has('forehead')) {
      anchors.forehead = {
        point: fromW(fore), centreLine: fromW(bridge),
        size: faceWidth, rotation: roll,
      };
    }
    if (want.has('nose')) {
      anchors.nose = { point: fromW(noseTip), size: faceWidth, rotation: roll };
    }
    if (want.has('neck')) {
      /* estimated from the face when no torso is visible: straight down the
         facial centreline from the chin, scaled by face height */
      const rad = (roll * Math.PI) / 180;
      const drop = faceHeight * 0.42;
      anchors.neck = {
        point: fromW({ x: chin.x - Math.sin(rad) * drop,
                       y: chin.y + Math.cos(rad) * drop }),
        size: faceWidth * 1.55, rotation: roll, source: 'face',
      };
    }
    anchors._face = { chin, faceWidth, faceHeight, roll };
  }

  /* ---------- torso: refines the neck anchor when shoulders are visible ---------- */
  if (want.has('neck') || want.has('wrist')) {
    let poseRes = null;
    try { poseRes = await once(await getPose(), imageEl); } catch (e) { poseRes = null; }
    const PS = { SHOULDER_L: 11, SHOULDER_R: 12, WRIST_L: 15, WRIST_R: 16 };

    if (poseRes && poseRes.poseLandmarks) {
      const Q = poseRes.poseLandmarks.map(toW);
      const sL = Q[PS.SHOULDER_L], sR = Q[PS.SHOULDER_R];
      const vis = i => (poseRes.poseLandmarks[i].visibility ?? 1) > 0.5;
      if (want.has('neck') && sL && sR && vis(PS.SHOULDER_L) && vis(PS.SHOULDER_R)) {
        const shoulderWidth = dist(sL, sR);
        const centre = mid(sL, sR);
        const tilt = angle(sR, sL);
        const chin = anchors._face ? anchors._face.chin : null;
        const point = chin
          ? { x: (chin.x + centre.x) / 2, y: chin.y + (centre.y - chin.y) * 0.55 }
          : { x: centre.x, y: centre.y - shoulderWidth * 0.12 };
        anchors.neck = {
          point: fromW(point), size: shoulderWidth * 0.78,
          rotation: tilt, source: 'pose',
        };
      }
      const wrists = [];
      [PS.WRIST_L, PS.WRIST_R].forEach(i => {
        if ((poseRes.poseLandmarks[i].visibility ?? 0) > 0.6) wrists.push(Q[i]);
      });
      if (wrists.length) anchors._poseWrists = wrists;
    }
  }

  /* ---------- hands: rings and bangles ---------- */
  if (want.has('finger') || want.has('wrist')) {
    let handRes = null;
    try { handRes = await once(await getHands(), imageEl); } catch (e) { handRes = null; }

    if (handRes && handRes.multiHandLandmarks && handRes.multiHandLandmarks.length) {
      const Hd = handRes.multiHandLandmarks[0].map(toW);
      /* 13 / 14 = ring-finger MCP and PIP, 0 = wrist, 5 / 17 = index & pinky MCP */
      const mcp = Hd[13], pip = Hd[14], wrist = Hd[0], idx = Hd[5], pinky = Hd[17];
      const palmWidth = dist(idx, pinky);
      if (want.has('finger')) {
        anchors.finger = {
          point: fromW(mid(mcp, pip)),
          size: palmWidth * 0.26 * 2.4,
          rotation: angle(mcp, pip) - 90,
        };
      }
      if (want.has('wrist')) {
        anchors.wrist = {
          point: fromW(wrist), size: palmWidth * 1.15,
          rotation: angle(wrist, mid(idx, pinky)) - 90,
        };
      }
    } else if (want.has('wrist') && anchors._poseWrists && anchors._poseWrists.length) {
      const w = anchors._poseWrists[0];
      anchors.wrist = { point: fromW(w), size: 0.10, rotation: 0 };
    } else {
      failures.push('hand');
    }
  }

  const found = Object.keys(anchors).filter(k => !k.startsWith('_') && k !== 'aspect');
  return { anchors, found, failures };
}
