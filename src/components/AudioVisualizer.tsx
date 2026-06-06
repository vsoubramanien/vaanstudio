import { useEffect, useRef } from "react";

interface AudioVisualizerProps {
  analyser: AnalyserNode | null;
  isPlaying: boolean;
  visualizerTheme: "neon" | "monochrome" | "sunset" | "matrix";
  visualizerStyle: "bars" | "radial" | "grid" | "oscilloscope" | "particles" | "plasma";
  heightClass?: string;
}

export default function AudioVisualizer({
  analyser,
  isPlaying,
  visualizerTheme,
  visualizerStyle,
  heightClass = "h-16",
}: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const particlesRef = useRef<Array<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    radius: number;
    color: string;
    alpha: number;
    decay: number;
    angleOffset: number;
    orbitSpeed: number;
  }>>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Handle high DPI screens
    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };

    resizeCanvas();
    const resizeObserver = new ResizeObserver(() => {
      resizeCanvas();
    });
    if (canvas.parentElement) {
      resizeObserver.observe(canvas.parentElement);
    }

    const bufferLength = analyser ? analyser.frequencyBinCount : 128;
    const dataArray = new Uint8Array(bufferLength);

    const renderFrame = () => {
      if (!canvas) return;
      const w = canvas.width / window.devicePixelRatio;
      const h = canvas.height / window.devicePixelRatio;

      // Request next frame
      animationRef.current = requestAnimationFrame(renderFrame);

      // Get real data if analyser is ready, otherwise generate gentle idling waveforms
      if (analyser && isPlaying) {
        if (visualizerStyle === "oscilloscope") {
          analyser.getByteTimeDomainData(dataArray);
        } else {
          analyser.getByteFrequencyData(dataArray);
        }
      } else {
        // Create gentle idling waves when paused
        const time = Date.now() * 0.003;
        if (visualizerStyle === "oscilloscope") {
          for (let i = 0; i < bufferLength; i++) {
            // Idle oscilloscope sine wave
            dataArray[i] = 128 + Math.sin(i * 0.08 + time * 2) * 16 * Math.sin(time * 0.5 + i * 0.005);
          }
        } else {
          for (let i = 0; i < bufferLength; i++) {
            dataArray[i] = Math.max(
              8,
              Math.sin(i * 0.08 + time) * 14 + Math.cos(i * 0.04 - time) * 8 + 16
            );
          }
        }
      }

      ctx.clearRect(0, 0, w, h);

      // 1. Establish Theme Colors
      let themeColor = "#3b82f6";
      let themeRgb = "59, 130, 246";
      let barGrad = ctx.createLinearGradient(0, h, 0, 0);

      if (visualizerTheme === "neon") {
        themeColor = "#c084fc"; // Purple
        themeRgb = "192, 132, 252";
        barGrad.addColorStop(0, "#c084fc");
        barGrad.addColorStop(0.5, "#3b82f6");
        barGrad.addColorStop(1, "#22c55e");
      } else if (visualizerTheme === "monochrome") {
        themeColor = "#f3f4f6"; // Gray
        themeRgb = "243, 244, 246";
        barGrad.addColorStop(0, "#374151");
        barGrad.addColorStop(1, "#f3f4f6");
      } else if (visualizerTheme === "sunset") {
        themeColor = "#ff4e00"; // Deep orange
        themeRgb = "255, 78, 0";
        barGrad.addColorStop(0, "#9a011d");
        barGrad.addColorStop(0.5, "#ff4e00");
        barGrad.addColorStop(1, "#ffc400");
      } else if (visualizerTheme === "matrix") {
        themeColor = "#22c55e"; // Green
        themeRgb = "34, 197, 94";
        barGrad.addColorStop(0, "#15803d");
        barGrad.addColorStop(1, "#22c55e");
      }

      // Draw solid fully transparent background
      ctx.fillStyle = "rgba(0, 0, 0, 0)";
      ctx.fillRect(0, 0, w, h);

      // 2. Render Based on Style
      if (visualizerStyle === "radial") {
        // --- RADIAL CIRCULAR SPECTRUM (ORBIT) ---
        const cx = w / 2;
        const cy = h / 2;

        // Base radius scales gently with overall amplitude
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avg = sum / bufferLength;
        const pulse = (avg / 255) * 12;
        const baseRadius = Math.min(w, h) * 0.22 + pulse;

        ctx.strokeStyle = barGrad;
        ctx.lineWidth = 2.0;

        const numBars = Math.min(bufferLength, 82);
        for (let i = 0; i < numBars; i++) {
          const angle = (i / numBars) * Math.PI * 2;
          const val = dataArray[i % bufferLength];
          const percent = val / 255;
          const barLength = percent * (Math.min(w, h) * 0.35);

          const x1 = cx + Math.cos(angle) * baseRadius;
          const y1 = cy + Math.sin(angle) * baseRadius;
          const x2 = cx + Math.cos(angle) * (baseRadius + barLength);
          const y2 = cy + Math.sin(angle) * (baseRadius + barLength);

          if (isPlaying && percent > 0.55) {
            ctx.shadowBlur = 6;
            ctx.shadowColor = themeColor;
          } else {
            ctx.shadowBlur = 0;
          }

          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }

        ctx.shadowBlur = 0;

        // Central core
        ctx.beginPath();
        ctx.arc(cx, cy, baseRadius - 2, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(10, 15, 30, 0.65)";
        ctx.fill();
        ctx.strokeStyle = `rgba(${themeRgb}, 0.55)`;
        ctx.lineWidth = 1.2;
        ctx.stroke();

      } else if (visualizerStyle === "grid") {
        // --- 3D RETRO-GRID WAVEFORM (SYNTH GRID) ---
        const cx = w / 2;
        const cy = h * 0.22; // vanishing point

        // Radiating perspective lines
        const numPerspectiveLines = 18;
        for (let i = 0; i < numPerspectiveLines; i++) {
          const t = i / (numPerspectiveLines - 1);
          const angle = Math.PI * 0.12 + t * Math.PI * 0.76;
          const targetX = w / 2 + Math.cos(angle) * w;
          const targetY = h;

          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(targetX, targetY);
          ctx.strokeStyle = `rgba(${themeRgb}, 0.22)`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // Horizontal receding lines sliding forward
        const speed = isPlaying ? 0.024 : 0.008;
        const offset = (Date.now() * speed) % 1.0;
        const numHorizLines = 7;

        for (let i = 0; i < numHorizLines; i++) {
          const z = (i + offset) / numHorizLines;
          const gridY = cy + z * (h - cy);
          const opacity = z * z * 0.65;

          ctx.beginPath();
          ctx.strokeStyle = `rgba(${themeRgb}, ${opacity})`;
          ctx.lineWidth = 1.0 + z * 1.5;

          const steps = 38;
          for (let j = 0; j <= steps; j++) {
            const xPos = (j / steps) * w;
            const dataIdx = Math.floor((j / steps) * (bufferLength * 0.4));
            const val = dataArray[dataIdx] || 0;
            const ampPercent = val / 255;

            // ripples combining standard sine waves and actual peak audio data
            const sineTerm = Math.sin(j * 0.4 - Date.now() * 0.004) * 4 * z;
            const peakTerm = ampPercent * 16 * z * Math.sin(j * 0.22);
            
            const deformation = sineTerm + peakTerm;
            const waveY = gridY - deformation;

            if (j === 0) {
              ctx.moveTo(xPos, waveY);
            } else {
              ctx.lineTo(xPos, waveY);
            }
          }
          ctx.stroke();
        }

      } else if (visualizerStyle === "oscilloscope") {
        // --- PHOSPHOR SCOPE (OSCILLOSCOPE) ---
        ctx.beginPath();
        ctx.lineWidth = 2.4;
        ctx.strokeStyle = barGrad;

        if (isPlaying) {
          ctx.shadowBlur = 8;
          ctx.shadowColor = themeColor;
        }

        const sliceWidth = w / bufferLength;
        let xPos = 0;

        for (let i = 0; i < bufferLength; i++) {
          const amplitude = dataArray[i] / 128.0; // scale around 1.0 center
          const yPos = (amplitude * h) / 2;

          if (i === 0) {
            ctx.moveTo(xPos, yPos);
          } else {
            ctx.lineTo(xPos, yPos);
          }
          xPos += sliceWidth;
        }

        ctx.lineTo(w, h / 2);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Horizontal dashed oscilloscope reference wire
        ctx.beginPath();
        ctx.setLineDash([5, 8]);
        ctx.strokeStyle = `rgba(${themeRgb}, 0.22)`;
        ctx.lineWidth = 1.0;
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w, h / 2);
        ctx.stroke();
        ctx.setLineDash([]);

      } else if (visualizerStyle === "particles") {
        // --- STELLAR PARTICLES GALAXY ---
        const cx = w / 2;
        const cy = h / 2;

        // Determine general volume/bass power
        let bassSum = 0;
        const bassCount = Math.min(bufferLength, 15);
        for (let i = 0; i < bassCount; i++) {
          bassSum += dataArray[i];
        }
        const bassAvg = bassSum / (bassCount || 1);
        const bassNorm = bassAvg / 255; // 0.0 to 1.0

        // Spawn particles based on energy/bass hits
        const spawnCount = isPlaying ? Math.floor(bassNorm * 5) + (Math.random() < 0.15 ? 1 : 0) : 1;
        for (let s = 0; s < spawnCount; s++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 0.5 + Math.random() * 2.0 + bassNorm * 3.5;
          const size = 1 + Math.random() * 2.5 + bassNorm * 4.5;
          
          // Color based on theme
          let pColor = themeColor;
          if (visualizerTheme === "neon") {
            const colors = ["#c084fc", "#3b82f6", "#22c55e", "#ec4899", "#06b6d4"];
            pColor = colors[Math.floor(Math.random() * colors.length)];
          } else if (visualizerTheme === "sunset") {
            const colors = ["#ff4e00", "#ffc400", "#9a011d", "#f43f5e", "#e11d48"];
            pColor = colors[Math.floor(Math.random() * colors.length)];
          } else if (visualizerTheme === "matrix") {
            const colors = ["#22c55e", "#15803d", "#4ade80", "#86efac", "#166534"];
            pColor = colors[Math.floor(Math.random() * colors.length)];
          } else if (visualizerTheme === "monochrome") {
            const colors = ["#f3f4f6", "#9ca3af", "#d1d5db", "#4b5563", "#ffffff"];
            pColor = colors[Math.floor(Math.random() * colors.length)];
          }

          particlesRef.current.push({
            x: cx + (Math.random() - 0.5) * 10,
            y: cy + (Math.random() - 0.5) * 10,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            radius: size,
            color: pColor,
            alpha: 1.0,
            decay: 0.006 + Math.random() * 0.012,
            angleOffset: Math.random() * Math.PI * 2,
            orbitSpeed: (Math.random() - 0.5) * 0.02
          });
        }

        // Limit the pool of particles to prevent resource exhaustion (max 250)
        if (particlesRef.current.length > 250) {
          particlesRef.current.splice(0, particlesRef.current.length - 250);
        }

        // Update and draw particles
        for (let i = particlesRef.current.length - 1; i >= 0; i--) {
          const p = particlesRef.current[i];
          
          // Apply orbit swirling force
          if (isPlaying) {
            const dx = p.x - cx;
            const dy = p.y - cy;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            // perpendicular vector for swirl
            const swirlX = -dy / dist;
            const swirlY = dx / dist;
            const swirlStrength = (isPlaying ? bassNorm * 0.45 : 0.05) * (150 / (dist + 50));
            
            p.vx += swirlX * swirlStrength;
            p.vy += swirlY * swirlStrength;
            
            // drag
            p.vx *= 0.985;
            p.vy *= 0.985;
          }

          p.x += p.vx;
          p.y += p.vy;
          p.alpha -= p.decay;

          if (p.alpha <= 0) {
            particlesRef.current.splice(i, 1);
            continue;
          }

          ctx.save();
          // Draw particle with glow
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          ctx.fillStyle = p.color;
          ctx.globalAlpha = p.alpha;
          
          if (isPlaying && p.radius > 3.0) {
            ctx.shadowBlur = p.radius * 2;
            ctx.shadowColor = p.color;
          }
          
          ctx.fill();
          ctx.restore();
        }

        // Draw centered glowing active orb core
        const coreRadius = 14 + bassNorm * 16;
        const radialGrad = ctx.createRadialGradient(cx, cy, 2, cx, cy, coreRadius);
        radialGrad.addColorStop(0, "#ffffff");
        radialGrad.addColorStop(0.35, `rgba(${themeRgb}, 0.8)`);
        radialGrad.addColorStop(1, "rgba(0,0,0,0)");
        
        ctx.beginPath();
        ctx.arc(cx, cy, coreRadius, 0, Math.PI * 2);
        ctx.fillStyle = radialGrad;
        ctx.fill();

      } else if (visualizerStyle === "plasma") {
        // --- ORGANIC FLUID PLASMA CORE ---
        const cx = w / 2;
        const cy = h / 2;

        let volSum = 0;
        for (let i = 0; i < bufferLength; i++) {
          volSum += dataArray[i];
        }
        const volAvg = volSum / bufferLength;
        const amp = volAvg / 255; // 0.0 to 1.0

        const time = Date.now() * 0.002;
        const baseRadius = Math.min(w, h) * 0.22 + amp * 12;

        // Create fluid gradient background glow
        const radGrad = ctx.createRadialGradient(cx, cy, baseRadius * 0.4, cx, cy, baseRadius * 1.8);
        radGrad.addColorStop(0, `rgba(${themeRgb}, 0.22)`);
        radGrad.addColorStop(0.5, `rgba(${themeRgb}, 0.08)`);
        radGrad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = radGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, baseRadius * 1.8, 0, Math.PI * 2);
        ctx.fill();

        // Draw multiple smooth overlapping bezier vertices
        const layers = 2;
        for (let layer = 0; layer < layers; layer++) {
          const numVertices = 16;
          const points: Array<{x: number, y: number}> = [];
          
          for (let v = 0; v < numVertices; v++) {
            const angle = (v / numVertices) * Math.PI * 2;
            
            // Look up corresponding frequency data to map onto shape deformity
            const dataIdx = Math.floor((v / numVertices) * (bufferLength * 0.5));
            const subVal = dataArray[dataIdx] || 0;
            const subAmp = subVal / 255;

            // Wobble using a combination of sine frequencies and audio intensity
            const wobbleMultiplier = layer === 0 ? 1 : -0.8;
            const waveOffset = Math.sin(angle * 4 + time * (1.5 + layer) + wobbleMultiplier * 2.0) * 12 * (0.3 + subAmp * 1.2);
            
            // Final vertex radius
            const r = baseRadius * (1.0 - layer * 0.2) + waveOffset;
            const x = cx + Math.cos(angle) * r;
            const y = cy + Math.sin(angle) * r;
            points.push({ x, y });
          }

          // Render smooth path
          ctx.beginPath();
          ctx.moveTo(points[0].x, points[0].y);
          
          for (let i = 0; i < points.length; i++) {
            const p0 = points[i];
            const p1 = points[(i + 1) % points.length];
            const xc = (p0.x + p1.x) / 2;
            const yc = (p0.y + p1.y) / 2;
            ctx.quadraticCurveTo(p0.x, p0.y, xc, yc);
          }
          
          ctx.closePath();
          
          // Layer coloring: Outer is more translucent, inner is solid outline
          if (layer === 0) {
            ctx.strokeStyle = `rgba(${themeRgb}, 0.85)`;
            ctx.lineWidth = 3.0;
            ctx.stroke();
            ctx.fillStyle = `rgba(${themeRgb}, 0.16)`;
            ctx.fill();
          } else {
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 1.6;
            ctx.stroke();
            ctx.fillStyle = `rgba(${themeRgb}, 0.28)`;
            ctx.fill();
          }
        }

        // Draw orbiting electron orbital rings reacting to treble waves
        const ringCount = 2;
        for (let r = 0; r < ringCount; r++) {
          const radiusX = baseRadius * (1.4 + r * 0.2);
          const radiusY = baseRadius * (0.45 - r * 0.1);
          const rotAngle = time * 0.15 + (r * Math.PI) / 3;

          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(rotAngle);
          ctx.beginPath();
          ctx.ellipse(0, 0, radiusX, radiusY, 0, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(${themeRgb}, 0.35)`;
          ctx.lineWidth = 1.0;
          ctx.stroke();

          // Spark particle rotating on orbital path
          const dotAngle = time * 1.5 + r * Math.PI;
          const dotX = Math.cos(dotAngle) * radiusX;
          const dotY = Math.sin(dotAngle) * radiusY;
          
          ctx.beginPath();
          ctx.arc(dotX, dotY, 4, 0, Math.PI * 2);
          ctx.fillStyle = "#ffffff";
          ctx.shadowBlur = 8;
          ctx.shadowColor = themeColor;
          ctx.fill();
          ctx.restore();
        }
      } else {
        // --- CLASSIC SYMMETRICAL FREQUENCY BAR BLOCK ---
        const barWidth = (w / (bufferLength * 0.65)) * 1.0;
        let xPos = 0;

        for (let i = 0; i < bufferLength * 0.65; i++) {
          const val = dataArray[i];
          const percent = val / 255;
          const barHeight = Math.max(3.5, percent * (h * 0.82));

          ctx.fillStyle = barGrad;

          if (isPlaying && percent > 0.6) {
            ctx.shadowBlur = 8;
            ctx.shadowColor = themeColor;
          } else {
            ctx.shadowBlur = 0;
          }

          ctx.beginPath();
          if (ctx.roundRect) {
            ctx.roundRect(xPos, h - barHeight, barWidth - 1.8, barHeight, 2.5);
            ctx.fill();
          } else {
            ctx.fillRect(xPos, h - barHeight, barWidth - 1.8, barHeight);
          }

          xPos += barWidth;
        }
        ctx.shadowBlur = 0;
      }
    };

    renderFrame();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      resizeObserver.disconnect();
    };
  }, [analyser, isPlaying, visualizerTheme, visualizerStyle]);

  return (
    <div className={`w-full ${heightClass} bg-slate-950/40 backdrop-blur-md rounded-2xl overflow-hidden border border-slate-800/50 p-1 flex items-end relative`}>
      <canvas
        id="audio-spectrum-canvas"
        ref={canvasRef}
        className="w-full h-full block cursor-pointer"
        title="Interactive Equalizer Visualizer"
      />
      <span className="absolute top-2 right-3 text-[9px] font-mono uppercase tracking-widest text-slate-500/70 select-none">
        {visualizerStyle} • theme:{visualizerTheme}
      </span>
    </div>
  );
}
