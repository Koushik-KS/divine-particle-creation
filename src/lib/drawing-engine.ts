/**
 * Krishna neon particle drawing engine.
 * Samples bright pixels from the target artwork and animates particles
 * from scattered positions into the figure over a ~13s cinematic timeline.
 */

type Particle = {
  x: number;
  y: number;
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  r: number;
  g: number;
  b: number;
  size: number;
  delay: number;
  dur: number;
  ph: number;
  amp: number;
};

const MAX_PARTICLES = 22000;
const FORM_END = 12.5; // seconds

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

export class KrishnaEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private img: HTMLImageElement | null = null;
  private particles: Particle[] = [];
  private raf = 0;
  private start = 0;
  private dpr = 1;
  private cx = 0;
  private cy = 0;
  private figureH = 0;
  private destroyed = false;
  private ro: ResizeObserver | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false })!;
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

    const targetH = h * (w < 640 ? 0.68 : 0.74) * this.dpr;
    const targetW = (targetH * this.img.width) / this.img.height;
    const maxW = this.canvas.width * 0.92;
    const scale = targetW > maxW ? maxW / targetW : 1;
    this.figureH = targetH * scale;
    this.sample(targetW * scale, targetH * scale);
  }

  private sample(w: number, h: number) {
    const img = this.img!;
    const off = document.createElement("canvas");
    // sample resolution: enough detail without heavy cost
    const sw = Math.min(440, Math.floor(w));
    const sh = Math.floor((sw * img.height) / img.width);
    off.width = sw;
    off.height = sh;
    const octx = off.getContext("2d", { willReadFrequently: true })!;
    octx.drawImage(img, 0, 0, sw, sh);
    const data = octx.getImageData(0, 0, sw, sh).data;

    const px = w / sw;
    const py = h / sh;
    const left = this.cx - w / 2;
    const top = this.cy - h / 2;

    const found: Particle[] = [];
    const diag = Math.hypot(this.canvas.width, this.canvas.height);

    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const i = (y * sw + x) * 4;
        const r = data[i]!;
        const g = data[i + 1]!;
        const b = data[i + 2]!;
        const lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
        if (lum < 0.22) continue;
        if (Math.random() > Math.min(1, 0.2 + lum * 0.6)) continue;

        const tx = left + (x + Math.random()) * px;
        const ty = top + (y + Math.random()) * py;
        const ang = Math.random() * Math.PI * 2;
        const rad = diag * (0.25 + Math.random() * 0.7);

        // progressive reveal: crown/face first, then body, then edges
        const vertical = y / sh;
        const delay = 0.8 + vertical * 6.2 + Math.random() * 3.4;

        found.push({
          x: this.cx + Math.cos(ang) * rad,
          y: this.cy + Math.sin(ang) * rad,
          sx: this.cx + Math.cos(ang) * rad,
          sy: this.cy + Math.sin(ang) * rad,
          tx,
          ty,
          r,
          g,
          b,
          size: (0.28 + lum * 0.7 + Math.random() * 0.35) * this.dpr,
          delay,
          dur: 2.2 + Math.random() * 2.6,
          ph: Math.random() * Math.PI * 2,
          amp: (0.6 + Math.random() * 1.8) * this.dpr,
        });
      }
    }

    // cap
    if (found.length > MAX_PARTICLES) {
      for (let i = found.length - 1; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0;
        [found[i], found[j]] = [found[j]!, found[i]!];
      }
      found.length = MAX_PARTICLES;
    }
    this.particles = found;
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

    // golden aura, ramps in late
    const auraP = clamp01((t - 7.5) / 4.5);
    if (auraP > 0) {
      const R = this.figureH * 0.62;
      const grad = ctx.createRadialGradient(this.cx, this.cy, R * 0.15, this.cx, this.cy, R);
      const pulse = 1 + Math.sin(t * 1.1) * 0.06;
      const a = auraP * 0.42 * pulse;
      grad.addColorStop(0, `rgba(255,200,80,${a * 0.55})`);
      grad.addColorStop(0.45, `rgba(255,160,40,${a * 0.28})`);
      grad.addColorStop(0.78, `rgba(190,70,190,${a * 0.14})`);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    }

    ctx.globalCompositeOperation = "lighter";

    const glowBoost = 0.2 + clamp01((t - 10.5) / 2.5) * 0.16;
    const settled = t > FORM_END;

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i]!;
      const local = (t - p.delay) / p.dur;
      if (local <= 0) continue;
      const e = easeOutCubic(clamp01(local));

      let x = p.sx + (p.tx - p.sx) * e;
      let y = p.sy + (p.ty - p.sy) * e;

      if (settled || e >= 1) {
        // subtle twinkle / drift once settled
        x = p.tx + Math.sin(t * 0.9 + p.ph) * p.amp;
        y = p.ty + Math.cos(t * 0.7 + p.ph * 1.3) * p.amp;
      }

      const tw = 0.75 + 0.25 * Math.sin(t * 2.4 + p.ph);
      const alpha = clamp01(e * 0.35 + e * e * 0.75) * tw * glowBoost;
      if (alpha <= 0.01) continue;

      const s = p.size * (0.7 + e * 0.5);
      ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${Math.min(1, alpha)})`;
      ctx.beginPath();
      ctx.arc(x, y, s, 0, Math.PI * 2);
      ctx.fill();

      // sparse halo for the brightest particles
      if (p.size > 0.95 * this.dpr && (i & 15) === 0) {
        ctx.fillStyle = `rgba(${p.r},${Math.min(255, p.g + 30)},${p.b},${Math.min(0.05, alpha * 0.09)})`;
        ctx.beginPath();
        ctx.arc(x, y, s * 4.2, 0, Math.PI * 2);
        ctx.fill();
      }
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
