import { PRODUCTS, CATEGORIES } from './products.js';
import { detectAnchors } from './detect.js';
import { placementsFor, transformFor, originCssY } from './placement.js';

const state = {
  route: 'landing',
  photo: null,
  photoNatural: null,      // { w, h } of the uploaded image
  anchors: {},             // detected, normalised to the image
  detectStatus: 'idle',    // idle | running | done | failed
  detectFailures: [],
  activeCategory: 'earrings',
  selected: {},            // productId -> product
  adjust: {},              // productId -> { dx, dy, scale, rotation }
  activeAdjust: null,      // productId currently being fine-tuned
  cart: [],
  lastOrder: null,
};

const money = n => '₹' + n.toLocaleString('en-IN');
const app = () => document.getElementById('app');

function setRoute(r) { state.route = r; window.scrollTo(0, 0); render(); }

/* ---------------- photo + detection ---------------- */

/* Every photo — uploaded or demo — goes through the identical pipeline.
   Old landmark data is discarded first so nothing leaks across photos. */
async function usePhoto(src, goStudio) {
  state.photo = src;
  state.anchors = {};
  state.adjust = {};
  state.activeAdjust = null;
  state.detectFailures = [];
  state.detectStatus = 'running';
  state.photoNatural = null;
  if (goStudio) setRoute('studio'); else render();

  const el = new Image();
  el.crossOrigin = 'anonymous';
  await new Promise(res => { el.onload = res; el.onerror = res; el.src = src; });
  state.photoNatural = { w: el.naturalWidth, h: el.naturalHeight };

  try {
    const { anchors, failures } = await detectAnchors(el);
    state.anchors = anchors;
    state.detectFailures = failures;
    state.detectStatus = Object.keys(anchors).length ? 'done' : 'failed';
  } catch (e) {
    console.error(e);
    state.anchors = {};
    state.detectStatus = 'failed';
  }
  render();
}

const useDemoPhoto = () => usePhoto('assets/demo-photo.jpg', true);

function handleFile(file, goStudio = true) {
  if (!file) return;
  const r = new FileReader();
  r.onload = e => usePhoto(e.target.result, goStudio);
  r.readAsDataURL(file);
}

/* ---------------- look + cart ---------------- */

function toggleTryOn(id) {
  const p = PRODUCTS.find(x => x.id === id);
  if (state.selected[id]) { delete state.selected[id]; delete state.adjust[id];
    if (state.activeAdjust === id) state.activeAdjust = null; }
  else { state.selected[id] = p; state.activeAdjust = id; }
  render();
}
function removeFromLook(id) { delete state.selected[id]; delete state.adjust[id]; render(); }
function resetLook() { state.selected = {}; state.adjust = {}; state.activeAdjust = null; render(); }
function undoLast() {
  const k = Object.keys(state.selected);
  if (k.length) removeFromLook(k[k.length - 1]);
}
/* Auto Align drops the manual nudges and returns to the detected placement. */
function autoAlign(id) {
  if (id) delete state.adjust[id]; else state.adjust = {};
  render();
}
function addToCart(id) {
  const p = PRODUCTS.find(x => x.id === id);
  if (!state.cart.find(c => c.id === p.id)) state.cart.push(p);
  render();
}
function addLookToCart() {
  Object.values(state.selected).forEach(p => {
    if (!state.cart.find(c => c.id === p.id)) state.cart.push(p);
  });
  setRoute('cart');
}
const removeFromCart = id => { state.cart = state.cart.filter(p => p.id !== id); render(); };
const cartTotal = () => state.cart.reduce((s, p) => s + p.price, 0);
const lookTotal = () => Object.values(state.selected).reduce((s, p) => s + p.price, 0);

/* ---------------- overlay rendering ---------------- */

/* Placements arrive as fractions of the image. Because the <img> is rendered at
   width:100%/height:auto inside the stage, those fractions map straight onto
   percentage offsets — correct at every display size, on any device. */
function overlayHtml() {
  const items = Object.values(state.selected);
  let html = '';
  const unplaceable = [];

  items.forEach(p => {
    const pls = placementsFor(p, state.anchors, state.adjust[p.id]);
    if (!pls) { unplaceable.push(p); return; }
    pls.forEach((pl, i) => {
      const asset = p.tryOnAsset[pl.assetKey] || p.tryOnAsset.single;
      if (!asset) return;
      html += `<div class="overlay-item ${state.activeAdjust === p.id ? 'selected' : ''}"
        data-pid="${p.id}" data-i="${i}"
        style="left:${(pl.x * 100).toFixed(3)}%;top:${(pl.y * 100).toFixed(3)}%;
               width:${(pl.width * 100).toFixed(3)}%;
               transform:${transformFor(pl)};transform-origin:${originCssY(pl)};">
        <img src="${asset}" alt="${p.name}"></div>`;
    });
  });
  return { html, unplaceable };
}

