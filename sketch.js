// Main simulation state.
let particles = [];
let num = 100;
var trailMode = 0; // 0 off, 1 short, 2 long
var showHeatmap = false;
var showVectorField = false;
// Heatmap uses a cached off-screen canvas so it can be reused.
let heatmapCellSize = 24;
let heatmapFrameSkip = 2;
let heatmapFrameCounter = 0;
let heatmapBuffer;
let accelerators = [];
// Seed controls the same starting layout when the user presses R.
let currentSeed = 0;
let paused = false;
let timeScale = 1;
let simAccumulator = 0;
let stepOnce = 0;
// Launch drag state.
let launchTarget = null;
let launchStart = null;
let launchPreview = null;
// Spawn UI state.
let spawnSizeSlider;
let spawnMass = 100;
let showControls = true;
let showScienceOverlay = false;
// Science panel scroll state.
let scienceScroll = 0;
let scienceScrollMax = 0;
let scienceOverlayDragging = false;
let scienceOverlayDragOffset = 0;
let scienceOverlayLayoutCache = null;
// HUD timing for the FPS counter.
let lastHeatmapCamX = null;
let lastHeatmapCamY = null;
let lastHeatmapZoom = null;
let fpsDisplay = 0;
let lastFpsSampleMs = 0;

// Camera controls the part of the world we can see.
let camX = 0;
let camY = 0;
let zoom = 0.1;

// Spawn type: red, blue, or accelerator.
let spawnType = 1; // 1 red, -1 blue, 0 accelerator

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);
  heatmapBuffer = createGraphics(width, height);
  heatmapBuffer.pixelDensity(1);
  noSmooth();
  heatmapBuffer.noSmooth();
  currentSeed = floor(Date.now() % 1000000000);
  spawnSizeSlider = createSlider(10, 10000, spawnMass, 10);
  spawnSizeSlider.position(20, 120);
  spawnSizeSlider.size(180);
  spawnSizeSlider.input(() => {
    spawnMass = spawnSizeSlider.value();
  });

  // Start the camera at the center of the world.
  camX = 0;
  camY = 0;

  resetSimulation(false);
}

function draw() {
  background(15, 15, 25);

  // Keep the camera still while the science panel is open.
  handleCamera();
  invalidateHeatmapIfNeeded();
  updateFpsDisplay();

  push();

  // Draw the world in camera space.
  translate(width / 2, height / 2);
  scale(zoom);
  translate(-camX, -camY);

  // Background grid helps show scale and movement.
  drawGrid();

  // Static zones affect bodies inside their area.
  drawAccelerators();

  if (showVectorField) {
    drawVectorField();
  }

  // Step the simulation in fixed chunks so motion stays stable.
  if (!paused) {
    simAccumulator += timeScale;
  }

  while (simAccumulator >= 1) {
    simulateStep();
    simAccumulator -= 1;
  }

  while (stepOnce > 0) {
    simulateStep();
    stepOnce--;
  }

  // Draw visible bodies only.
  for (let p of particles) {
    p.show(isParticleInView(p));
  }

  if (launchTarget && launchStart) {
    drawLaunchPreview();
  }

  pop();

  if (showHeatmap) {
    // Heatmap is drawn in screen space so it stays flat on the screen.
    updateHeatmapBuffer();
    tint(255, 135);
    image(heatmapBuffer, 0, 0, width, height);
    noTint();
  }

  // HUD text stays on top of the camera view.
  let redCount = 0;
  let blueCount = 0;

  // Count bodies for the HUD.
  for (let p of particles) {
    if (p.type === 1) redCount++;
    else blueCount++;
  }

  fill(255);
  noStroke();
  textSize(16);

  text(`Red: ${redCount}`, 20, 30);
  text(`Blue: ${blueCount}`, 20, 50);
  text(`Total: ${particles.length}`, 20, 70);

  text(
    `Spawn Type: ${
      spawnType === 1 ? "RED" : spawnType === -1 ? "BLUE" : "ACCELERATOR"
    }`,
    20,
    90
  );

  text(
    `${
      spawnType === 0 ? "Zone Radius" : "Spawn Size"
    }: ${spawnMass}`,
    20,
    110
  );

  text(
    `Zoom: ${zoom.toFixed(5)}`,
    20,
    160
  );

  text(
    `Camera: (${floor(camX)}, ${floor(camY)})`,
    20,
    180
  );

  text(
    `Heatmap: ${showHeatmap ? "ON" : "OFF"}`,
    20,
    200
  );

  text(
    `Vector Field: ${showVectorField ? "ON" : "OFF"}`,
    20,
    220
  );

  text(
    `Trails: ${trailLabel()}`,
    20,
    240
  );

  text(
    `Time: ${timeLabel()}`,
    20,
    260
  );

  text(
    `Seed: ${currentSeed}`,
    20,
    280
  );

  text(
    `Accelerators: ${accelerators.length}`,
    20,
    300
  );

  text(
    `FPS: ${fpsDisplay.toFixed(1)}`,
    20,
    320
  );

  if (showControls) {
    drawControlsPanel();
  }

  if (showScienceOverlay) {
    drawScienceOverlay();
  }
}

