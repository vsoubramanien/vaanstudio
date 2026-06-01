import { EqualizerPreset } from "../types";
import { Sliders, Activity, Sparkles } from "lucide-react";

interface EqualizerPanelProps {
  gains: number[];
  onGainChange: (index: number, value: number) => void;
  onPresetSelect: (gains: number[]) => void;
  bassBoost: number;
  onBassBoostChange: (value: number) => void;
  reverbWet: number;
  onReverbWetChange: (value: number) => void;
  reverbSize: number;
  onReverbSizeChange: (value: number) => void;
  pan: number;
  onPanChange: (value: number) => void;
}

export const PRESETS: EqualizerPreset[] = [
  { name: "Flat / Normal", gains: [0, 0, 0, 0, 0, 0, 0] },
  { name: "Bass Booster", gains: [9, 8, 5, 1, 0, -1, -3] },
  { name: "Heavy Metal", gains: [4, 3, 1, -2, 4, 5, 4] },
  { name: "Vocal Power", gains: [-5, -3, -1, 4, 6, 4, 2] },
  { name: "Electronic Space", gains: [7, 6, 3, -2, 3, 5, 6] },
  { name: "Organic Acoustic", gains: [3, 3, 2, 2, 1, 2, 3] },
  { name: "Podcast / Speech", gains: [-6, -4, -1, 6, 5, 2, -4] },
  { name: "Jazz Blend", gains: [3, 2, 1, -1, 1, 3, 4] },
  { name: "Classic Rock", gains: [5, 4, 2, -1, 1, 3, 5] },
  { name: "Deep Pop", gains: [-2, 1, 3, 4, 3, 1, -1] },
  { name: "Club Dance", gains: [6, 5, 3, 0, 2, 4, 5] },
  { name: "Lounge Chill", gains: [2, 2, 3, 1, 0, -1, -2] },
];

const BAND_LABELS = [
  { label: "Sub", freq: "40Hz" },
  { label: "Bass", freq: "125Hz" },
  { label: "Warmth", freq: "400Hz" },
  { label: "Mids", freq: "1kHz" },
  { label: "Presence", freq: "2.5kHz" },
  { label: "Clarity", freq: "6kHz" },
  { label: "Sparkle", freq: "15kHz" },
];