function anchorPills() {
  const wanted = [['ears', 'Ears'], ['forehead', 'Forehead'], ['nose', 'Nose']];
  return `<div class="anchor-row">${wanted.map(([k, l]) =>
    `<span class="anchor-pill ${state.anchors[k] ? 'on' : ''}">${state.anchors[k] ? '●' : '○'} ${l}</span>`
  ).join('')}</div>`;
}

function adjustBar() {
  const id = state.activeAdjust;
  if (!id || !state.selected[id]) return '';
  const a = state.adjust[id] || { scale: 1, rotation: 0 };
  return `<div class="adjust-bar">
    <span class="lbl">${state.selected[id].name}</span>
    <span class="lbl">Size</span>
    <input type="range" min="0.4" max="2.2" step="0.02" value="${a.scale ?? 1}"
           oninput="A.nudge('${id}','scale',+this.value)">
    <span class="lbl">Rotate</span>
    <input type="range" min="-45" max="45" step="1" value="${a.rotation ?? 0}"
           oninput="A.nudge('${id}','rotation',+this.value)">
    <button class="ctrl-btn" onclick="A.autoAlign('${id}')">⤾ Auto Align</button>
  </div>`;
}

function nudge(id, key, val) {
  const cur = state.adjust[id] || { dx: 0, dy: 0, scale: 1, rotation: 0 };
  state.adjust[id] = { ...cur, [key]: val };
  render();
}