// Spawn a body with random position, mass, and sign.
function spawnRandom() {
  // Spawn bodies near the center, but not always in the same spot.
  let range = 5000;

  let x = random(-range, range);
  let y = random(-range, range);

  let m = random(50, 100);

  let type =
    random() < 0.5 ? 1 : -1;

  particles.push(
    new Particle(x, y, m, type)
  );
}

function spawnRandomAccelerator() {
  // Accelerator zones are static map features.
  let range = 5000;
  let x = random(-range, range);
  let y = random(-range, range);
  let radius = random(100, 1000);
  accelerators.push(new Accelerator(x, y, radius));
}

// spawn manually anywhere
function mousePressed() {
  if (showScienceOverlay) {
    // Let the scroll bar handle clicks before anything else.
    let layout = getScienceOverlayLayout();

    if (
      pointInRect(
        mouseX,
        mouseY,
        layout.scrollbarThumbX,
        layout.scrollbarThumbY,
        layout.scrollbarThumbW,
        layout.scrollbarThumbH
      )
    ) {
      scienceOverlayDragging = true;
      scienceOverlayDragOffset = mouseY - layout.scrollbarThumbY;
      return false;
    }

    if (pointInRect(mouseX, mouseY, layout.boxX, layout.boxY, layout.boxW, layout.boxH)) {
      return false;
    }

    return false;
  }

  if (mouseIsOverSlider()) {
    return;
  }

  let worldMouse = screenToWorld(mouseX, mouseY);

  if (spawnType === 0) {
    // In accelerator mode, place a static zone instead of a particle.
    accelerators.push(
      new Accelerator(
        worldMouse.x,
        worldMouse.y,
        constrain(spawnMass, 100, 1000)
      )
    );
    launchTarget = null;
    launchStart = null;
    launchPreview = null;
    return;
  }

  launchTarget = findParticleAt(worldMouse.x, worldMouse.y);

  if (!launchTarget) {
    // Click empty space to create a new body.
    particles.push(new Particle(worldMouse.x, worldMouse.y, spawnMass, spawnType));
    launchStart = null;
    launchPreview = null;
    return;
  }

  // Drag from a body to set its launch velocity.
  launchTarget.trail = [];
  launchStart = worldMouse.copy();
  launchPreview = worldMouse.copy();
}

function mouseWheel(event) {
  if (showScienceOverlay) {
    // The panel scrolls instead of zooming the camera.
    scienceScroll += event.delta * 0.75;
    scienceScroll = constrain(scienceScroll, 0, scienceScrollMax);
    return false;
  }

  if (event.delta > 0) {
    zoom *= 0.9;
  }

  else {
    zoom *= 1.1;
  }

  zoom = constrain(
    zoom,
    0.04,
    20
  );
  invalidateHeatmapCache();

  return false;
}

