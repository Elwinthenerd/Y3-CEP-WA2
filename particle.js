class Particle {

  constructor(x, y, m, type) {

    // Store position, motion, and body type.
    this.pos =
      createVector(x, y);

    this.vel =
      p5.Vector.random2D()
      .mult(0.5);

    this.acc =
      createVector(0, 0);

    this.mass = m;

    this.type = type;
    this.charge = this.type * this.mass;

    // Radius is tied to mass so bigger bodies look heavier.
    this.r = 0;
    this.recalculateSize();

    // Keep a short history so we can draw a trail.
    this.trail = [];
  }

  recalculateSize() {
    // Bigger mass means a bigger drawn body.
    this.r =
      sqrt(this.mass) * 2;
  }

  calculateForce(other, scale = 1) {

    // Force points from this body toward the other body.
    let force =
      p5.Vector.sub(
        other.pos,
        this.pos
      );

    let distance =
      force.mag();

    distance =
      constrain(distance, 5, 3000);

    force.normalize();

    // Signed bodies attract or repel each other.
    let G_em = 1;

    let interaction =
      this.type * other.type;

    let emStrength =
      (G_em *
        this.mass *
        other.mass) /
      (distance * distance);

    let emForce =
      emStrength *
      -interaction;

    // Gravity always pulls bodies together.
    let G_grav = 0.08;

    let gravForce =
      (G_grav *
        this.mass *
        other.mass) /
      (distance * distance);

    force.mult(
      (emForce + gravForce) * scale
    );

    // Return one net force for this pair of bodies.
    return force;
  }

  applyForce(force) {

    // Convert force into acceleration using F = ma.
    let f =
      p5.Vector.div(
        force,
        this.mass
      );

    this.acc.add(f);
  }

  update() {

    // Integrate motion one frame at a time.
    this.vel.add(this.acc);

    this.vel.limit(8);

    this.vel.mult(0.999);

    this.pos.add(this.vel);

    // Save the current position for trail drawing.
    this.trail.push(this.pos.copy());

    if (this.trail.length > 400) {
      this.trail.shift();
    }

    // The world wraps only visually, so bodies can drift forever.

    this.acc.mult(0);
  }

  show(showTrailEnabled = true) {
    // Skip the trail if that overlay mode is off.
    if (trailMode > 0 && showTrailEnabled) {
      this.showTrail();
    }

    // Draw the main body on top of the trail.
    stroke(255, 120);

    strokeWeight(1);

    if (this.type === 1) {

      fill(
        255,
        80,
        80,
        160
      );
    }

    else {

      fill(
        80,
        120,
        255,
        160
      );
    }

    ellipse(
      this.pos.x,
      this.pos.y,
      this.r * 2
    );
  }

  showTrail() {
    // Draw a thick meteor-style trail that fades toward the tail.
    let maxLen =
      trailMode === 1 ? 60 : 100;

    let start =
      max(0, this.trail.length - maxLen);

    let points =
      this.trail.slice(start);

    if (points.length < 2) {
      return;
    }

    // The head of the trail is closest to the body.
    let headWidth = this.r * 2;
    let tailWidth = max(0.35, this.r * 0.03);

    strokeCap(ROUND);
    strokeJoin(ROUND);

    for (let i = 1; i < points.length; i++) {
      let p0 = points[i - 1];
      let p1 = points[i];
      let t = i / (points.length - 1);
      // Wider strokes near the body, thinner strokes farther back.
      let w = lerp(tailWidth, headWidth, t);
      let alpha = lerp(25, 90, t);

      if (this.type === 1) {
        stroke(255, 90, 90, alpha);
      } else {
        stroke(90, 140, 255, alpha);
      }

      strokeWeight(w);
      line(p0.x, p0.y, p1.x, p1.y);
    }

    noStroke();
    // Draw the bright body again so it sits on top of the trail.
    if (this.type === 1) {
      fill(255, 110, 110, 190);
    } else {
      fill(110, 160, 255, 190);
    }

    ellipse(this.pos.x, this.pos.y, headWidth);
  }
}

class Accelerator {
  constructor(x, y, radius) {
    // Accelerator zones do not move.
    this.pos = createVector(x, y);
    this.radius = radius;
  }

  contains(body) {
    // Check whether a body is inside the zone.
    return dist(
      body.pos.x,
      body.pos.y,
      this.pos.x,
      this.pos.y
    ) <= this.radius;
  }

  applyEffect(body) {
    // Give the body a big momentum boost.
    body.vel.mult(10);
  }

  show() {
    // Draw the zone with a strong green outline.
    noFill();
    stroke(80, 255, 140, 120);
    strokeWeight(8);
    ellipse(this.pos.x, this.pos.y, this.radius * 2);

    stroke(80, 255, 140, 220);
    strokeWeight(3);
    ellipse(this.pos.x, this.pos.y, this.radius * 2 - 8);
  }
}
