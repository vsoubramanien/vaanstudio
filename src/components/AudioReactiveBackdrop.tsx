import { useEffect, useRef, useState } from "react";
import { Sparkles, Activity } from "lucide-react";

interface AudioReactiveBackdropProps {
  analyser: AnalyserNode | null;
  isPlaying: boolean;
  currentTrackId?: string;
  currentTrackTitle?: string;
}

interface FluidBlob {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  baseRadius: number;
  color: string;
  targetColor: string;
  colorTransition: number;
  phase: number;
}

interface SpaceDust {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  decay: number;
  interactiveForce: number;
}

export default function AudioReactiveBackdrop({
  analyser,
  isPlaying,
  currentTrackId,
  currentTrackTitle,
}: AudioReactiveBackdropProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mouseRef = useRef({ x: -1000, y: -1000, lastX: -1000, lastY: -1000, vx: 0, vy: 0, age: 0 });
  const blobsRef = useRef<FluidBlob[]>([]);
  const dustRef = useRef<SpaceDust[]>([]);
  const themeColorsRef = useRef<string[]>([
    "rgba(147, 51, 234, 0.15)", // purple
    "rgba(59, 130, 246, 0.15)",  // blue
    "rgba(34, 211, 238, 0.15)"   // cyan
  ]);
  const animationRef = useRef<number | null>(null);
  const [backdropConfig, setBackdropConfig] = useState<"celestial" | "crimson" | "emerald" | "aurora">("celestial");
  const [isEnabled, setIsEnabled] = useState<boolean>(true);
  const [intensity, setIntensity] = useState<number>(1.0);

  // Set color schemes based on the track context or title
  useEffect(() => {
    if (!currentTrackTitle) return;
    const title = currentTrackTitle.toLowerCase();
    
    if (title.includes("starry") || title.includes("night") || title.includes("celestial") || title.includes("space")) {
      setBackdropConfig("celestial");
      themeColorsRef.current = [
        "rgba(30, 27, 75, 0.25)",   // indigo dark
        "rgba(88, 28, 135, 0.20)",  // purple deep
        "rgba(14, 116, 144, 0.20)"  // cyan deep
      ];
    } else if (title.includes("sunset") || title.includes("glow") || title.includes("fire") || title.includes("warm") || title.includes("twilight")) {
      setBackdropConfig("crimson");
      themeColorsRef.current = [
        "rgba(43, 10, 10, 0.28)",    // deep burgundy
        "rgba(127, 29, 29, 0.22)",   // deep red
        "rgba(146, 64, 14, 0.20)"    // dark amber
      ];
    } else if (title.includes("rain") || title.includes("storm") || title.includes("acoustic") || title.includes("lofi")) {
      setBackdropConfig("emerald");
      themeColorsRef.current = [
        "rgba(15, 23, 42, 0.32)",    // slate dark
        "rgba(30, 41, 59, 0.25)",    // neutral dark grey
        "rgba(100, 116, 139, 0.15)"  // steel blue grey
      ];
    } else {
      // Default to ambient purple-emerald aurora
      setBackdropConfig("aurora");
      themeColorsRef.current = [
        "rgba(6, 78, 59, 0.25)",     // emerald deep
        "rgba(88, 28, 135, 0.20)",   // purple deep
        "rgba(15, 118, 110, 0.18)"   // teal deep
      ];
    }
  }, [currentTrackTitle]);

  // Setup Mouse listeners globally
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const mouse = mouseRef.current;
      if (mouse.x !== -1000) {
        mouse.vx = e.clientX - mouse.x;
        mouse.vy = e.clientY - mouse.y;
      }
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      mouse.age = 0;
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, []);

  // Initialize Canvas, Blobs and Particles
  useEffect(() => {
    if (!isEnabled) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Fast resize
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      
      // Re-seed blobs relative to viewport dimensions
      const w = canvas.width;
      const h = canvas.height;
      
      if (blobsRef.current.length === 0) {
        const numBlobs = 4;
        const colors = themeColorsRef.current;
        for (let i = 0; i < numBlobs; i++) {
          const baseR = Math.min(w, h) * (0.18 + Math.random() * 0.12);
          blobsRef.current.push({
            x: Math.random() * w,
            y: Math.random() * h,
            vx: (Math.random() - 0.5) * 0.8,
            vy: (Math.random() - 0.5) * 0.8,
            radius: baseR,
            baseRadius: baseR,
            color: colors[i % colors.length],
            targetColor: colors[i % colors.length],
            colorTransition: 1.0,
            phase: Math.random() * Math.PI * 2
          });
        }
      }
    };

    resizeCanvas();
    const handleResize = () => resizeCanvas();
    window.addEventListener("resize", handleResize);

    const bufferLength = analyser ? analyser.frequencyBinCount : 128;
    const dataArray = new Uint8Array(bufferLength);

    const render = () => {
      if (!canvas || !ctx) return;
      const w = canvas.width;
      const h = canvas.height;

      animationRef.current = requestAnimationFrame(render);

      // 1. Audio Analysis (Extract Bass, Mids, Highs)
      let bass = 0;
      let mids = 0;
      let highs = 0;

      if (analyser && isPlaying) {
        analyser.getByteFrequencyData(dataArray);
        
        // Sum registers
        for (let i = 0; i < 8; i++) bass += dataArray[i]; // Bottom bins: 0 - 300Hz
        for (let i = 12; i < 35; i++) mids += dataArray[i]; // Vocal/Melody: 400 - 2000Hz
        for (let i = 50; i < 110; i++) highs += dataArray[i]; // High hats, shimmer: 3000Hz+

        bass = (bass / 8) / 255;
        mids = (mids / 23) / 255;
        highs = (highs / 60) / 255;
      } else {
        // Idling floating amplitudes
        const time = Date.now() * 0.0012;
        bass = 0.12 + Math.sin(time) * 0.04;
        mids = 0.15 + Math.cos(time * 0.8) * 0.05;
        highs = 0.08 + Math.sin(time * 1.5) * 0.03;
      }

      // Apply overall performance multiplier state
      const bassPower = bass * intensity;
      const midsPower = mids * intensity;
      const highsPower = highs * intensity;

      // Decay Mouse velocity
      const mouse = mouseRef.current;
      mouse.vx *= 0.95;
      mouse.vy *= 0.95;
      mouse.age += 1;

      // 2. Clear canvas with super subtle black-grey overlay to lock smooth motion trails
      ctx.fillStyle = "rgba(4, 5, 10, 0.18)";
      ctx.fillRect(0, 0, w, h);

      // Draw subtle noise/overlay grid lines sometimes if we want a refined touch, but keeping it clean for performance
      
      // 3. Update & Draw Fluid Auroras
      const colors = themeColorsRef.current;
      blobsRef.current.forEach((blob, idx) => {
        // Accelerate or add turbulence with Mids/Bass
        const speedMultiplier = 1.0 + midsPower * 1.8;
        blob.x += blob.vx * speedMultiplier;
        blob.y += blob.vy * speedMultiplier;

        // Bounce gently off bounds
        const pad = -100;
        if (blob.x < pad) { blob.x = pad; blob.vx *= -1; }
        if (blob.x > w - pad) { blob.x = w - pad; blob.vx *= -1; }
        if (blob.y < pad) { blob.y = pad; blob.vy *= -1; }
        if (blob.y > h - pad) { blob.y = h - pad; blob.vy *= -1; }

        // Interaction with mouse coordinate globally!
        if (mouse.x !== -1000 && mouse.age < 200) {
          const dx = mouse.x - blob.x;
          const dy = mouse.y - blob.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const maxDist = Math.max(w, h) * 0.45;
          
          if (dist < maxDist) {
            // Apply gentle gravitational repulse or drift away
            const force = (1.0 - dist / maxDist) * 0.12;
            blob.vx -= (dx / dist) * force;
            blob.vy -= (dy / dist) * force;
          }
        }

        // Keep velocity low
        const maxV = 1.5;
        const currentSpeed = Math.sqrt(blob.vx * blob.vx + blob.vy * blob.vy) || 1;
        if (currentSpeed > maxV) {
          blob.vx = (blob.vx / currentSpeed) * maxV;
          blob.vy = (blob.vy / currentSpeed) * maxV;
        }

        blob.phase += 0.005 + midsPower * 0.015;
        
        // Dynamically scale radius with local Bass
        const radiusMulti = 1.0 + bassPower * 0.45 + Math.sin(blob.phase) * 0.1;
        blob.radius = blob.baseRadius * radiusMulti;

        // Update colors smoothly based on theme settings
        const targetCl = colors[idx % colors.length] || "rgba(100, 116, 139, 0.1)";
        if (blob.targetColor !== targetCl) {
          blob.targetColor = targetCl;
          blob.colorTransition = 0;
        }
        if (blob.colorTransition < 1.0) {
          blob.colorTransition += 0.02;
          blob.color = targetCl; // Snap to target for efficiency
        }

        // Draw Ambient Halo/Aurora
        const grad = ctx.createRadialGradient(
          blob.x, blob.y, blob.radius * 0.1,
          blob.x, blob.y, blob.radius
        );
        grad.addColorStop(0, blob.color);
        grad.addColorStop(0.5, blob.color.replace("0.2", "0.08").replace("0.1", "0.03"));
        grad.addColorStop(1, "rgba(0, 0, 0, 0)");

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(blob.x, blob.y, blob.radius, 0, Math.PI * 2);
        ctx.fill();
      });

      // 4. Update & Spawn Interactive Space Dust Spark Particles
      const particlesToSpawn = isPlaying 
        ? Math.floor(highsPower * 4) + (Math.random() < 0.08 * intensity ? 1 : 0)
        : Math.random() < 0.02 ? 1 : 0;

      for (let s = 0; s < particlesToSpawn; s++) {
        if (dustRef.current.length < 180) {
          // Spawn from a random spot, occasionally clustered near mouse cursor if nearby!
          let spawnX = Math.random() * w;
          let spawnY = Math.random() * h;
          
          if (mouse.x !== -1000 && mouse.age < 120 && Math.random() < 0.45) {
            spawnX = mouse.x + (Math.random() - 0.5) * 80;
            spawnY = mouse.y + (Math.random() - 0.5) * 80;
          }

          let colorStr = "rgba(165, 180, 252, 0.5)"; // Default indigo shimmer
          if (backdropConfig === "crimson") {
            colorStr = "rgba(253, 186, 116, 0.5)"; // warm peach
          } else if (backdropConfig === "emerald") {
            colorStr = "rgba(148, 163, 184, 0.4)"; // cold metallic grey
          } else if (backdropConfig === "aurora") {
            colorStr = "rgba(110, 231, 183, 0.45)"; // mint spark
          }

          // Initial velocities
          dustRef.current.push({
            x: spawnX,
            y: spawnY,
            vx: (Math.random() - 0.5) * 0.5 + (mouse.vx * 0.03),
            vy: (Math.random() - 0.5) * 0.5 - (0.12 + Math.random() * 0.38 + highsPower * 0.8), // Rise up like a chimney
            size: 1 + Math.random() * 2 + highsPower * 3.5,
            color: colorStr,
            alpha: 0.3 + Math.random() * 0.7,
            decay: 0.003 + Math.random() * 0.007,
            interactiveForce: 0.15 + Math.random() * 0.3
          });
        }
      }

      // Render dust elements
      for (let i = dustRef.current.length - 1; i >= 0; i--) {
        const dust = dustRef.current[i];
        
        // Horizontal wave oscillations
        dust.x += dust.vx + Math.sin(dust.y * 0.01 + Date.now() * 0.0012) * 0.2;
        dust.y += dust.vy;
        
        // Diminish alpha
        dust.alpha -= dust.decay;

        // Interactive gravity coupling
        if (mouse.x !== -1000 && mouse.age < 150) {
          const dx = mouse.x - dust.x;
          const dy = mouse.y - dust.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          
          if (dist < 180) {
            // Apply mouse kinetic wake push
            const push = (1.0 - dist / 180) * dust.interactiveForce;
            dust.vx += (mouse.vx * 0.006) * push;
            dust.vy += (mouse.vy * 0.006) * push;
          }
        }

        // Boundary recycling
        if (dust.alpha <= 0 || dust.y < -10 || dust.x < -10 || dust.x > w + 10) {
          dustRef.current.splice(i, 1);
          continue;
        }

        // Render point with beautiful blur
        ctx.save();
        ctx.globalAlpha = dust.alpha;
        ctx.fillStyle = dust.color;
        ctx.beginPath();
        ctx.arc(dust.x, dust.y, dust.size, 0, Math.PI * 2);
        
        // Add subtle bloom to epic high hits
        if (highsPower > 0.4 && dust.size > 2.5) {
          ctx.shadowBlur = dust.size * 2.5;
          ctx.shadowColor = dust.color;
        }

        ctx.fill();
        ctx.restore();
      }
    };

    render();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      window.removeEventListener("resize", handleResize);
    };
  }, [analyser, isPlaying, isEnabled, intensity, backdropConfig]);

  return (
    <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden rounded-3xl">
      {/* High precision canvas drawing container */}
      <canvas
        ref={canvasRef}
        className="w-full h-full block opacity-85 transition-opacity duration-1000"
      />

      {/* Floating control widget inside margins to let users adjust intensity */}
      <div className="absolute bottom-5 left-5 z-25 flex items-center gap-2 bg-slate-950/70 border border-slate-800/60 p-2.5 rounded-2xl select-none backdrop-blur-md pointer-events-auto shadow-xl">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setIsEnabled(!isEnabled)}
            className={`p-1.5 rounded-xl cursor-pointer border text-[10px] uppercase font-bold tracking-widest transition-all ${
              isEnabled 
                ? "bg-brand/15 text-brand-light border-brand/50 hover:bg-brand/20" 
                : "bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-350"
            }`}
            title="Toggle interactive space visualizer backdrop"
          >
            {isEnabled ? <Activity className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
          </button>
          
          {isEnabled && (
            <div className="flex items-center gap-1">
              <span className="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-widest pl-1">Aura:</span>
              <button
                onClick={() => setIntensity((prev) => (prev === 0.5 ? 1.0 : prev === 1.0 ? 1.8 : 0.5))}
                className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-850 border border-slate-800/65 text-[9px] font-mono text-slate-300 font-bold transition-all cursor-pointer"
                title="Swell atmosphere vibration density"
              >
                {intensity === 0.5 ? "Subtle" : intensity === 1.0 ? "Normal" : "Vibrant"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