function keyPressed() {

  // Cycle the spawn tool between red, blue, and accelerator.
  if (key === 's' || key === 'S') {
    spawnType = spawnType === 1 ? -1 : spawnType === -1 ? 0 : 1;
  }

  if (key === 'x' || key === 'X') {
    // Hide the right-side menu if the screen feels crowded.
    showControls = !showControls;
  }

  if (key === 'h' || key === 'H') {
    // Turn the heatmap overlay on and off.
    showHeatmap = !showHeatmap;
    if (showHeatmap) {
      invalidateHeatmapCache();
    }
  }

  if (key === 'v' || key === 'V') {
    // Show the vector field overlay.
    showVectorField = !showVectorField;
  }

  if (key === 't' || key === 'T') {
    // Cycle trail display styles.
    trailMode = (trailMode + 1) % 3;
  }

  if (key === ' ') {
    // Pause and unpause the simulation.
    paused = !paused;
  }

  if (key === ',') {
    // Slow motion.
    paused = false;
    timeScale = 0.25;
  }

  if (key === '.') {
    // Step one frame while paused, or return to normal speed.
    if (paused) {
      stepOnce += 1;
    } else {
      timeScale = 1;
    }
  }

  if (key === '>') {
    // Fast forward.
    paused = false;
    timeScale = 4;
  }

  if (key === 'r' || key === 'R') {
    // Restart using the same seed.
    resetSimulation(false);
  }

  if (key === 'n' || key === 'N') {
    // Start a fresh random seed.
    currentSeed = floor(Date.now() % 1000000000);
    resetSimulation(true);
  }

  if (key === 'o' || key === 'O') {
    // Reset camera and zoom to the default view.
    zoom = 0.1;
    camX = 0;
    camY = 0;
    invalidateHeatmapCache();
    return false;
  }

  if (key === '!') {
    // Toggle the science explanation panel.
    showScienceOverlay = !showScienceOverlay;
    scienceOverlayDragging = false;
    if (showScienceOverlay) {
      scienceScroll = 0;
    }
    return false;
  }

  if (keyCode === ESCAPE) {
    // Clear the whole scene, including accelerator zones.
    clearParticles();
    return false;
  }
}

function mouseReleased() {
  if (scienceOverlayDragging) {
    // Stop dragging the scroll bar.
    scienceOverlayDragging = false;
    return false;
  }

  if (showScienceOverlay) {
    return false;
  }

  if (mouseIsOverSlider()) {
    return;
  }

  let worldMouse = screenToWorld(mouseX, mouseY);

  if (launchTarget && launchStart) {
    // Convert the drag distance into an initial velocity.
    let impulse = p5.Vector.sub(worldMouse, launchStart);
    let launchVelocity = impulse.mult(0.035);
    launchTarget.vel = launchVelocity;
    launchTarget = null;
    launchStart = null;
    launchPreview = null;
    return;
  }
}

function mouseDragged() {
  if (showScienceOverlay && scienceOverlayDragging) {
    // Move the scroll thumb with the mouse.
    let layout = getScienceOverlayLayout();
    let trackRange = max(1, layout.scrollbarTrackH - layout.scrollbarThumbH);
    let thumbTop = mouseY - scienceOverlayDragOffset;
    let thumbT = constrain((thumbTop - layout.scrollbarTrackY) / trackRange, 0, 1);
    scienceScroll = thumbT * scienceScrollMax;
    return false;
  }

  if (showScienceOverlay) {
    return false;
  }

  if (mouseIsOverSlider()) {
    return;
  }

  if (launchTarget) {
    launchPreview = screenToWorld(mouseX, mouseY);
  }
}

function handleCamera() {
  if (showScienceOverlay) {
    // Freeze camera movement while reading the explanation.
    return;
  }

  // Arrow keys pan the view across the world.
  let speed = 20 / zoom;

  if (keyIsDown(LEFT_ARROW)) {
    camX -= speed;
  }

  if (keyIsDown(RIGHT_ARROW)) {
    camX += speed;
  }

  if (keyIsDown(UP_ARROW)) {
    camY -= speed;
  }

  if (keyIsDown(DOWN_ARROW)) {
    camY += speed;
  }
}