export default function EqualizerPanel({
  gains,
  onGainChange,
  onPresetSelect,
  bassBoost,
  onBassBoostChange,
  reverbWet,
  onReverbWetChange,
  reverbSize,
  onReverbSizeChange,
  pan,
  onPanChange,
}: EqualizerPanelProps) {
  // Try matching current gains to a preset
  const activePreset =
    PRESETS.find((p) => p.gains.every((val, idx) => Math.round(val) === Math.round(gains[idx])))
      ?.name || "Custom";

  // Create SVG path of the equalizer response curve
  // Slider height mapping: SVG is 100 high, mid is y=50. Max gain (+12) is y=10. Min gain (-12) is y=109.
  const points = gains.map((gain, i) => {
    const x = 20 + i * 40; // 7 columns spread symmetrically over 280px width
    const y = 50 - (gain / 12) * 40; // slider mapping
    return { x, y };
  });

  // Smooth bezier curve path
  let pathD = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const cpX1 = points[i].x + 18;
    const cpY1 = points[i].y;
    const cpX2 = points[i + 1].x - 18;
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
          7-Band DSP
        </div>
      </div>

      {/* Preset Picker */}
      <div className="grid grid-cols-4 gap-2">
        {PRESETS.map((preset) => {
          const isSelected = activePreset === preset.name;
          const displayLabel = preset.name
            .replace(" / Normal", "")
            .replace(" Booster", "")
            .replace(" Power", "")
            .replace(" Space", "")
            .replace(" Acoustic", "")
            .replace(" / Speech", "")
            .replace(" Blend", "")
            .replace(" Rock", "")
            .replace(" Pop", "")
            .replace(" Dance", "")
            .replace(" Chill", "")
            .replace(" Metal", "");

          return (
            <button
              key={preset.name}
              id={`preset-btn-${preset.name.toLowerCase().replace(/\s+/g, '-')}`}
              onClick={() => onPresetSelect(preset.gains)}
              className={`text-[11px] py-1.5 px-0.5 rounded-xl font-medium transition-all ${
                isSelected
                  ? "bg-brand text-white border-none shadow-lg shadow-brand/20 scale-[1.02]"
                  : "bg-slate-800/50 hover:bg-slate-800 border border-slate-700/30 text-slate-400"
              }`}
            >
              {displayLabel}
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
      <div className="flex items-center justify-between gap-1 sm:gap-2 px-1 pt-2">
        {gains.map((gain, index) => {
          const band = BAND_LABELS[index];
          return (
            <div key={index} className="flex flex-col items-center gap-1.5 sm:gap-2 flex-1 max-w-[46px]">
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

      {/* Expanded DSP Audio FX Rack */}
      <div className="border-t border-slate-800/60 pt-4 mt-2 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-brand-light animate-pulse" />
          <h4 className="text-xs font-semibold tracking-wide text-slate-200 uppercase">
            Expanded DSP Audio FX Rack
          </h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* BASS BOOST CONTROL */}
          <div className="bg-slate-950/60 border border-slate-800/80 p-3.5 rounded-2xl flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-350">Bass Boost</span>
              <span className="text-[10px] font-mono font-semibold text-brand-light">
                {bassBoost === 0 ? "OFF" : `+${bassBoost} dB`}
              </span>
            </div>
            
            <div className="relative group w-full h-1.5 bg-slate-800 rounded-full cursor-pointer flex items-center">
              <div
                className="absolute left-0 top-0 h-full bg-gradient-to-r from-red-500 to-orange-500 rounded-full pointer-events-none"
                style={{ width: `${(bassBoost / 12) * 100}%` }}
              />
              <input
                id="dsp-bass-boost"
                type="range"
                min="0"
                max="12"
                step="0.5"
                value={bassBoost}
                onChange={(e) => onBassBoostChange(parseFloat(e.target.value))}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                aria-label="Bass boost slider"
              />
              <div
                className="absolute w-3 h-3 rounded-full bg-white border border-brand pointer-events-none"
                style={{ left: `calc(${(bassBoost / 12) * 100}% - 6px)` }}
              />
            </div>
            <div className="flex justify-between items-center text-[9px] text-slate-500">
              <span>Punchy Lows</span>
              <button
                id="btn-bass-reset"
                onClick={() => onBassBoostChange(0)}
                className="hover:text-white transition-colors"
              >
                Reset
              </button>
            </div>
          </div>

          {/* REVERB CHAMBER */}
          <div className="bg-slate-950/60 border border-slate-800/80 p-3.5 rounded-2xl flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-350">Reverb Wet Mix</span>
              <span className="text-[10px] font-mono font-semibold text-brand-light">
                {Math.round(reverbWet * 100)}%
              </span>
            </div>
            
            <div className="relative group w-full h-1.5 bg-slate-800 rounded-full cursor-pointer flex items-center">
              <div
                className="absolute left-0 top-0 h-full bg-gradient-to-r from-teal-500 to-indigo-500 rounded-full pointer-events-none"
                style={{ width: `${reverbWet * 100}%` }}
              />
              <input
                id="dsp-reverb-wet"
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={reverbWet}
                onChange={(e) => onReverbWetChange(parseFloat(e.target.value))}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                aria-label="Reverb level slider"
              />
              <div
                className="absolute w-3 h-3 rounded-full bg-white pointer-events-none"
                style={{ left: `calc(${reverbWet * 100}% - 6px)` }}
              />
            </div>

            {/* Hall Size Slider inside Reverb Chamber */}
            <div className="flex flex-col gap-1.5 pt-0.5 border-t border-slate-800/40">
              <div className="flex items-center justify-between text-[10px] text-slate-450">
                <span>Room / Hall Size</span>
                <span className="font-mono text-[9px]">
                  {reverbSize <= 1.0
                    ? `Studio (${reverbSize.toFixed(1)}s)`
                    : reverbSize <= 2.2
                    ? `Chamber (${reverbSize.toFixed(1)}s)`
                    : `Cathedral (${reverbSize.toFixed(1)}s)`}
                </span>
              </div>
              <div className="relative w-full h-1.5 bg-slate-800 rounded-full cursor-pointer flex items-center">
                <div
                  className="absolute left-0 top-0 h-full bg-gradient-to-r from-indigo-505 to-violet-500 rounded-full pointer-events-none animate-pulse"
                  style={{ width: `${((reverbSize - 0.5) / 3.5) * 100}%` }}
                />
                <input
                  id="dsp-reverb-size"
                  type="range"
                  min="0.5"
                  max="4.0"
                  step="0.1"
                  value={reverbSize}
                  onChange={(e) => onReverbSizeChange(parseFloat(e.target.value))}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  aria-label="Reverb size control slider"
                />
                <div
                  className="absolute w-3 h-3 rounded-full bg-white pointer-events-none"
                  style={{ left: `calc(${((reverbSize - 0.5) / 3.5) * 100}% - 6px)` }}
                />
              </div>
            </div>
          </div>

          {/* STEREO PANNER CONTROL */}
          <div className="bg-slate-950/60 border border-slate-800/80 p-3.5 rounded-2xl flex flex-col gap-2.5 justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-350">Stereo Panner</span>
                <span className="text-[10px] font-mono font-semibold text-brand-light">
                  {pan === 0 ? "Center" : pan < 0 ? `L ${Math.abs(Math.round(pan * 100))}%` : `R ${Math.round(pan * 100)}%`}
                </span>
              </div>
              
              <div className="relative w-full h-1.5 bg-slate-800 rounded-full cursor-pointer flex items-center mt-3">
                {/* Visual marker in the absolute center */}
                <div className="absolute left-1/2 -translate-x-1/2 w-1.5 h-3 bg-slate-700/80 rounded" />
                
                {/* Colored pan line from center to current value */}
                <div
                  className="absolute h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full pointer-events-none"
                  style={{
                    left: `${pan < 0 ? (pan + 1) * 50 : 50}%`,
                    width: `${Math.abs(pan) * 50}%`
                  }}
                />
                <input
                  id="dsp-stereo-panner"
                  type="range"
                  min="-1"
                  max="1"
                  step="0.05"
                  value={pan}
                  onChange={(e) => onPanChange(parseFloat(e.target.value))}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  aria-label="Stereo panner slider"
                />
                <div
                  className="absolute w-3 h-3 rounded-full bg-white pointer-events-none"
                  style={{ left: `calc(${(pan + 1) * 50}% - 6px)` }}
                />
              </div>
            </div>

            <div className="flex justify-between items-center text-[9px] text-slate-500 mt-1">
              <span>L (Left)</span>
              <button
                id="btn-panner-center"
                onClick={() => onPanChange(0)}
                className="bg-slate-800/60 hover:bg-slate-800 text-[10px] text-slate-300 font-medium px-2 py-0.5 rounded-md hover:text-white border border-slate-700/40 transition-colors"
              >
                Center
              </button>
              <span>R (Right)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
