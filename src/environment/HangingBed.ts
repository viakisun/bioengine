import * as THREE from 'three';

// ═══════════════════════════════════════════════════════════════
// Dutch-style greenhouse hanging gutter system
// ═══════════════════════════════════════════════════════════════
// Real structure (top → bottom):
//   ① Training wire (유인줄 고정선): horizontal galvanized wire at ~3.5m
//   ② Vertical training strings (유인줄): every 35cm, plant spirals around this
//   ③ Crop wire / hook wire: connects gutter to overhead structure
//   ④ Gutter (거터): V-shaped galvanized steel channel, holds coco slabs
//   ⑤ Coco coir slabs (코코배지): growing medium on gutter
//   ⑥ Tube rail (튜브레일): heating pipes, also serve as transport rail
//      - Two parallel 51mm galvanized pipes running below gutter
//      - Spacing: ~50cm apart, at ~0.3m height

const BED_LENGTH = 30;        // meters
const GUTTER_WIDTH = 0.24;    // 240mm standard gutter width
const GUTTER_DEPTH = 0.08;    // 80mm gutter depth
const GUTTER_Y = 0.75;        // gutter height (supported by hooks from overhead)
const COCO_WIDTH = 0.20;      // coco slab width
const COCO_HEIGHT = 0.075;    // coco slab height (7.5cm)
const WIRE_TOP_Y = 3.5;       // training wire height
const TUBE_RAIL_Y = 0.30;     // tube rail center height
const TUBE_RAIL_SPACING = 0.50; // distance between two tube rails
const TUBE_RAIL_RADIUS = 0.0255; // 51mm diameter / 2