function invalidateHeatmapIfNeeded() {
  if (!showHeatmap) {
    return;
  }

  if (
    lastHeatmapCamX !== camX ||
    lastHeatmapCamY !== camY ||
    lastHeatmapZoom !== zoom
  ) {
    invalidateHeatmapCache();
  }
}

function invalidateHeatmapCache() {
  heatmapFrameCounter = 0;
  heatmapBuffer.clear();
  lastHeatmapCamX = camX;
  lastHeatmapCamY = camY;
  lastHeatmapZoom = zoom;
}

// infinite-style grid
function drawGrid() {

  let gridSize = 200;

  stroke(40);
  strokeWeight(1 / zoom);

  let left =
    camX - width / 2 / zoom;

  let right =
    camX + width / 2 / zoom;

  let top =
    camY - height / 2 / zoom;

  let bottom =
    camY + height / 2 / zoom;

  for (
    let x = floor(left / gridSize) * gridSize;
    x < right;
    x += gridSize
  ) {
    line(x, top, x, bottom);
  }

  for (
    let y = floor(top / gridSize) * gridSize;
    y < bottom;
    y += gridSize
  ) {
    line(left, y, right, y);
  }

  // center axes
  stroke(80, 80, 120);

  line(0, top, 0, bottom);
  line(left, 0, right, 0);
}

function trailLabel() {
  if (trailMode === 0) return "OFF";
  if (trailMode === 1) return "SHORT";
  return "LONG";
}

function timeLabel() {
  if (paused) return "PAUSED";
  if (timeScale === 0.25) return "SLOW";
  if (timeScale === 4) return "FAST";
  return "NORMAL";
}

function screenToWorld(sx, sy) {
  return createVector(
    (sx - width / 2) / zoom + camX,
    (sy - height / 2) / zoom + camY
  );
}

function findParticleAt(x, y) {
  for (let i = particles.length - 1; i >= 0; i--) {
    let p = particles[i];
    if (dist(x, y, p.pos.x, p.pos.y) <= p.r) {
      return p;
    }
  }
  return null;
}

function drawLaunchPreview() {
  let a = launchTarget.pos;
  let b = launchPreview || screenToWorld(mouseX, mouseY);

  let v = p5.Vector.sub(b, a);
  let len = v.mag();
  if (len > 0.001) {
    let dir = v.copy().normalize();
    let headLen = constrain(len * 0.25, 16, 40);
    let shaftEnd = p5.Vector.add(b, p5.Vector.mult(dir, -headLen));

    stroke(255, 240, 180, 220);
    strokeWeight(3 / zoom);
    line(a.x, a.y, shaftEnd.x, shaftEnd.y);

    let wing = dir.copy().mult(headLen);
    let left = wing.copy().rotate(PI * 0.82).mult(0.45);
    let right = wing.copy().rotate(-PI * 0.82).mult(0.45);
    line(b.x, b.y, b.x + left.x, b.y + left.y);
    line(b.x, b.y, b.x + right.x, b.y + right.y);
  }
}

function drawControlsPanel() {
  let x = width - 280;
  let y = 20;
  let w = 260;
  let h = 360;

  noStroke();
  fill(0, 0, 0, 140);
  rect(x, y, w, h, 12);

  fill(255);
  textSize(14);
  textAlign(LEFT, TOP);

  let lines = [
    "Controls",
    "",
    "Mouse:",
    "Drag from a body to launch it",
    "Click empty space to spawn a body",
    "",
    "Keys:",
    "S - cycle red / blue / accelerator",
    "X - hide/show this menu",
    "H - heatmap overlay",
    "V - vector field overlay",
    "T - trail mode",
    "Space - pause / unpause",
    ", - slow motion",
    ". - step one frame when paused",
    "> - fast forward",
    "R - restart same seed",
    "N - new random seed",
    "O - reset view",
    "Esc - clear particles",
    "! - science overlay",
    "Wheel / drag bar - scroll science panel"
  ];

  for (let i = 0; i < lines.length; i++) {
    text(lines[i], x + 14, y + 12 + i * 18);
  }

  textAlign(LEFT, BASELINE);
}

