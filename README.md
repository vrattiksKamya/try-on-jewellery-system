# LUSTRE — Virtual Jewellery Try-On

## Run it

**Do not double-click index.html.** Browsers block `file://` pages from loading
the detection models, which is exactly the `Failed to fetch` error you saw.

    ./start.sh          # macOS / Linux
    start.bat           # Windows

Then open <http://localhost:8899>. First detection takes a few seconds while the
models load; after that it is instant.

## How positioning works

There are no fixed coordinates anywhere. The pipeline is:

    photo -> MediaPipe landmarks -> anchor points -> position + scale + rotation -> overlay

| Piece | Anchor | Landmarks |
|---|---|---|
| Earrings | ears | FaceMesh 234 / 454 walked down to the lobe, each side placed independently |
| Maang tikka | forehead | FaceMesh 10 + centreline 168 |

Every piece hangs off the face, so only FaceMesh is loaded — the pose and hand
solutions are skipped entirely.

**The earlobe.** 234 / 454 are the widest points of the face oval: cheekbone
height, and slightly inside the ear. An earring hung there lands on the cheek.
The lobe is derived instead — from the ear line, walk down the face's own
vertical axis by the distance to the nose tip, then step outward past the oval
because the ear protrudes. Both numbers are read off the photo, so the placement
follows head roll and pitch. Tune with `LOBE_DROP` / `LOBE_OUT` in `js/detect.js`.

Scale comes from a measured reference length on that photo (face width), so a
small or distant face gets smaller jewellery. Rotation comes from the ear line,
so a tilted head tilts the jewellery.

Everything is normalised to the image's own coordinate system, never the
viewport, so placement holds on mobile, desktop, portrait and landscape.

## Files

    js/products.js    catalogue — anchors and relative offsets only, no coordinates
    js/detect.js      MediaPipe wrapper, returns normalised anchors
    js/placement.js   anchors + product -> position / scale / rotation
    js/app.js         UI, cart, checkout
    vendor/           MediaPipe models, bundled so there is no CDN dependency
    assets/catalog/   original product photos, unmodified
    assets/tryon/     transparent cut-outs used for the overlay

## Adding a product

Add an entry to `PRODUCTS` in `js/products.js` with a `catalogImage`, a
`tryOnAsset`, and an `anchor`. Use `offsetX` / `offsetY` (multiples of the
anchor's reference size) and `scaleMultiplier` for per-piece tuning. Never put a
pixel or percentage coordinate in a product.

On a pair, `offsetX` reads as *outward*, so a positive value moves both earrings
away from the face rather than sliding the pair sideways.

A try-on asset is a transparent PNG cropped tight to the piece: the overlay pins
its **top centre** to the anchor, so that point should be where the post meets
the lobe.

## Manual fallback

If a landmark is missing the piece reports it and can be dragged into place;
scroll on a piece to resize, use the sliders to rotate, and **Auto Align**
restores the detected placement.
