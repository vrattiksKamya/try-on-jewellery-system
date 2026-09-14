/* Placement engine.

   Turns (product + detected anchors + user nudges) into render transforms.

   There is exactly one rule here: every number that reaches the DOM is derived
   from a detected landmark. Position comes from the anchor point, scale comes
   from the anchor's measured reference size, rotation comes from the anchor's
   measured orientation. Nothing is expressed in pixels or viewport units.

   The constants below are PROPORTIONS, not coordinates. `widthRatio: 0.13`
   means "this piece is 13% as wide as the reference size measured on this
   photo" — on a small face it renders small, on a large face it renders large. */

const GEOMETRY = {
  ears: {
    widthRatio: 0.13,   // of face width
    dropRatio: 0.01,    // the anchor is already the lobe; this is just the hook
    originY: 'top',     // the piece hangs down from its anchor
  },
  forehead: {
    widthRatio: 0.52,   // of face width
    dropRatio: 0.02,
    originY: 'bottom',  // the pendant sits at the hairline, chain runs upward
  },
  nose: {
    widthRatio: 0.16,
    dropRatio: 0.01,
    originY: 'center',
  },
};

/* A piece can be a single asset or a left/right pair. Pairs resolve to two
   placements built from two different landmarks — never one shared centre. */
export function placementsFor(product, anchors, adjust) {
  const a = anchors[product.anchor];
  if (!a) return null;                      // caller shows the "can't place" state

  const g = GEOMETRY[product.anchor];
  const nudge = adjust || { dx: 0, dy: 0, scale: 1, rotation: 0 };

  const build = (point, extraRotation = 0, assetKey = 'single', outward = 1) => {
    /* width as a fraction of IMAGE width, derived from the anchor's own size */
    const width = a.size * g.widthRatio * (product.scaleMultiplier ?? 1) * nudge.scale;

    /* offsets are multiples of the reference size, so they scale with the face.
       On a pair, offsetX is read as "outward", so a tuned piece moves away from
       the face on both sides rather than sliding the whole pair sideways. */
    const offX = (product.offsetX ?? 0) * a.size * outward;
    const offY = ((product.offsetY ?? 0) + g.dropRatio) * a.size;

    /* push the piece along the anchor's own rotated axis, so a tilted head
       moves jewellery along the tilt rather than straight down the screen */
    const rad = ((a.rotation || 0) * Math.PI) / 180;
    const x = point.x + offX * Math.cos(rad) - offY * Math.sin(rad) + nudge.dx;
    const y = point.y + offX * Math.sin(rad) + offY * Math.cos(rad) + nudge.dy;

    return {
      assetKey,
      x, y, width,                                   // all 0..1 of image size
      rotation: (a.rotation || 0) + extraRotation + (nudge.rotation || 0),
      originY: g.originY,
    };
  };

  if (product.anchor === 'ears') {
    return [ build(a.left, 0, 'left', -1), build(a.right, 0, 'right', 1) ];
  }
  return [ build(a.point, a.extraRotation || 0, 'single') ];
}

/* CSS transform for a placement. translate values are percentages of the
   element's own box, so they stay correct at any rendered size. */
export function transformFor(p) {
  const ty = p.originY === 'top' ? '0' : p.originY === 'bottom' ? '-100%' : '-50%';
  return `translate(-50%, ${ty}) rotate(${p.rotation.toFixed(2)}deg)`;
}

export function originCssY(p) {
  return p.originY === 'top' ? 'top center'
       : p.originY === 'bottom' ? 'bottom center'
       : 'center center';
}