function mouseIsOverSlider() {
  return (
    mouseX >= 15 &&
    mouseX <= 210 &&
    mouseY >= 110 &&
    mouseY <= 145
  );
}

function simulateStep() {
  // Reset all forces before calculating this frame.
  for (let p of particles) {
    p.acc.mult(0);
    p._acceleratorInside = false;
  }

  // Mark bodies that are inside an accelerator zone.
  for (let a of accelerators) {
    for (let p of particles) {
      if (a.contains(p)) {
        p._acceleratorInside = true;
        if (!p._acceleratorWasInside) {
          // Give a one-time boost when the body enters the zone.
          a.applyEffect(p);
        }
      }
    }
  }

  for (let i = 0; i < particles.length; i++) {
    for (let j = i + 1; j < particles.length; j++) {
      let a = particles[i];
      let b = particles[j];
      // Nearby zones make forces much stronger.
      let forceScale =
        a._acceleratorInside || b._acceleratorInside ? 20 : 1;
      let force = a.calculateForce(b, forceScale);
      a.applyForce(force);
      b.applyForce(p5.Vector.mult(force, -1));
    }
  }

  // Merge bodies that overlap.
  let toRemove = new Set();
  let toAdd = [];

  for (let i = 0; i < particles.length; i++) {
    for (let j = i + 1; j < particles.length; j++) {
      if (toRemove.has(i) || toRemove.has(j)) continue;

      let a = particles[i];
      let b = particles[j];
      let d = p5.Vector.dist(a.pos, b.pos);

      if (d < a.r + b.r) {
        let merged = mergeParticles(a, b);
        toRemove.add(i);
        toRemove.add(j);
        if (merged) {
          toAdd.push(merged);
        }
      }
    }
  }

  particles = particles.filter((_, i) => !toRemove.has(i));
  particles.push(...toAdd);

  for (let p of particles) {
    p.update();
    p._acceleratorWasInside = p._acceleratorInside;
  }
}

function isParticleInView(p) {
  let b = worldBounds();
  return (
    p.pos.x + p.r >= b.left &&
    p.pos.x - p.r <= b.right &&
    p.pos.y + p.r >= b.top &&
    p.pos.y - p.r <= b.bottom
  );
}

function clearParticles() {
  // Remove every body and every static zone.
  particles = [];
  accelerators = [];
  launchTarget = null;
  launchStart = null;
  launchPreview = null;
}

function resetSimulation(reseed) {
  // Rebuild the whole scene from the current seed.
  if (reseed) {
    randomSeed(currentSeed);
    noiseSeed(currentSeed);
  } else {
    randomSeed(currentSeed);
    noiseSeed(currentSeed);
  }

  particles = [];
  accelerators = [];
  paused = false;
  timeScale = 1;
  simAccumulator = 0;
  stepOnce = 0;
  launchTarget = null;
  launchStart = null;
  launchPreview = null;

  for (let i = 0; i < num; i++) {
    spawnRandom();
  }

  for (let i = 0; i < 5; i++) {
    spawnRandomAccelerator();
  }
}

function mergeParticles(a, b) {
  let survivor = null;

  if (a.type === b.type) {
    survivor = a.mass >= b.mass ? a : b;
  } else {
    survivor = a.mass >= b.mass ? a : b;
  }

  let newPos = p5.Vector.add(
    p5.Vector.mult(a.pos, a.mass),
    p5.Vector.mult(b.pos, b.mass)
  ).div(a.mass + b.mass);

  let totalMomentum = p5.Vector.add(
    p5.Vector.mult(a.vel, a.mass),
    p5.Vector.mult(b.vel, b.mass)
  );

  // Keep the net signed charge from both bodies.
  let netCharge =
    a.type * a.mass + b.type * b.mass;

  let newMass;
  let newType = netCharge >= 0 ? 1 : -1;

  if (a.type === b.type) {
    newMass = a.mass + b.mass;
  } else {
    // Opposite types partially cancel when they merge.
    newMass = abs(a.mass - b.mass);
  }

  if (newMass < 1) {
    return null;
  }

  // New body uses combined momentum and mass.
  let merged = new Particle(
    newPos.x,
    newPos.y,
    newMass,
    newType
  );

  merged.vel = totalMomentum.div(newMass);
  merged.charge = netCharge;
  merged.trail = survivor.trail.slice();
  merged.trail.push(newPos.copy());

  return merged;
}

