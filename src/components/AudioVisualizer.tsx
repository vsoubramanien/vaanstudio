import { useEffect, useRef } from "react";

interface AudioVisualizerProps {
  analyser: AnalyserNode | null;
  isPlaying: boolean;
  visualizerTheme: "neon" | "monochrome" | "sunset" | "matrix";
}

export default function AudioVisualizer({
  analyser,
  isPlaying,
  visualizerTheme,
}: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);

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

    const bufferLength = analyser ? analyser.frequencyBinCount : 64;
    const dataArray = new Uint8Array(bufferLength);

    const renderFrame = () => {
      if (!canvas) return;
      const w = canvas.width / window.devicePixelRatio;
      const h = canvas.height / window.devicePixelRatio;

      // Request next frame
      animationRef.current = requestAnimationFrame(renderFrame);

      // Get real data if analyser is ready, otherwise generate gentle background waves
      if (analyser && isPlaying) {
        analyser.getByteFrequencyData(dataArray);
      } else {
        // Create gentle idling wave animations when paused
        const time = Date.now() * 0.002;
        for (let i = 0; i < bufferLength; i++) {
          dataArray[i] = Math.max(
            10,
            Math.sin(i * 0.1 + time) * 15 + Math.cos(i * 0.05 - time) * 10 + 20
          );
        }
      }

      ctx.clearRect(0, 0, w, h);

      // Set styles based on theme
      let barGrad = ctx.createLinearGradient(0, h, 0, 0);
      if (visualizerTheme === "neon") {
        barGrad.addColorStop(0, "#c084fc"); // Purple-400
        barGrad.addColorStop(0.5, "#3b82f6"); // Blue-500
        barGrad.addColorStop(1, "#22c55e"); // Green-500
      } else if (visualizerTheme === "monochrome") {
        barGrad.addColorStop(0, "#374151"); // Gray-700
        barGrad.addColorStop(1, "#f3f4f6"); // Gray-100
      } else if (visualizerTheme === "sunset") {
        barGrad.addColorStop(0, "#9a011d"); // Deep crimson
        barGrad.addColorStop(0.5, "#ff4e00"); // Brand deep orange
        barGrad.addColorStop(1, "#ffc400"); // Glowing gold
      } else if (visualizerTheme === "matrix") {
        barGrad.addColorStop(0, "#15803d"); // Green-700
        barGrad.addColorStop(1, "#22c55e"); // Green-500
      }

      const barWidth = (w / (bufferLength * 0.7)) * 1.0;
      let x = 0;

      // Draw standard symmetrical frequency visualizer
      ctx.fillStyle = "rgba(0, 0, 0, 0)";
      ctx.fillRect(0, 0, w, h);

      // Render sound spectrum bars with curved edges and subtle glows
      for (let i = 0; i < bufferLength * 0.7; i++) {
        // scale height
        const val = dataArray[i];
        const percent = val / 255;
        const barHeight = Math.max(3, percent * (h * 0.85));

        ctx.fillStyle = barGrad;

        // Subtly glow high frequencies when playing
        if (isPlaying && percent > 0.6) {
          ctx.shadowBlur = 8;
          if (visualizerTheme === "neon") ctx.shadowColor = "#3b82f6";
          else if (visualizerTheme === "sunset") ctx.shadowColor = "#ff4e00";
          else if (visualizerTheme === "matrix") ctx.shadowColor = "#22c55e";
          else ctx.shadowColor = "rgba(255, 255, 255, 0.3)";
        } else {
          ctx.shadowBlur = 0;
        }

        ctx.beginPath();
        // Draw elegant pill-shaped visualizer columns
        if (ctx.roundRect) {
          ctx.roundRect(x, h - barHeight, barWidth - 2, barHeight, 3);
          ctx.fill();
        } else {
          ctx.fillRect(x, h - barHeight, barWidth - 2, barHeight);
        }

        x += barWidth;
      }
      ctx.shadowBlur = 0; // reset
    };

    renderFrame();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      resizeObserver.disconnect();
    };
  }, [analyser, isPlaying, visualizerTheme]);

  return (
    <div className="w-full h-16 bg-slate-950/40 backdrop-blur-md rounded-2xl overflow-hidden border border-slate-800/50 p-1 flex items-end relative">
      <canvas
        id="audio-spectrum-canvas"
        ref={canvasRef}
        className="w-full h-full block cursor-pointer"
        title="Interactive Equalizer Visualizer"
      />
      <span className="absolute top-2 right-3 text-[10px] font-mono uppercase tracking-widest text-slate-500/70 select-none">
        Spectrum Visualizer ({visualizerTheme})
      </span>
    </div>
  );
}
