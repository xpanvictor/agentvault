import { useEffect, useRef } from 'react';

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  r: number;
  hub: boolean;
  phase: number;
  hue: number; // 0=cyan, 1=purple
}

interface Pulse {
  ax: number; ay: number;
  bx: number; by: number;
  t: number;
  speed: number;
  color: string;
}

const N         = 72;
const HUB_N     = 10;
const MAX_DIST  = 175;
const ATTRACT_R = 150;

export function NetworkBackground() {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const mouse      = useRef({ x: -9999, y: -9999 });
  const raf        = useRef<number>(0);
  const particles  = useRef<Particle[]>([]);
  const pulses     = useRef<Pulse[]>([]);
  const frame      = useRef(0);
  const scanY      = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    particles.current = Array.from({ length: N }, (_, i) => ({
      x:     Math.random() * window.innerWidth,
      y:     Math.random() * window.innerHeight,
      vx:    (Math.random() - 0.5) * (i < HUB_N ? 0.18 : 0.30),
      vy:    (Math.random() - 0.5) * (i < HUB_N ? 0.18 : 0.30),
      r:     i < HUB_N ? 3.5 + Math.random() * 2 : 1.4 + Math.random() * 0.8,
      hub:   i < HUB_N,
      phase: Math.random() * Math.PI * 2,
      hue:   Math.random() > 0.72 ? 1 : 0,
    }));

    const onMouseMove = (e: MouseEvent) => {
      mouse.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('mousemove', onMouseMove);

    const draw = () => {
      frame.current++;
      const f = frame.current;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const pts = particles.current;
      const t   = f * 0.012;

      // ── Horizontal scan line ──────────────────────────────
      scanY.current = (scanY.current + 0.5) % canvas.height;
      const sg = ctx.createLinearGradient(0, scanY.current - 60, 0, scanY.current + 3);
      sg.addColorStop(0, 'rgba(0,229,255,0)');
      sg.addColorStop(0.7, 'rgba(0,229,255,0.025)');
      sg.addColorStop(1,   'rgba(0,229,255,0.07)');
      ctx.fillStyle = sg;
      ctx.fillRect(0, scanY.current - 60, canvas.width, 63);
      // bright leading edge
      ctx.fillStyle = 'rgba(0,229,255,0.09)';
      ctx.fillRect(0, scanY.current, canvas.width, 1);

      // ── Move particles ────────────────────────────────────
      for (const p of pts) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width)  p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

        const dx = p.x - mouse.current.x;
        const dy = p.y - mouse.current.y;
        const d  = Math.sqrt(dx * dx + dy * dy);
        if (d < ATTRACT_R && d > 1) {
          const f2 = ((ATTRACT_R - d) / ATTRACT_R) * 0.55;
          if (p.hub) {
            // hubs drift toward cursor
            p.x -= (dx / d) * f2 * 0.45;
            p.y -= (dy / d) * f2 * 0.45;
          } else {
            // edges scatter away
            p.x += (dx / d) * f2 * 0.35;
            p.y += (dy / d) * f2 * 0.35;
          }
        }
      }

      // ── Connections ───────────────────────────────────────
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[i].x - pts[j].x;
          const dy = pts[i].y - pts[j].y;
          const d  = Math.sqrt(dx * dx + dy * dy);
          if (d >= MAX_DIST) continue;

          const strength = 1 - d / MAX_DIST;
          const isHub    = pts[i].hub || pts[j].hub;
          const isCyan   = pts[i].hue === 0 && pts[j].hue === 0;
          const rgb      = isCyan ? '0,229,255' : '168,85,247';
          const alpha    = strength * (isHub ? 0.32 : 0.14);

          ctx.beginPath();
          ctx.moveTo(pts[i].x, pts[i].y);
          ctx.lineTo(pts[j].x, pts[j].y);
          ctx.strokeStyle = `rgba(${rgb},${alpha})`;
          ctx.lineWidth   = isHub ? 1.1 : 0.55;
          ctx.stroke();

          // Spawn data pulses on hub↔hub links
          if (pts[i].hub && pts[j].hub && Math.random() < 0.0006) {
            pulses.current.push({
              ax: pts[i].x, ay: pts[i].y,
              bx: pts[j].x, by: pts[j].y,
              t: 0,
              speed: 0.012 + Math.random() * 0.012,
              color: rgb,
            });
          }
        }
      }

      // ── Traveling data pulses ─────────────────────────────
      pulses.current = pulses.current.filter(p => p.t < 1);
      for (const pulse of pulses.current) {
        pulse.t += pulse.speed;
        const x   = pulse.ax + (pulse.bx - pulse.ax) * pulse.t;
        const y   = pulse.ay + (pulse.by - pulse.ay) * pulse.t;
        const a   = 1 - pulse.t;
        // glow halo
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${pulse.color},${a * 0.18})`;
        ctx.fill();
        // core dot
        ctx.beginPath();
        ctx.arc(x, y, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${pulse.color},${a * 0.9})`;
        ctx.fill();
      }

      // ── Draw nodes ────────────────────────────────────────
      for (const p of pts) {
        const breathe = Math.sin(t * 2.2 + p.phase) * 0.28 + 0.78;
        const rgb     = p.hue === 1 ? '168,85,247' : '0,229,255';
        const r       = p.r * breathe;

        if (p.hub) {
          // outer glow halo
          const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 9);
          halo.addColorStop(0,   `rgba(${rgb},0.22)`);
          halo.addColorStop(0.4, `rgba(${rgb},0.08)`);
          halo.addColorStop(1,   `rgba(${rgb},0)`);
          ctx.beginPath();
          ctx.arc(p.x, p.y, r * 9, 0, Math.PI * 2);
          ctx.fillStyle = halo;
          ctx.fill();

          // inner ring
          ctx.beginPath();
          ctx.arc(p.x, p.y, r * 2.5, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(${rgb},${0.20 * breathe})`;
          ctx.lineWidth   = 0.8;
          ctx.stroke();
        }

        // core
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${rgb},${p.hub ? 0.90 * breathe : 0.42 * breathe})`;
        ctx.fill();
      }

      raf.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(raf.current);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouseMove);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
      style={{ opacity: 0.80 }}
    />
  );
}