function worldBounds() {
  // Convert the current camera to world-space edges.
  return {
    left: camX - width / 2 / zoom,
    right: camX + width / 2 / zoom,
    top: camY - height / 2 / zoom,
    bottom: camY + height / 2 / zoom
  };
}

function netFieldAt(x, y) {
  // Sum the field contribution from every particle.
  let probe = createVector(x, y);
  let net = createVector(0, 0);

  for (let p of particles) {
    let diff = p5.Vector.sub(p.pos, probe);
    let d = constrain(diff.mag(), 20, 3500);
    diff.normalize();

    let strength =
      (p.mass * p.type) / (d * d);

    net.add(diff.mult(strength));
  }

  return net;
}

function drawVectorField() {
  // Draw a coarse arrow grid that points along the net force.
  let b = worldBounds();
  let step = 56 / zoom;

  let startX =
    floor(b.left / step) * step;

  let startY =
    floor(b.top / step) * step;

  stroke(220, 230, 255, 160);
  strokeWeight(1 / zoom);

  for (let x = startX; x < b.right; x += step) {
    for (let y = startY; y < b.bottom; y += step) {
      // Sample the net field at each grid point.
      let field = netFieldAt(x, y);
      let mag = field.mag();

      if (mag < 0.0002) continue;

      let arrowLen = map(mag, 0, 0.03, 10, 70, true);
      let dir = field.copy().normalize().mult(arrowLen);
      let end = p5.Vector.add(createVector(x, y), dir);

      line(x, y, end.x, end.y);

      let head = dir.copy().normalize().mult(8);
      let left = head.copy().rotate(PI * 0.75);
      let right = head.copy().rotate(-PI * 0.75);

      line(end.x, end.y, end.x + left.x, end.y + left.y);
      line(end.x, end.y, end.x + right.x, end.y + right.y);
    }
  }
}

function drawAccelerators() {
  // Draw every static accelerator zone.
  for (let a of accelerators) {
    a.show();
  }
}