export function createHangingBed(scene: THREE.Scene): THREE.Group {
  const group = new THREE.Group();

  // ── Materials ──
  const galvanizedMat = new THREE.MeshStandardMaterial({
    color: 0xb8b8b0,       // galvanized steel — light silver-gray
    roughness: 0.35,
    metalness: 0.7,
  });

  const gutterMat = new THREE.MeshStandardMaterial({
    color: 0xc0c0b8,       // galvanized gutter — slightly lighter
    roughness: 0.30,
    metalness: 0.75,
  });

  const cocoMat = new THREE.MeshStandardMaterial({
    color: 0x6b5240,        // coco coir — warm brown
    roughness: 0.95,
    metalness: 0.0,
  });

  const whitePlasticMat = new THREE.MeshStandardMaterial({
    color: 0xf0f0e8,        // white plastic grow bag wrapper
    roughness: 0.7,
    metalness: 0.0,
  });

  const wireMat = new THREE.MeshStandardMaterial({
    color: 0x999999,
    roughness: 0.3,
    metalness: 0.8,
  });

  const stringMat = new THREE.MeshStandardMaterial({
    color: 0xd8d0c0,        // white/cream polypropylene string
    roughness: 0.8,
    metalness: 0.0,
  });

  // ══════════════════════════════════════
  // ① GUTTER (거터) — V-shaped galvanized steel channel
  // ══════════════════════════════════════
  // Create gutter cross-section as extruded shape
  const gutterShape = new THREE.Shape();
  const gw = GUTTER_WIDTH / 2;
  const gd = GUTTER_DEPTH;
  const lip = 0.015;  // top lip width
  const bw = 0.04;    // bottom width (narrow V)

  // V-profile: left lip → left slope → bottom → right slope → right lip
  gutterShape.moveTo(-gw - lip, 0);
  gutterShape.lineTo(-gw, 0);
  gutterShape.lineTo(-bw, -gd);
  gutterShape.lineTo(bw, -gd);
  gutterShape.lineTo(gw, 0);
  gutterShape.lineTo(gw + lip, 0);
  gutterShape.lineTo(gw + lip, -0.005);
  gutterShape.lineTo(gw, -0.005);
  gutterShape.lineTo(bw + 0.003, -gd + 0.003);
  gutterShape.lineTo(-bw - 0.003, -gd + 0.003);
  gutterShape.lineTo(-gw, -0.005);
  gutterShape.lineTo(-gw - lip, -0.005);
  gutterShape.closePath();

  const gutterExtrudeSettings = {
    steps: 1,
    depth: BED_LENGTH,
    bevelEnabled: false,
  };
  const gutterGeo = new THREE.ExtrudeGeometry(gutterShape, gutterExtrudeSettings);
  // Rotate so gutter runs along X axis
  gutterGeo.rotateY(Math.PI / 2);
  gutterGeo.translate(BED_LENGTH / 2, 0, 0);

  const gutterMesh = new THREE.Mesh(gutterGeo, gutterMat);
  gutterMesh.position.set(0, GUTTER_Y, 0);
  gutterMesh.castShadow = true;
  gutterMesh.receiveShadow = true;
  group.add(gutterMesh);

  // ══════════════════════════════════════
  // ② COCO COIR SLABS (코코배지) — sit inside gutter
  // ══════════════════════════════════════
  // White plastic wrapped coco slabs, every ~1m along gutter
  const slabLength = 0.95;
  const slabGap = 0.05;
  for (let x = -BED_LENGTH / 2 + slabGap; x < BED_LENGTH / 2 - slabGap; x += slabLength + slabGap) {
    // White plastic wrapper (visible part)
    const wrapGeo = new THREE.BoxGeometry(slabLength, COCO_HEIGHT, COCO_WIDTH);
    const wrap = new THREE.Mesh(wrapGeo, whitePlasticMat);
    wrap.position.set(x + slabLength / 2, GUTTER_Y - GUTTER_DEPTH / 2 + COCO_HEIGHT / 2 + 0.005, 0);
    wrap.castShadow = true;
    wrap.receiveShadow = true;
    group.add(wrap);

    // Coco coir visible on top
    const topGeo = new THREE.PlaneGeometry(slabLength - 0.02, COCO_WIDTH - 0.02);
    const topMesh = new THREE.Mesh(topGeo, cocoMat);
    topMesh.rotation.x = -Math.PI / 2;
    topMesh.position.set(
      x + slabLength / 2,
      GUTTER_Y - GUTTER_DEPTH / 2 + COCO_HEIGHT + 0.006,
      0,
    );
    group.add(topMesh);
  }

  // ══════════════════════════════════════
  // ③ GUTTER SUPPORT HOOKS (거터 지지 후크)
  // ══════════════════════════════════════
  // Galvanized wire hooks connecting gutter to overhead truss, every 3m
  for (let x = -BED_LENGTH / 2 + 1.5; x <= BED_LENGTH / 2 - 1; x += 3) {
    // Vertical support wire from greenhouse frame to gutter
    const hookGeo = new THREE.CylinderGeometry(0.003, 0.003, WIRE_TOP_Y + 0.5 - GUTTER_Y, 4);
    const hook = new THREE.Mesh(hookGeo, galvanizedMat);
    hook.position.set(x, GUTTER_Y + (WIRE_TOP_Y + 0.5 - GUTTER_Y) / 2, 0);
    group.add(hook);
  }

  // ══════════════════════════════════════
  // ④ TRAINING WIRE (유인줄 고정선) — horizontal at 3.5m
  // ══════════════════════════════════════
  // Two parallel wires (real greenhouses have 2 for zigzag lowering)
  for (const zOffset of [-0.06, 0.06]) {
    const wireGeo = new THREE.CylinderGeometry(0.0015, 0.0015, BED_LENGTH, 6);
    wireGeo.rotateZ(Math.PI / 2);  // align along X
    const wireM = new THREE.Mesh(wireGeo, wireMat);
    wireM.position.set(0, WIRE_TOP_Y, zOffset);
    group.add(wireM);
  }

  // ══════════════════════════════════════
  // ⑤ TRAINING STRINGS (유인줄) — vertical, one per plant
  // ══════════════════════════════════════
  const plantSpacing = 0.35;
  for (let x = -BED_LENGTH / 2 + plantSpacing / 2; x < BED_LENGTH / 2; x += plantSpacing) {
    const stringHeight = WIRE_TOP_Y - (GUTTER_Y - GUTTER_DEPTH / 2 + COCO_HEIGHT);
    const stringGeo = new THREE.CylinderGeometry(0.0008, 0.0008, stringHeight, 3);
    const stringM = new THREE.Mesh(stringGeo, stringMat);
    const baseY = GUTTER_Y - GUTTER_DEPTH / 2 + COCO_HEIGHT;
    stringM.position.set(x, baseY + stringHeight / 2, 0);
    group.add(stringM);
  }

  // ══════════════════════════════════════
  // ⑥ TUBE RAILS (튜브레일) — heating + transport pipes
  // ══════════════════════════════════════
  // Two parallel galvanized steel pipes running the full length below gutter
  for (const zOffset of [-TUBE_RAIL_SPACING / 2, TUBE_RAIL_SPACING / 2]) {
    const tubeGeo = new THREE.CylinderGeometry(
      TUBE_RAIL_RADIUS, TUBE_RAIL_RADIUS, BED_LENGTH, 12,
    );
    tubeGeo.rotateZ(Math.PI / 2);  // align along X axis
    const tube = new THREE.Mesh(tubeGeo, galvanizedMat);
    tube.position.set(0, TUBE_RAIL_Y, zOffset);
    tube.castShadow = true;
    tube.receiveShadow = true;
    group.add(tube);
  }

  // Tube rail support brackets every 3m (connects to gutter hooks)
  for (let x = -BED_LENGTH / 2 + 1.5; x <= BED_LENGTH / 2 - 1; x += 3) {
    // Cross-bracket connecting two tube rails
    const crossGeo = new THREE.CylinderGeometry(0.008, 0.008, TUBE_RAIL_SPACING + 0.04, 4);
    crossGeo.rotateX(Math.PI / 2);
    const cross = new THREE.Mesh(crossGeo, galvanizedMat);
    cross.position.set(x, TUBE_RAIL_Y, 0);
    group.add(cross);

    // Vertical link from tube rail bracket to gutter
    const linkGeo = new THREE.CylinderGeometry(0.005, 0.005, GUTTER_Y - GUTTER_DEPTH - TUBE_RAIL_Y, 4);
    const link = new THREE.Mesh(linkGeo, galvanizedMat);
    link.position.set(x, TUBE_RAIL_Y + (GUTTER_Y - GUTTER_DEPTH - TUBE_RAIL_Y) / 2, 0);
    group.add(link);
  }

  // ══════════════════════════════════════
  // ⑦ DRIP IRRIGATION LINES (점적관수 라인) — thin tubes on coco slabs
  // ══════════════════════════════════════
  const dripMat = new THREE.MeshStandardMaterial({
    color: 0x222222,         // black PE drip tube
    roughness: 0.6,
    metalness: 0.0,
  });
  const dripGeo = new THREE.CylinderGeometry(0.004, 0.004, BED_LENGTH - 0.2, 6);
  dripGeo.rotateZ(Math.PI / 2);
  const drip = new THREE.Mesh(dripGeo, dripMat);
  drip.position.set(0, GUTTER_Y - GUTTER_DEPTH / 2 + COCO_HEIGHT + 0.01, COCO_WIDTH * 0.25);
  group.add(drip);

  // ── Metadata ──
  group.userData = {
    bedLength: BED_LENGTH,
    bedY: GUTTER_Y - GUTTER_DEPTH / 2 + COCO_HEIGHT,  // top of coco slab
    bedHeight: 0,  // plant base is at coco surface
    wireTopY: WIRE_TOP_Y,
    plantSpacing,
    gutterY: GUTTER_Y,
  };

  scene.add(group);
  return group;
}

export function getPlantPositions(bedGroup: THREE.Group): THREE.Vector3[] {
  const { bedLength, bedY, plantSpacing } = bedGroup.userData;
  const positions: THREE.Vector3[] = [];
  for (let x = -bedLength / 2 + plantSpacing / 2; x < bedLength / 2; x += plantSpacing) {
    positions.push(new THREE.Vector3(x, bedY, 0));
  }
  return positions;
}
