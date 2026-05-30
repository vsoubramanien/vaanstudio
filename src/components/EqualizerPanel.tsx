import { EqualizerPreset } from "../types";
import { Sliders, Activity } from "lucide-react";

interface EqualizerPanelProps {
  gains: number[];
  onGainChange: (index: number, value: number) => void;
  onPresetSelect: (gains: number[]) => void;
}

export const PRESETS: EqualizerPreset[] = [
  { name: "Flat / Normal", gains: [0, 0, 0, 0, 0] },
  { name: "Bass Booster", gains: [9, 6, 1, -1, -3] },
  { name: "Vocal Power", gains: [-4, -1, 6, 5, 2] },
  { name: "Electronic Space", gains: [7, 4, -2, 5, 6] },
  { name: "Organic Acoustic", gains: [3, 2, 2, 1, 3] },
  { name: "Podcast / Speech", gains: [-6, -1, 7, 3, -4] },
];

const BAND_LABELS = [
  { label: "Bass", freq: "60Hz" },
  { label: "Warmth", freq: "230Hz" },
  { label: "Mids", freq: "910Hz" },
  { label: "Clarity", freq: "4kHz" },
  { label: "Sparkle", freq: "14kHz" },
];

export default function EqualizerPanel({
  gains,
  onGainChange,
  onPresetSelect,
}: EqualizerPanelProps) {
  // Try matching current gains to a preset
  const activePreset =
    PRESETS.find((p) => p.gains.every((val, idx) => Math.round(val) === Math.round(gains[idx])))
      ?.name || "Custom";

  // Create SVG path of the equalizer response curve
  // Slider height mapping: SVG is 100 high, mid is y=50. Max gain (+12) is y=10. Min gain (-12) is y=90.
  const points = gains.map((gain, i) => {
    const x = 30 + i * 55; // 5 columns spread over 220px width
    const y = 50 - (gain / 12) * 40; // slider mapping
    return { x, y };
  });

  // Smooth bezier curve path
  let pathD = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const cpX1 = points[i].x + 25;
    const cpY1 = points[i].y;
    const cpX2 = points[i + 1].x - 25;
    const cpY2 = points[i + 1].y;
    pathD += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${points[i + 1].x} ${points[i + 1].y}`;
  }

  return (
    <div className="w-full bg-slate-900/60 backdrop-blur-xl border border-slate-800/70 p-5 rounded-3xl flex flex-col gap-4 text-white">
      {/* Title Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sliders className="w-5 h-5 text-brand" />
          <h3 className="text-sm font-semibold tracking-wide text-slate-100 uppercase">
            Equalizer Settings
          </h3>
        </div>
        <div className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700/60 text-slate-400">
          5-Band DSP
        </div>
      </div>

      {/* Preset Picker */}
      <div className="grid grid-cols-3 gap-2">
        {PRESETS.map((preset) => {
          const isSelected = activePreset === preset.name;
          return (
            <button
              key={preset.name}
              id={`preset-btn-${preset.name.toLowerCase().replace(/\s+/g, '-')}`}
              onClick={() => onPresetSelect(preset.gains)}
              className={`text-xs py-2 px-1 rounded-xl font-medium transition-all ${
                isSelected
                  ? "bg-brand text-white border-none shadow-lg shadow-brand/20 scale-[1.02]"
                  : "bg-slate-800/50 hover:bg-slate-800 border border-slate-700/30 text-slate-400"
              }`}
            >
              {preset.name.replace(" / Normal", "").replace(" Booster", "").replace(" Power", "").replace(" Space", "").replace(" Acoustic", "").replace(" / Speech", "")}
            </button>
          );
        })}
      </div>

      {/* Interactive EQ Wave Response Graphic */}
      <div className="w-full h-16 bg-slate-950/80 rounded-2xl border border-slate-800/70 relative mt-1 overflow-hidden">
        <svg className="w-full h-full" viewBox="0 0 280 100">
          {/* Grid Lines */}
          <line x1="0" y1="50" x2="280" y2="50" stroke="#1e293b" strokeDasharray="4 2" />
          <line x1="0" y1="10" x2="280" y2="10" stroke="#1e293b" strokeOpacity="0.5" />
          <line x1="0" y1="90" x2="280" y2="90" stroke="#1e293b" strokeOpacity="0.5" strokeDasharray="2 4" />

          {/* Connected Curves */}
          <path
            d={pathD}
            fill="none"
            stroke="url(#eqGlow)"
            strokeWidth="3.5"
            strokeLinecap="round"
          />

          {/* Glowing Points */}
          {points.map((pt, i) => (
            <g key={i}>
              <circle cx={pt.x} cy={pt.y} r="6" fill="#3b0700" stroke="#ff4e00" strokeWidth="2" />
              <circle cx={pt.x} cy={pt.y} r="2" fill="#fff" />
            </g>
          ))}

          {/* Gradients */}
          <defs>
            <linearGradient id="eqGlow" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#9a011d" />
              <stop offset="50%" stopColor="#ff4e00" />
              <stop offset="100%" stopColor="#ffc400" />
            </linearGradient>
            <linearGradient id="eqArea" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#ff4e00" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#ff4e00" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
        <span className="absolute top-2 left-3 text-[9px] font-mono uppercase tracking-widest text-brand-light/70 flex items-center gap-1">
          <Activity className="w-3 h-3" /> response curve
        </span>
        <span className="absolute bottom-2 right-3 text-[9px] font-mono text-slate-500">
          Preset: <span className="text-slate-300 font-semibold">{activePreset}</span>
        </span>
      </div>

      {/* Sliders Grid */}
      <div className="flex items-center justify-between px-1 pt-2">
        {gains.map((gain, index) => {
          const band = BAND_LABELS[index];
          return (
            <div key={index} className="flex flex-col items-center gap-2 w-12">
              {/* dB Label */}
              <span className="text-[10px] font-mono text-brand-light font-semibold select-none">
                {gain > 0 ? `+${gain}` : gain}dB
              </span>

              {/* Slider (Vertical container) */}
              <div className="h-28 w-4 bg-slate-950/70 border border-slate-800 rounded-full flex items-center justify-center relative p-1 group">
                {/* Visual Fill Track */}
                <div 
                  className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-brand-dark to-brand-light rounded-full transition-all duration-75"
                  style={{ height: `${((gain + 12) / 24) * 100}%` }}
                />
                
                <input
                  id={`eq-slider-${index}`}
                  type="range"
                  min="-12"
                  max="12"
                  step="1"
                  value={gain}
                  onChange={(e) => onGainChange(index, parseInt(e.target.value))}
                  style={{ writingMode: "vertical-lr" }} // rotates standard slider
                  className="w-full h-full opacity-0 cursor-pointer z-10 accent-brand min-h-[100px]"
                  aria-label={`${band.label} equalizing band at ${band.freq}`}
                />

                {/* Simulated Rounded Slider Handle */}
                <div 
                  className="absolute pointer-events-none w-5 h-5 rounded-full bg-white border border-brand-light shadow-md ring-2 ring-brand/35 transition-all duration-75"
                  style={{ bottom: `calc(${((gain + 12) / 24) * 100}% - 10px)` }}
                />
              </div>

              {/* Frequency description labels */}
              <div className="flex flex-col items-center leading-none">
                <span className="text-[10px] font-medium text-slate-200">{band.label}</span>
                <span className="text-[9px] font-mono text-slate-500 mt-0.5">{band.freq}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
