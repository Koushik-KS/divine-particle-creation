/**
 * Krishna neon particle drawing engine.
 *
 * Samples the target artwork at (near) device-pixel resolution so the particle
 * cloud reproduces the *actual* linework — face, eyes, crown, peacock feather,
 * flute, fingers, jewellery, dhoti folds — instead of a generic silhouette.
 * Particles fly in from scattered positions and lock into a stable, sharp
 * luminous artwork at ~12.8s.
 */

type Particle = {
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  c: number; // palette index
  size: number;
  delay: number;
  dur: number;
  ph: number;
};

const MAX_PARTICLES = 42000;
const LOCK = 12.8; // seconds — particles stop moving
const SAMPLE_MAX = 900; // max sampling width in device px

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/** brightness ladder: hot white highlights -> gold body -> deep amber detail */
const PALETTE: [number, number, number][] = [
  [255, 252, 240],
  [255, 240, 200],
  [255, 216, 130],
  [255, 190, 80],
  [230, 155, 50],
  [180, 115, 35],
];
const ALPHA_STEPS = 10;

export class KrishnaEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private img: HTMLImageElement | null = null;
  private particles: Particle[] = [];
  private buckets: number[][] = [];
  private raf = 0;
  private start = 0;
  private dpr = 1;
  private cx = 0;
  private cy = 0;
  private figureH = 0;
  private figureW = 0;
  private underlay: HTMLCanvasElement | null = null;
  private destroyed = false;
  private ro: ResizeObserver | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    for (let i = 0; i < PALETTE.length * ALPHA_STEPS; i++) this.buckets.push([]);
  }

  async init(src: string) {
    const img = await loadImage(src);
    if (this.destroyed) return;
    this.img = img;
    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.canvas.parentElement ?? document.body);
    this.replay();
  }

  private resize() {
    if (!this.img) return;
    const parent = this.canvas.parentElement;
    const w = parent?.clientWidth || window.innerWidth;
    const h = parent?.clientHeight || window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.cx = this.canvas.width / 2;
    this.cy = this.canvas.height / 2;

    const targetH = h * (w < 640 ? 0.74 : 0.8) * this.dpr;
    const targetW = (targetH * this.img.width) / this.img.height;
    const maxW = this.canvas.width * 0.92;
    const scale = targetW > maxW ? maxW / targetW : 1;
    this.figureH = targetH * scale;
    this.figureW = targetW * scale;
    this.buildUnderlay(this.figureW, this.figureH);
    this.sample(this.figureW, this.figureH);
  }

  /** Very faint, slightly soft copy of the artwork sitting *under* the particle
   *  layer so there are no dead black gaps. Kept dim — the particles are the art. */
  private buildUnderlay(w: number, h: number) {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.floor(w));
    c.height = Math.max(1, Math.floor(h));
    const cx = c.getContext("2d")!;
    cx.filter = `blur(${Math.max(0.6, h * 0.0018)}px)`;
    cx.drawImage(this.img!, 0, 0, c.width, c.height);
    this.underlay = c;
  }

  private sample(w: number, h: number) {
    const img = this.img!;
    const off = document.createElement("canvas");
    // 1 sample ≈ 1 device pixel of the rendered figure => real detail preserved
    const sw = Math.max(360, Math.min(SAMPLE_MAX, Math.floor(w)));
    const sh = Math.max(1, Math.floor((sw * img.height) / img.width));
    off.width = sw;
    off.height = sh;
    const octx = off.getContext("2d", { willReadFrequently: true })!;
    octx.drawImage(img, 0, 0, sw, sh);
    const data = octx.getImageData(0, 0, sw, sh).data;

    const px = w / sw;
    const py = h / sh;
    const left = this.cx - w / 2;
    const top = this.cy - h / 2;
    const diag = Math.hypot(this.canvas.width, this.canvas.height);
    const d = this.dpr;

    type Cand = { i: number; x: number; y: number; lum: number; imp: number };
    const cands: Cand[] = [];

    for (let y = 0; y < sh; y++) {
      const v = y / sh;
      // face / crown / peacock-feather band gets the highest priority
      const face = v > 0.08 && v < 0.3;
      for (let x = 0; x < sw; x++) {
        const i = (y * sw + x) * 4;
        const r = data[i]!;
        const g = data[i + 1]!;
        const b = data[i + 2]!;
        const lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
        if (lum < 0.085) continue;
        cands.push({ i, x, y, lum, imp: lum + (face ? 0.9 : 0) });
      }
    }

    // keep the most meaningful pixels first — never a random cloud
    if (cands.length > MAX_PARTICLES) {
      cands.sort((a, b) => b.imp - a.imp);
      cands.length = MAX_PARTICLES;
    }

    const out: Particle[] = new Array(cands.length);
    for (let k = 0; k < cands.length; k++) {
      const cd = cands[k]!;
      const v = cd.y / sh;
      const face = v > 0.08 && v < 0.3;
      const lum = cd.lum;

      // palette index from brightness
      let c = 5;
      if (lum > 0.85) c = 0;
      else if (lum > 0.65) c = 1;
      else if (lum > 0.45) c = 2;
      else if (lum > 0.3) c = 3;
      else if (lum > 0.17) c = 4;

      const structural = cd.x % 4 === 0 && cd.y % 4 === 0;
      let delay: number;
      if (structural) delay = 0.3 + Math.random() * 3.4; // 0-7s: body structure
      else if (face) delay = 6.2 + Math.random() * 3.0; // 7-10s: face/crown/flute
      else delay = 7.4 + Math.random() * 3.6; // 10-12s: fine detail densifies

      const ang = Math.random() * Math.PI * 2;
      const rad = diag * (0.22 + Math.random() * 0.7);

      out[k] = {
        sx: this.cx + Math.cos(ang) * rad,
        sy: this.cy + Math.sin(ang) * rad,
        tx: left + (cd.x + 0.5) * px,
        ty: top + (cd.y + 0.5) * py,
        c,
        size: (face ? 0.55 + lum * 0.5 : 0.7 + lum * 0.8) * d,
        delay,
        dur: 1.5 + Math.random() * 1.6,
        ph: Math.random() * Math.PI * 2,
      };
    }
    this.particles = out;
  }

  replay() {
    this.start = performance.now();
    if (!this.raf) this.loop();
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const t = (performance.now() - this.start) / 1000;
    this.draw(t);
  };

  private draw(t: number) {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;

    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, W, H);

    // golden aura BEHIND the figure — restrained so it never washes out detail
    const auraP = clamp01((t - 9) / 3.5);
    if (auraP > 0) {
      const R = this.figureH * 0.72;
      const grad = ctx.createRadialGradient(this.cx, this.cy, R * 0.3, this.cx, this.cy, R);
      const a = auraP * 0.3 * (1 + Math.sin(t * 1.1) * 0.05);
      grad.addColorStop(0, `rgba(255,190,80,${a * 0.22})`);
      grad.addColorStop(0.55, `rgba(255,150,40,${a * 0.16})`);
      grad.addColorStop(0.85, `rgba(160,60,180,${a * 0.08})`);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    }

    ctx.globalCompositeOperation = "lighter";

    // subtle continuous glow under the particles (fills micro-gaps only)
    const under = clamp01((t - 8) / 4) * 0.16;
    if (this.underlay && under > 0.004) {
      ctx.globalAlpha = under;
      ctx.drawImage(
        this.underlay,
        this.cx - this.figureW / 2,
        this.cy - this.figureH / 2,
        this.figureW,
        this.figureH,
      );
      ctx.globalAlpha = 1;
    }

    const sharpen = clamp01((t - 10) / 2.8);
    const gain = 0.55 + sharpen * 0.45;
    const locked = t >= LOCK;

    const buckets = this.buckets;
    for (let i = 0; i < buckets.length; i++) buckets[i]!.length = 0;

    const ps = this.particles;
    const xs: number[] = [];
    const ys: number[] = [];
    const ss: number[] = [];

    for (let i = 0; i < ps.length; i++) {
      const p = ps[i]!;
      const local = (t - p.delay) / p.dur;
      if (local <= 0) continue;
      const e = easeOutCubic(clamp01(local));

      let x: number;
      let y: number;
      if (locked || e >= 1) {
        // locked: exact position, no drift — only brightness twinkles
        x = p.tx;
        y = p.ty;
      } else {
        x = p.sx + (p.tx - p.sx) * e;
        y = p.sy + (p.ty - p.sy) * e;
      }

      const tw = locked ? 0.92 + 0.08 * Math.sin(t * 2.1 + p.ph) : 0.8 + 0.2 * Math.sin(t * 2.6 + p.ph);
      const alpha = clamp01((e * 0.4 + e * e * 0.9) * tw * gain);
      if (alpha <= 0.02) continue;

      const ai = Math.min(ALPHA_STEPS - 1, (alpha * ALPHA_STEPS) | 0);
      const s = p.size * (0.75 + e * 0.45);
      const idx = xs.length;
      xs.push(x - s * 0.5);
      ys.push(y - s * 0.5);
      ss.push(s);
      buckets[p.c * ALPHA_STEPS + ai]!.push(idx);
    }

    for (let b = 0; b < buckets.length; b++) {
      const list = buckets[b]!;
      if (!list.length) continue;
      const col = PALETTE[(b / ALPHA_STEPS) | 0]!;
      const a = ((b % ALPHA_STEPS) + 0.5) / ALPHA_STEPS;
      ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${a})`;
      ctx.beginPath();
      for (let k = 0; k < list.length; k++) {
        const j = list[k]!;
        ctx.rect(xs[j]!, ys[j]!, ss[j]!, ss[j]!);
      }
      ctx.fill();
    }
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.ro?.disconnect();
  }
}

function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
