/* Product catalogue.
   Products describe WHAT a piece is and WHICH anchor it attaches to.
   They never contain screen coordinates. offsetX / offsetY are expressed in
   multiples of the detected anchor's reference size, so they survive any photo. */

export const CATEGORIES = [
  { id: 'earrings',    label: 'Earrings',    emoji: '👂', anchor: 'ears' },
  { id: 'maang-tikka', label: 'Maang Tikka', emoji: '👑', anchor: 'forehead' },
];

export const PRODUCTS = [
  {
    id: 'earring-001', name: 'Diamond Drop Earrings', category: 'earrings',
    price: 24999, description: 'Round and pear-cut stones cascading into a pear-shaped drop.',
    catalogImage: 'assets/catalog/earring_1.jpg',
    tryOnAsset: { left: 'assets/tryon/earring_1_L.png', right: 'assets/tryon/earring_1_R.png' },
    anchor: 'ears', offsetX: 0, offsetY: 0, scaleMultiplier: 1.0, popular: true,
  },
  {
    id: 'earring-002', name: 'Gold Drop Earrings', category: 'earrings',
    price: 18499, description: 'Freeform gold hoops cradling a lustrous baroque pearl.',
    catalogImage: 'assets/catalog/earring_2.jpg',
    tryOnAsset: { left: 'assets/tryon/earring_2_L.png', right: 'assets/tryon/earring_2_R.png' },
    anchor: 'ears', offsetX: 0, offsetY: 0, scaleMultiplier: 1.0,
  },
  {
    id: 'earring-003', name: 'Crimson Pear Drop Earrings', category: 'earrings',
    price: 74999, description: 'A pavé-set diamond stud suspending a deep crimson pear-cut stone.',
    catalogImage: 'assets/catalog/earring_3.jpg',
    tryOnAsset: { left: 'assets/tryon/earring_3_L.png', right: 'assets/tryon/earring_3_R.png' },
    anchor: 'ears', offsetX: 0, offsetY: 0, scaleMultiplier: 1.0, popular: true,
  },
  {
    id: 'earring-004', name: 'Ruby Halo Teardrop Earrings', category: 'earrings',
    price: 89999, description: 'Twin ruby-toned pears wrapped in a brilliant halo on warm gold.',
    catalogImage: 'assets/catalog/earring_4.jpg',
    tryOnAsset: { left: 'assets/tryon/earring_4_L.png', right: 'assets/tryon/earring_4_R.png' },
    anchor: 'ears', offsetX: 0, offsetY: 0, scaleMultiplier: 1.0,
  },
  {
    id: 'earring-005', name: 'Rose Quartz Pearl Drop Earrings', category: 'earrings',
    price: 42999, description: 'Tiered rose quartz in gold-set pavé, finished with pearl drops.',
    catalogImage: 'assets/catalog/earring_5.jpg',
    tryOnAsset: { left: 'assets/tryon/earring_5_L.png', right: 'assets/tryon/earring_5_R.png' },
    anchor: 'ears', offsetX: 0, offsetY: 0, scaleMultiplier: 0.95,
  },
  {
    id: 'earring-006', name: 'Blush Rose Quartz Earrings', category: 'earrings',
    price: 35999, description: 'A soft blush quartz teardrop below a petal-cut diamond bridge.',
    catalogImage: 'assets/catalog/earring_6.jpg',
    tryOnAsset: { left: 'assets/tryon/earring_6_L.png', right: 'assets/tryon/earring_6_R.png' },
    anchor: 'ears', offsetX: 0, offsetY: 0, scaleMultiplier: 1.0, popular: true,
  },
  {
    id: 'earring-007', name: 'Baguette Pearl Line Earrings', category: 'earrings',
    price: 56999, description: 'A slender baguette diamond line ending in a single South Sea pearl.',
    catalogImage: 'assets/catalog/earring_7.jpg',
    tryOnAsset: { left: 'assets/tryon/earring_7_L.png', right: 'assets/tryon/earring_7_R.png' },
    anchor: 'ears', offsetX: 0, offsetY: 0, scaleMultiplier: 0.85,
  },
  {
    id: 'earring-008', name: 'Cascade Diamond Chandelier Earrings', category: 'earrings',
    price: 129999, description: 'Pear and marquise diamonds falling in a fluid chandelier cascade.',
    catalogImage: 'assets/catalog/earring_8.jpg',
    tryOnAsset: { left: 'assets/tryon/earring_8_L.png', right: 'assets/tryon/earring_8_R.png' },
    anchor: 'ears', offsetX: 0, offsetY: 0, scaleMultiplier: 0.9,
  },
  {
    id: 'tikka-001', name: 'Kundan Pearl Maang Tikka', category: 'maang-tikka',
    price: 15999, description: 'Traditional kundan work edged with seed pearls on a beaded chain.',
    catalogImage: 'assets/catalog/tikka_1.jpg',
    tryOnAsset: { single: 'assets/tryon/tikka_1.png' },
    anchor: 'forehead', offsetX: 0, offsetY: 0, scaleMultiplier: 1.0,
  },
  {
    id: 'tikka-002', name: 'Diamond Chain Maang Tikka', category: 'maang-tikka',
    price: 21999, description: 'A cascading line of diamonds finished with a delicate circlet.',
    catalogImage: 'assets/catalog/tikka_2.jpg',
    tryOnAsset: { single: 'assets/tryon/tikka_2.png' },
    anchor: 'forehead', offsetX: 0, offsetY: 0, scaleMultiplier: 1.0,
  },
  {
    id: 'tikka-003', name: 'Rose Quartz Drop Maang Tikka', category: 'maang-tikka',
    price: 17499, description: 'A floral diamond motif suspending a soft rose quartz drop.',
    catalogImage: 'assets/catalog/tikka_3.jpg',
    tryOnAsset: { single: 'assets/tryon/tikka_3.png' },
    anchor: 'forehead', offsetX: 0, offsetY: 0, scaleMultiplier: 1.0,
  },
];