function drawScienceOverlay() {
  // Draw a centered panel with its own scrollable text area.
  let boxW = min(860, width * 0.82);
  let boxH = min(620, height * 0.76);
  let boxX = (width - boxW) / 2;
  let boxY = (height - boxH) / 2;
  let pad = 24;
  let titleY = boxY + 22;
  let contentX = boxX + pad;
  let contentY = boxY + 64;
  let contentW = boxW - pad * 2 - 18;
  let contentH = boxH - 92;

  noStroke();
  fill(6, 8, 14, 232);
  rect(boxX, boxY, boxW, boxH, 18);

  fill(255);
  textAlign(LEFT, TOP);
  textSize(18);
  text("Science Lens: Gravitational and Electromagnetic Fields", contentX, titleY);

  textSize(15);
  textLeading(22);
  let body =
    "This simulation is built around a simplified N-body model. Each moving body has mass, position, velocity, and a signed type that simulates electric charge.\n\n" +
    "Red and blue bodies use inverse-square forces, so the effect gets much stronger when two bodies are closer together and weaker as distance increases.\n\n" +
    "For a pair of bodies, the force is modelled like this:\n" +
    "F = k * (m1 * m2) / r^2\n\n" +
    "For the electromagnetic interaction, the sign matters. Like signs repel and opposite signs attract. Gravity remains an attractive force, while the electromagnetic force changes direction based on the sign of the bodies.\n\n" +
    "The simulation adds up every pairwise force to get the total force on each body:\n" +
    "Ftotal = sum(Fpair)\n\n" +
    "Then the motion is updated with Newton's second law:\n" +
    "a = F / m\n\n" +
    "A larger mass accelerates slower with the same amount of force, so heavy bodies move more slowly to the same force.\n\n" +
    "When two bodies collide, the particle formed obeys the law of conservation of momentum. Momentum is mass times velocity:\n" +
    "p = mv\n\n" +
    "The combined velocity is based on the total momentum before the collision:\n" +
    "pbefore = pafter\n\n" +
    "That is why the system keeps moving after merges instead of stopping dead. The merged body's size and type are determined by the charges of the 2 particles, but its motion inherits the previous momentum.\n\n" +
    "Accelerator zones are stationary environment regions. They do not move, but they alter the physics inside their bounds. When a body enters one, its momentum is boosted, and the inverse-square forces inside the zone are multiplied so the body reacts much more strongly to nearby fields.\n\n" +
    "The heatmap splits the on-screen area into small squares and ranks them from the strongest positive to the strongest negative charges, and the vector field shows the direction of the net force across the screen. Trails are drawn as meteor-like streaks so you can read motion over time.\n\n" +
    "Overall, this is a simplified physics model rather than a perfect real-world simulation, but it still communicates the core ideas of forces, fields and momentum.";

  let wrappedLines = wrapScienceText(body, contentW);
  let lineHeight = 22;
  let contentHeight = wrappedLines.length * lineHeight;
  scienceScrollMax = max(0, contentHeight - contentH);
  scienceScroll = constrain(scienceScroll, 0, scienceScrollMax);

  drawingContext.save();
  drawingContext.beginPath();
  drawingContext.rect(contentX, contentY, contentW, contentH);
  drawingContext.clip();

  fill(235);
  let y = contentY - scienceScroll;
  for (let line of wrappedLines) {
    text(line, contentX, y);
    y += lineHeight;
  }

  drawingContext.restore();

  let trackX = boxX + boxW - 14;
  let trackY = contentY;
  let trackH = contentH;
  let thumbMinH = 36;
  let thumbH = scienceScrollMax > 0
    ? max(thumbMinH, trackH * (contentH / (contentH + scienceScrollMax)))
    : trackH;
  thumbH = min(thumbH, trackH);
  let thumbT = scienceScrollMax > 0 ? scienceScroll / scienceScrollMax : 0;
  let thumbY = trackY + thumbT * max(0, trackH - thumbH);

  noStroke();
  fill(255, 255, 255, 22);
  rect(trackX, trackY, 6, trackH, 4);
  fill(255, 255, 255, 145);
  rect(trackX, thumbY, 6, thumbH, 4);

  scienceOverlayLayoutCache = {
    boxX,
    boxY,
    boxW,
    boxH,
    scrollbarThumbX: trackX - 4,
    scrollbarThumbY: thumbY,
    scrollbarThumbW: 14,
    scrollbarThumbH: thumbH,
    scrollbarTrackY: trackY,
    scrollbarTrackH: trackH
  };

  textAlign(LEFT, BASELINE);
}

function getScienceOverlayLayout() {
  // Reuse the last layout while the panel is open.
  if (scienceOverlayLayoutCache) {
    return scienceOverlayLayoutCache;
  }

  let boxW = min(860, width * 0.82);
  let boxH = min(620, height * 0.76);
  let boxX = (width - boxW) / 2;
  let boxY = (height - boxH) / 2;
  let contentY = boxY + 64;
  let contentH = boxH - 92;
  let trackX = boxX + boxW - 14;

  return {
    boxX,
    boxY,
    boxW,
    boxH,
    scrollbarThumbX: trackX - 4,
    scrollbarThumbY: contentY,
    scrollbarThumbW: 14,
    scrollbarThumbH: contentH,
    scrollbarTrackY: contentY,
    scrollbarTrackH: contentH
  };
}

function pointInRect(px, py, x, y, w, h) {
  // Simple hit test for panel controls.
  return px >= x && px <= x + w && py >= y && py <= y + h;
}