function PhotoStage() {
  const { html, unplaceable } = overlayHtml();
  const hasSel = Object.keys(state.selected).length > 0;
  const detecting = state.detectStatus === 'running';

  let warn = '';
  if (unplaceable.length) {
    warn = `<div class="warn-box">Unable to detect the jewellery placement area for
      ${unplaceable.map(p => p.name).join(', ')}. Try a clearer photo that shows the
      ${[...new Set(unplaceable.map(p => p.anchor))].join(' and ')} — or drag the piece into place yourself.</div>`;
  } else if (state.detectStatus === 'failed') {
    warn = `<div class="warn-box">Unable to detect the jewellery placement area. Try a clearer photo.</div>`;
  }

  return `<div>
    <div class="stage-wrap">
      <div class="photo-stage" id="photoStage">
        <img class="base-photo" src="${state.photo}" alt="Your photo">
        ${html}
        ${!hasSel && !detecting ? `<div class="empty-stage-msg">
            <h4>Choose a jewellery piece to start styling.</h4>
            <p>Select earrings, a nose ring or a maang tikka from the catalogue.</p>
          </div>` : ''}
        ${detecting ? `<div class="detect-overlay"><div class="spinner"></div>
            <p>Reading this photo's landmarks…</p></div>` : ''}
      </div>
    </div>
    <div class="photo-controls">
      <button class="ctrl-btn" onclick="A.undoLast()">↺ Undo</button>
      <button class="ctrl-btn" onclick="A.resetLook()">⟲ Reset</button>
      <button class="ctrl-btn" onclick="A.autoAlign()">⤾ Auto Align all</button>
      <button class="ctrl-btn" onclick="A.fullscreen()">⛶ Fullscreen</button>
      <button class="ctrl-btn" onclick="A.saveLook()">🖤 Save Look</button>
      <button class="ctrl-btn" onclick="document.getElementById('rePhoto').click()">📷 Change Photo</button>
      <input type="file" id="rePhoto" accept="image/*" style="display:none">
    </div>
    ${anchorPills()}
    ${adjustBar()}
    ${warn}
  </div>`;
}

/* ---------------- shell + pages ---------------- */

function Header() {
  return `<header class="site-header">
    <div class="brand" onclick="A.setRoute('landing')">LUSTRE<span>.</span></div>
    <nav class="nav-links">
      <a onclick="A.setRoute('landing')" class="${state.route === 'landing' ? 'active' : ''}">Home</a>
      <a onclick="A.go()" class="${state.route === 'studio' ? 'active' : ''}">Try On</a>
      <a onclick="A.go()">Jewellery</a>
    </nav>
    <div class="header-actions">
      <span class="icon-btn">♡</span>
      <span class="icon-btn" onclick="A.setRoute('cart')">🛍<span class="cart-count">${state.cart.length}</span></span>
    </div>
  </header>`;
}
const Footer = () => `<footer class="site-footer">LUSTRE — a virtual fitting room for jewellery. Demo prototype, no real payment is processed.</footer>`;

function Landing() {
  const [e, n] = PRODUCTS.filter(p => p.popular).concat(PRODUCTS);
  return `<section class="hero">
    <div>
      <div class="hero-badge-row"><span class="badge">✨ Virtual Jewellery Try-On</span></div>
      <h1 class="hero-heading">Try Jewellery Before You Buy.</h1>
      <p class="hero-sub">Upload your photo, discover your perfect jewellery, and see your look come together instantly.</p>
      <div class="hero-actions">
        <button class="btn btn-primary" onclick="A.setRoute('upload')">Start Your Try-On</button>
        <button class="btn btn-outline" onclick="A.go()">Explore Jewellery</button>
      </div>
    </div>
    <div class="hero-visual">
      <div class="hero-photo-frame"><img src="assets/demo-photo.jpg" alt="Model"></div>
      <div class="hero-plus p1">+</div>
      <div class="hero-float-card hero-float-1"><img src="${e.catalogImage}">${e.name}</div>
      <div class="hero-plus p2">+</div>
      <div class="hero-float-card hero-float-2"><img src="${n.catalogImage}">${n.name}</div>
    </div>
  </section>
  <section class="how-it-works">
    <div class="how-heading"><div class="section-label">How It Works</div>
      <h2>From selfie to styled, in three simple steps.</h2></div>
    <div class="steps-row">
      <div class="step-card"><div class="step-num">01 — Upload</div><h3>Upload Your Photo</h3>
        <p>Choose a selfie or photo you'd like to style.</p></div>
      <div class="step-card"><div class="step-num">02 — Try</div><h3>Choose Your Jewellery</h3>
        <p>Browse real jewellery products from the catalogue and try them on.</p></div>
      <div class="step-card"><div class="step-num">03 — Buy</div><h3>Create Your Look</h3>
        <p>Mix and match your favourite pieces and add them to your cart.</p></div>
    </div>
  </section>
  <div class="cta-band"><h3>Your perfect piece is waiting to be tried on.</h3>
    <button class="btn btn-primary" onclick="A.setRoute('upload')">Start Your Try-On</button></div>`;
}

function Upload() {
  return `<div class="upload-screen">
    <div class="section-label">Step 1</div>
    <h2>Let's create your look.</h2>
    <p>Upload a clear selfie or use our demo photo to start.</p>
    <div class="dropzone" id="dropzone" onclick="document.getElementById('fileInput').click()">
      <div class="icon">📷</div><h4>Upload Photo</h4>
      <p>Drag and drop, or click to browse</p>
      <input type="file" id="fileInput" accept="image/*">
    </div>
    <div class="upload-divider">or</div>
    <div class="upload-actions"><button class="btn btn-outline" onclick="A.useDemoPhoto()">Try Demo Photo</button></div>
    <div class="demo-photo-preview"><img src="assets/demo-photo.jpg">
      <p style="font-size:12.5px;color:var(--charcoal-soft)">The demo photo runs through the same landmark detection as your own.</p></div>
  </div>`;
}

function MyLookPanel() {
  const items = Object.values(state.selected);
  return `<div class="mylook-panel"><h4>My Look</h4>
    ${items.length === 0 ? `<div class="mylook-empty">No jewellery selected yet.</div>`
      : items.map(p => `<div class="mylook-item">
          <img src="${p.catalogImage}">
          <div class="mylook-item-info"><p class="name">${p.name}</p>
            <p class="price">${money(p.price)}</p>
            <span class="remove-link" onclick="A.removeFromLook('${p.id}')">Remove</span></div></div>`).join('')}
    <div class="mylook-total"><span>Total</span><span>${money(lookTotal())}</span></div>
    <button class="btn btn-primary btn-full" ${items.length === 0 ? 'disabled' : ''}
      onclick="A.addLookToCart()">Add Look to Cart</button></div>`;
}

const MobileLookBar = () => {
  const n = Object.keys(state.selected).length;
  return `<div class="mobile-look-bar">
    <div class="info">${n} item${n !== 1 ? 's' : ''} <b>${money(lookTotal())}</b></div>
    <button class="btn btn-primary btn-sm" ${n === 0 ? 'disabled' : ''} onclick="A.addLookToCart()">Add to Cart</button>
  </div>`;
};

const CategoryPanel = () => `<div class="categories-panel"><h4>Categories</h4>
  ${CATEGORIES.map(c => `<button class="cat-btn ${state.activeCategory === c.id ? 'active' : ''}"
    onclick="A.setCategory('${c.id}')"><span class="cat-emoji">${c.emoji}</span>${c.label}</button>`).join('')}</div>`;

const setCategory = id => { state.activeCategory = id; render(); };

function ProductCard(p) {
  const sel = !!state.selected[p.id];
  return `<div class="product-card ${sel ? 'selected' : ''}">
    <div class="product-img-wrap">${p.popular ? '<span class="popular-badge">Popular</span>' : ''}
      <img src="${p.catalogImage}" alt="${p.name}"></div>
    <div class="product-info"><h4>${p.name}</h4>
      <div class="cat-tag">${p.category.replace('-', ' ')}</div>
      <div class="price">${money(p.price)}</div>
      <div class="product-actions">
        <button class="btn btn-outline btn-sm tryon-btn ${sel ? 'added' : ''}"
          onclick="A.toggleTryOn('${p.id}')">${sel ? '✓ Added to Look' : 'Try On'}</button>
        <button class="add-cart-btn" title="Add to cart" onclick="A.addToCart('${p.id}')">+</button>
      </div></div></div>`;
}

function Catalogue() {
  const list = PRODUCTS.filter(p => p.category === state.activeCategory);
  const meta = CATEGORIES.find(c => c.id === state.activeCategory);
  return `<div class="catalogue-section">
    <div class="catalogue-head"><h3>${meta.emoji} ${meta.label}</h3>
      <span>${list.length} piece${list.length !== 1 ? 's' : ''}</span></div>
    ${list.length === 0 ? `<div class="empty-category"><div class="icon">${meta.emoji}</div>
        <p>New ${meta.label.toLowerCase()} pieces are being added to the catalogue soon.</p></div>`
      : `<div class="product-grid">${list.map(ProductCard).join('')}</div>`}</div>`;
}

const Studio = () => `<div class="studio">${CategoryPanel()}
  <div class="studio-right"><div class="studio-main">${PhotoStage()}${MyLookPanel()}</div>
  ${Catalogue()}</div></div>${MobileLookBar()}`;

function Cart() {
  if (!state.cart.length) return `<div class="page-narrow"><h2>Your Cart</h2>
    <div class="empty-cart"><div class="icon">🛍</div>
      <p>Your cart is empty. Head back to the studio to build your look.</p>
      <div style="margin-top:20px;"><button class="btn btn-primary" onclick="A.go()">Try On Jewellery</button></div>
    </div></div>`;
  return `<div class="page-narrow"><h2>Your Cart</h2>
    ${state.cart.map(p => `<div class="cart-row"><img src="${p.catalogImage}">
      <div class="info"><h4>${p.name}</h4><p>${p.category.replace('-', ' ')}</p></div>
      <div class="price">${money(p.price)}</div>
      <span class="remove-link" onclick="A.removeFromCart('${p.id}')">Remove</span></div>`).join('')}
    <div class="cart-summary">
      <div class="summary-line"><span>Subtotal</span><span>${money(cartTotal())}</span></div>
      <div class="summary-line total"><span>Total</span><span>${money(cartTotal())}</span></div></div>
    <div style="margin-top:24px;"><button class="btn btn-primary btn-full" onclick="A.setRoute('checkout')">Proceed to Checkout</button></div>
  </div>`;
}

const Checkout = () => `<div class="page-narrow"><h2>Demo Checkout</h2>
  <form id="checkoutForm"><div class="checkout-grid">
    <div class="form-group"><label>Full Name</label><input required name="name" placeholder="Your name"></div>
    <div class="form-group"><label>Email</label><input required type="email" name="email" placeholder="you@example.com"></div>
    <div class="form-group"><label>Phone</label><input required name="phone" placeholder="+91 00000 00000"></div>
    <div class="form-group"><label>Pincode</label><input required name="pincode" placeholder="380001"></div>
    <div class="form-group full"><label>Address</label><input required name="address" placeholder="Street address"></div>
    <div class="form-group"><label>City</label><input required name="city" placeholder="City"></div>
    <div class="form-group"><label>State</label><input required name="state" placeholder="State"></div>
  </div>
  <div class="order-summary-box"><h4>Order Summary</h4>
    ${state.cart.map(p => `<div class="order-line"><span>${p.name}</span><span>${money(p.price)}</span></div>`).join('')}
    <div class="order-line total"><span>Total</span><span>${money(cartTotal())}</span></div></div>
  <button type="submit" class="btn btn-primary btn-full">Place Demo Order</button></form></div>`;

const Success = () => `<div class="success-screen"><div class="success-icon">✨</div>
  <h2>Your Look Is Ready!</h2>
  <p>Your demo order has been placed successfully${state.lastOrder?.name ? ', ' + state.lastOrder.name : ''}. No real payment was processed.</p>
  <div class="success-actions">
    <button class="btn btn-primary" onclick="A.resetLook();A.go()">Try Another Look</button>
    <button class="btn btn-outline" onclick="A.setRoute('landing')">Continue Shopping</button></div></div>`;

/* ---------------- interaction ---------------- */

function attach() {
  const fi = document.getElementById('fileInput');
  if (fi) fi.addEventListener('change', e => handleFile(e.target.files[0], true));
  const rp = document.getElementById('rePhoto');
  if (rp) rp.addEventListener('change', e => handleFile(e.target.files[0], false));

  const dz = document.getElementById('dropzone');
  if (dz) {
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
    dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('drag');
      handleFile(e.dataTransfer.files[0], true); });
  }

  /* Manual fallback: drag to reposition, wheel to resize. Offsets are stored as
     fractions of the image, so they survive resizing and orientation changes. */
  const stage = document.getElementById('photoStage');
  if (stage) {
    let drag = null;
    stage.querySelectorAll('.overlay-item').forEach(el => {
      el.addEventListener('pointerdown', e => {
        e.preventDefault();
        const pid = el.dataset.pid;
        const r = stage.getBoundingClientRect();
        state.activeAdjust = pid;
        const base = state.adjust[pid] || { dx: 0, dy: 0, scale: 1, rotation: 0 };
        drag = { pid, x: e.clientX, y: e.clientY, w: r.width, h: r.height, base: { ...base } };
        el.setPointerCapture(e.pointerId);
      });
      el.addEventListener('pointermove', e => {
        if (!drag || drag.pid !== el.dataset.pid) return;
        state.adjust[drag.pid] = { ...drag.base,
          dx: drag.base.dx + (e.clientX - drag.x) / drag.w,
          dy: drag.base.dy + (e.clientY - drag.y) / drag.h };
        const p = state.selected[drag.pid];
        const pls = placementsFor(p, state.anchors, state.adjust[drag.pid]);
        if (!pls) return;
        stage.querySelectorAll(`.overlay-item[data-pid="${drag.pid}"]`).forEach(sib => {
          const pl = pls[+sib.dataset.i]; if (!pl) return;
          sib.style.left = (pl.x * 100) + '%';
          sib.style.top = (pl.y * 100) + '%';
        });
      });
      const end = () => { if (drag) { drag = null; render(); } };
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
      el.addEventListener('wheel', e => {
        e.preventDefault();
        const pid = el.dataset.pid;
        const cur = state.adjust[pid] || { dx: 0, dy: 0, scale: 1, rotation: 0 };
        nudge(pid, 'scale', Math.min(2.2, Math.max(0.4, cur.scale * (e.deltaY > 0 ? 0.94 : 1.06))));
      }, { passive: false });
    });
  }

  const cf = document.getElementById('checkoutForm');
  if (cf) cf.addEventListener('submit', e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(cf).entries());
    state.lastOrder = { items: [...state.cart], total: cartTotal(), name: d.name };
    state.cart = [];
    setRoute('success');
  });
}

function render() {
  const r = state.route;
  let body = '';
  if (r === 'landing') body = Header() + Landing() + Footer();
  else if (r === 'upload') body = Header() + Upload() + Footer();
  else if (r === 'studio') body = Header() + Studio();
  else if (r === 'cart') body = Header() + Cart() + Footer();
  else if (r === 'checkout') body = Header() + Checkout() + Footer();
  else if (r === 'success') body = Header() + Success() + Footer();
  app().innerHTML = body;
  attach();
}

/* exposed for inline handlers */
window.A = {
  setRoute, useDemoPhoto, toggleTryOn, addToCart, addLookToCart, removeFromCart,
  removeFromLook, resetLook, undoLast, autoAlign, setCategory, nudge,
  go: () => (state.photo ? setRoute('studio') : setRoute('upload')),
  fullscreen: () => {
    const el = document.getElementById('photoStage');
    if (!el) return;
    document.fullscreenElement ? document.exitFullscreen() : el.requestFullscreen?.();
  },
  saveLook: () => {
    try {
      localStorage.setItem('lustre_look', JSON.stringify({
        ids: Object.keys(state.selected), adjust: state.adjust }));
      alert('Look saved to this browser.');
    } catch (e) { alert('Could not save look.'); }
  },
};

render();