function wrapScienceText(textBlock, maxWidth) {
  // Break the explanation into lines that fit the panel width.
  let paragraphs = textBlock.split("\n\n");
  let lines = [];

  for (let paragraph of paragraphs) {
    let rawLines = paragraph.split("\n");

    for (let rawLine of rawLines) {
      if (rawLine === "") {
        lines.push("");
        continue;
      }

      let words = rawLine.split(" ");
      let current = "";

      for (let word of words) {
        let candidate = current ? current + " " + word : word;
        if (textWidth(candidate) <= maxWidth) {
          current = candidate;
        } else {
          if (current) {
            lines.push(current);
          }
          current = word;
        }
      }

      if (current) {
        lines.push(current);
      }
    }

    lines.push("");
  }

  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }

  return lines;
}

function fieldPotentialAt(x, y) {
  // Measure the signed field strength at a point.
  let sum = 0;
  let probe = createVector(x, y);

  for (let p of particles) {
    let d = constrain(
      p5.Vector.dist(p.pos, probe),
      25,
      5000
    );

    sum += (p.type * p.mass) / d;
  }

  return sum;
}

function updateHeatmapBuffer() {
  if (heatmapFrameCounter > 0) {
    heatmapFrameCounter--;
    return;
  }

  // Rebuild the visible heatmap in batches so it stays lighter.
  heatmapFrameCounter = heatmapFrameSkip;
  heatmapBuffer.clear();
  heatmapBuffer.noStroke();

  let cells = [];
  let minValue = Infinity;
  let maxValue = -Infinity;
  let b = worldBounds();
  let worldCell = heatmapCellSize / zoom;
  let startX = floor(b.left / worldCell) * worldCell;
  let startY = floor(b.top / worldCell) * worldCell;

  for (let wx = startX; wx < b.right; wx += worldCell) {
    for (let wy = startY; wy < b.bottom; wy += worldCell) {
      let sx = round((wx - camX) * zoom + width / 2);
      let sy = round((wy - camY) * zoom + height / 2);

      let value = fieldPotentialAt(wx, wy);
      cells.push({ sx, sy, value });
      minValue = min(minValue, value);
      maxValue = max(maxValue, value);
    }
  }

  if (!isFinite(minValue) || !isFinite(maxValue)) {
    return;
  }

  // Sort cells so the coldest and hottest areas can be colored cleanly.
  cells.sort((a, b) => a.value - b.value);
  let n = cells.length;
  let lowBand = max(1, floor(n * 0.2));
  let highBandStart = max(0, ceil(n * 0.8));

  // Only the lowest 20% and highest 20% are painted.
  for (let i = 0; i < n; i++) {
    let cell = cells[i];

    if (i < lowBand) {
      let t = lowBand > 1 ? i / (lowBand - 1) : 0;
      let a = lerp(25, 95, t);
      heatmapBuffer.fill(0, 0, 255, a);
      heatmapBuffer.rect(
        cell.sx,
        cell.sy,
        heatmapCellSize,
        heatmapCellSize
      );
    }

    if (i >= highBandStart) {
      let bandCount = max(1, n - highBandStart);
      let t = bandCount > 1 ? (i - highBandStart) / (bandCount - 1) : 0;
      let a = lerp(25, 95, t);
      heatmapBuffer.fill(255, 0, 0, a);
      heatmapBuffer.rect(
        cell.sx,
        cell.sy,
        heatmapCellSize,
        heatmapCellSize
      );
    }
  }
}

function updateFpsDisplay() {
  let now = millis();

  if (lastFpsSampleMs === 0 || now - lastFpsSampleMs >= 500) {
    fpsDisplay = frameRate();
    lastFpsSampleMs = now;
  }
}

function windowResized() {
  // Rebuild the off-screen buffer when the canvas size changes.
  resizeCanvas(windowWidth, windowHeight);
  heatmapBuffer = createGraphics(width, height);
  heatmapBuffer.pixelDensity(1);
  heatmapBuffer.noSmooth();
  scienceOverlayLayoutCache = null;
  invalidateHeatmapCache();
}
