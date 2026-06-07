import { useState, useEffect } from "react";
import { EqualizerPreset } from "../types";
import { Sliders, Activity, Sparkles, Compass, Waves, Headphones, Radio, Zap, Music } from "lucide-react";

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
  // Spatial Audio extensions
  spatialMode: "stereo" | "dolby" | "dts" | "stadium";
  onSpatialModeChange: (mode: "stereo" | "dolby" | "dts" | "stadium") => void;
  spatialOrbitSpeed: number;
  onSpatialOrbitSpeedChange: (value: number) => void;
  spatialDepth: number;
  onSpatialDepthChange: (value: number) => void;
  // Bass Booster & Room-Reverb updates
  psychoBass: number;
  onPsychoBassChange: (value: number) => void;
  trebleFocus: boolean;
  onTrebleFocusChange: (value: boolean) => void;
  reverbEnv: "rock" | "studio" | "cathedral" | "concert" | "hall";
  onReverbEnvChange: (env: "rock" | "studio" | "cathedral" | "concert" | "hall") => void;
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
  spatialMode,
  onSpatialModeChange,
  spatialOrbitSpeed,
  onSpatialOrbitSpeedChange,
  spatialDepth,
  onSpatialDepthChange,
  psychoBass,
  onPsychoBassChange,
  trebleFocus,
  onTrebleFocusChange,
  reverbEnv,
  onReverbEnvChange,
}: EqualizerPanelProps) {

  // Local state for the dynamic radar visual coordinates rotation
  const [radarAngle, setRadarAngle] = useState(0);

  useEffect(() => {
    if (spatialMode !== "dolby") return;
    let animId: number;
    const tick = () => {
      setRadarAngle((prev) => (prev + (spatialOrbitSpeed * 0.04)) % (Math.PI * 2));
      animId = requestAnimationFrame(tick);
    };
    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [spatialMode, spatialOrbitSpeed]);
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
      <div id="dsp-audio-fx-rack" className="border-t border-slate-800/60 pt-4 mt-2 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-brand-light animate-pulse" />
          <h4 className="text-xs font-semibold tracking-wide text-slate-200 uppercase">
            Expanded DSP Audio FX Rack
          </h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          {/* BASS ENGINE & TREBLE CLINIC (Expanded with Psychoacoustic dial & toggle) */}
          <div className="bg-slate-950/60 border border-slate-800/80 p-3.5 rounded-2xl flex flex-col gap-3.5">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-medium text-slate-350">Analog Bass Boost</span>
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
                  aria-label="Analog bass boost slider"
                />
                <div
                  className="absolute w-3 h-3 rounded-full bg-white border border-brand pointer-events-none"
                  style={{ left: `calc(${(bassBoost / 12) * 100}% - 6px)` }}
                />
              </div>
            </div>

            {/* Psychoacoustic Sub-Harmonics Potentiometer */}
            <div className="border-t border-slate-800/40 pt-2 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-300 flex items-center gap-1">
                  <Zap className="w-3 h-3 text-amber-400" />
                  Sub-Harmonics (Psychoacoustic)
                </span>
                <span className="text-[10px] font-mono text-amber-400 font-semibold">
                  {psychoBass === 0 ? "STBY" : `${Math.round(psychoBass * 10)}%`}
                </span>
              </div>

              <div className="flex items-center gap-3">
                {/* Simulated Analogue Pottery Dial */}
                <div className="relative w-14 h-14 bg-slate-900 rounded-full border border-slate-700/80 shadow-[inset_0_2px_4px_rgba(0,0,0,0.8)] flex items-center justify-center group flex-shrink-0">
                  {/* Calibrated dial markings notches */}
                  <div className="absolute -inset-1.5 rounded-full border border-slate-800/40 pointer-events-none border-dashed" />
                  
                  {/* Inner Rotatable Knob Face */}
                  <div 
                    className="w-10 h-10 rounded-full bg-gradient-to-tr from-slate-900 via-slate-800 to-slate-950 border border-slate-700/60 shadow-md flex items-center justify-center transition-transform duration-75 relative"
                    style={{ transform: `rotate(${-135 + (psychoBass / 10) * 270}deg)` }}
                  >
                    {/* Metal slot marker */}
                    <div className="absolute top-1 left-[18px] w-1 h-3 rounded-full bg-amber-400 shadow-[0_0_6px_#ffbf00]" />
                  </div>
                </div>

                <div className="flex-1 flex flex-col gap-1.5">
                  <span className="text-[9px] text-slate-500 leading-tight">
                    Waveshaper synthetically multiplies low-end frequencies for ultra-low bass perception on any hardware speaker.
                  </span>
                  
                  {/* Range slider that drives the dial */}
                  <div className="relative w-full h-1 bg-slate-800 rounded-full flex items-center">
                    <div
                      className="absolute left-0 top-0 h-full bg-gradient-to-r from-orange-400 to-amber-400 rounded-full pointer-events-none"
                      style={{ width: `${(psychoBass / 10) * 100}%` }}
                    />
                    <input
                      id="dsp-psycho-bass"
                      type="range"
                      min="0"
                      max="10"
                      step="0.5"
                      value={psychoBass}
                      onChange={(e) => onPsychoBassChange(parseFloat(e.target.value))}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      aria-label="Psychoacoustic sub harmonics dial control"
                    />
                    <div
                      className="absolute w-2.5 h-2.5 rounded-full bg-white border border-amber-500 pointer-events-none"
                      style={{ left: `calc(${(psychoBass / 10) * 100}% - 5px)` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Treble-Focus Switch (Crisp Presence Toggle) */}
            <div className="border-t border-slate-800/40 pt-2 flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-[11px] font-medium text-slate-350 flex items-center gap-1">
                  <Music className="w-3 h-3 text-cyan-400" />
                  Crisp Treble Focus
                </span>
                <span className="text-[9px] text-slate-500">
                  Focuses highs (+7.5dB @ 7.5kHz)
                </span>
              </div>

              {/* Hardware-like Toggle Button with indicator LED */}
              <button
                id="btn-treble-focus"
                onClick={() => onTrebleFocusChange(!trebleFocus)}
                className={`py-1 px-2.5 rounded-xl border font-mono text-[10px] font-bold tracking-wider flex items-center gap-2 transition-all duration-205 ${
                  trebleFocus
                    ? "bg-slate-900 border-cyan-500/80 text-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.15)]"
                    : "bg-slate-900/40 border-slate-800 text-slate-500 hover:border-slate-700"
                }`}
              >
                {/* LED STATUS BULB */}
                <div 
                  className={`w-2 h-2 rounded-full transition-all ${
                    trebleFocus
                      ? "bg-cyan-400 shadow-[0_0_8px_#22d3ee] animate-pulse"
                      : "bg-slate-800"
                  }`}
                />
                {trebleFocus ? "ACTIVE" : "BYPASS"}
              </button>
            </div>
          </div>

          {/* SIMULATED ROOM REVERB CHAMBER */}
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
            <div className="flex flex-col gap-1.5 pt-0.5">
              <div className="flex items-center justify-between text-[10px] text-slate-455">
                <span>Room / Hall Decay Size</span>
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
                  className="absolute left-0 top-0 h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full pointer-events-none"
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

            {/* Room Reflection Architecture Presets */}
            <div className="border-t border-slate-800/40 pt-2 flex flex-col gap-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                Room Acoustics Environment
              </span>
              
              <div className="flex flex-col gap-1.5 select-none">
                {[
                  { id: "studio", name: "Studio", desc: "Absorptive warm close room", size: 0.8, wet: 0.15 },
                  { id: "rock", name: "Rock", desc: "Short highly fluttery club", size: 1.3, wet: 0.32 },
                  { id: "hall", name: "Hall", desc: "Classic performance acoustics", size: 2.0, wet: 0.45 },
                  { id: "concert", name: "Concert", desc: "Enriched orchestral soundstage", size: 2.6, wet: 0.52 },
                  { id: "cathedral", name: "Cathedral", desc: "Distant massive hollow arches", size: 3.8, wet: 0.68 },
                ].map((item) => {
                  const isCur = reverbEnv === item.id;
                  return (
                    <button
                      key={item.id}
                      id={`btn-env-${item.id}`}
                      onClick={() => {
                        onReverbEnvChange(item.id as any);
                        onReverbSizeChange(item.size);
                        onReverbWetChange(item.wet);
                      }}
                      className={`text-[10px] py-1.5 px-3 rounded-lg font-medium tracking-wide transition-all flex items-center justify-between text-left cursor-pointer ${
                        isCur
                          ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20 font-bold border border-indigo-400/30"
                          : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700"
                      }`}
                      title={item.desc}
                    >
                      <span className="font-semibold">{item.name}</span>
                      <span className={`text-[8px] font-mono normal-case truncate max-w-[150px] ${isCur ? 'text-indigo-200' : 'text-slate-500'}`}>{item.desc}</span>
                    </button>
                  );
                })}
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

      {/* CINEMATIC SPATIAL SOUNDSTAGE ENGINE DEVELOPER BLOCK */}
      <div className="border-t border-slate-800/60 pt-4 mt-2 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Compass className="w-4 h-4 text-brand-light animate-spin" style={{ animationDuration: '6s' }} />
          <h4 className="text-xs font-semibold tracking-wide text-slate-200 uppercase">
            Cinematic Spatial Soundstage Engine
          </h4>
          <span className="text-[9px] lowercase bg-amber-500/10 border border-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-mono animate-pulse">
            pro dsp
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Spatial Mode Selector controls */}
          <div className="lg:col-span-7 bg-slate-950/60 border border-slate-800/80 p-3.5 rounded-2xl flex flex-col gap-3">
            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest">
              Surround Soundstage Selector
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                {
                  id: "stereo",
                  name: "Standard Stereo",
                  desc: "Direct L/R crossfade routing",
                  color: "border-slate-800 hover:border-slate-750",
                  activeColor: "bg-slate-900 border-slate-700 text-slate-300 shadow-slate-900/40"
                },
                {
                  id: "dolby",
                  name: "Dolby Atmos 3D",
                  desc: "360° HRTF Headstage simulation",
                  color: "border-violet-950/40 hover:border-violet-900/60",
                  activeColor: "bg-violet-950/50 border-violet-700 text-violet-300 shadow-violet-950/40"
                },
                {
                  id: "dts",
                  name: "DTS Neural:X",
                  desc: "Ultra-wide Haas delay matrix",
                  color: "border-cyan-950/40 hover:border-cyan-900/60",
                  activeColor: "bg-cyan-950/50 border-cyan-700 text-cyan-300 shadow-cyan-950/40"
                },
                {
                  id: "stadium",
                  name: "Stadium Surround",
                  desc: "Spatially widened live acoustics",
                  color: "border-amber-950/40 hover:border-amber-900/60",
                  activeColor: "bg-amber-950/50 border-amber-700 text-amber-300 shadow-amber-900/40"
                }
              ].map((m) => {
                const isActive = spatialMode === m.id;
                return (
                  <button
                    key={m.id}
                    id={`spatial-mode-btn-${m.id}`}
                    onClick={() => onSpatialModeChange(m.id as any)}
                    className={`p-2 rounded-xl border text-left flex flex-col gap-0.5 transition-all outline-none ${
                      isActive
                        ? `${m.activeColor} border-opacity-100 shadow-md scale-[1.01]`
                        : `${m.color} bg-slate-950/30 text-slate-500`
                    }`}
                  >
                    <span className="text-xs font-bold leading-normal">{m.name}</span>
                    <span className="text-[9px] opacity-75 font-medium leading-tight">{m.desc}</span>
                  </button>
                );
              })}
            </div>

            {/* Dynamic Slider Parameters based on Active Mode */}
            <div className="border-t border-slate-900/60 pt-2 flex flex-col gap-2">
              {/* ORBIT SPEED (Dolby mode control) */}
              <div className={`flex flex-col gap-1.5 transition-all ${spatialMode === "dolby" ? "opacity-100" : "opacity-30 pointer-events-none"}`}>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-semibold text-slate-350">Dolby Atmos Dynamic Orbit Speed</span>
                  <span className="font-mono font-bold text-brand-light">
                    {spatialOrbitSpeed.toFixed(1)} rad/s
                  </span>
                </div>
                <div className="relative w-full h-1.5 bg-slate-800 rounded-full cursor-pointer flex items-center">
                  <div
                    className="absolute left-0 top-0 h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full"
                    style={{ width: `${((spatialOrbitSpeed - 0.1) / 1.9) * 100}%` }}
                  />
                  <input
                    id="dsp-spatial-orbit"
                    type="range"
                    min="0.1"
                    max="2.0"
                    step="0.1"
                    value={spatialOrbitSpeed}
                    disabled={spatialMode !== "dolby"}
                    onChange={(e) => onSpatialOrbitSpeedChange(parseFloat(e.target.value))}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    aria-label="Dolby spatial orbit speed"
                  />
                  <div
                    className="absolute w-3 h-3 rounded-full bg-white pointer-events-none"
                    style={{ left: `calc(${((spatialOrbitSpeed - 0.1) / 1.9) * 100}% - 6px)` }}
                  />
                </div>
              </div>

              {/* WIDTH / DEPTH (DTS and Stadium mode control) */}
              <div className={`flex flex-col gap-1.5 transition-all ${spatialMode === "dts" || spatialMode === "stadium" ? "opacity-100" : "opacity-30 pointer-events-none"}`}>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-semibold text-slate-350">
                    {spatialMode === "stadium" ? "Stadium Acoustics Reflection Size" : "DTS Soundstage Stereo Field Width"}
                  </span>
                  <span className="font-mono font-bold text-brand-light">
                    {Math.round(spatialDepth * 100)}%
                  </span>
                </div>
                <div className="relative w-full h-1.5 bg-slate-800 rounded-full cursor-pointer flex items-center">
                  <div
                    className="absolute left-0 top-0 h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full"
                    style={{ width: `${spatialDepth * 100}%` }}
                  />
                  <input
                    id="dsp-spatial-depth"
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.05"
                    value={spatialDepth}
                    disabled={spatialMode !== "dts" && spatialMode !== "stadium"}
                    onChange={(e) => onSpatialDepthChange(parseFloat(e.target.value))}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    aria-label="Spatial audio depth width"
                  />
                  <div
                    className="absolute w-3 h-3 rounded-full bg-white pointer-events-none"
                    style={{ left: `calc(${spatialDepth * 100}% - 6px)` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Acoustic Radar Scope */}
          <div className="lg:col-span-5 bg-slate-950/65 border border-slate-800/85 p-3 rounded-2xl flex flex-col items-center justify-center relative min-h-[170px] overflow-hidden">
            {/* Visual Radar Grid backdrops */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(59,130,246,0.06)_0%,transparent_70%)] pointer-events-none" />
            
            {/* Compass / Radar Scope Target Frame */}
            <div className="w-[100px] h-[100px] rounded-full border border-slate-800/80 relative flex items-center justify-center p-1 bg-slate-950/30">
              <div className="w-[75px] h-[75px] rounded-full border border-slate-800/40 border-dashed absolute" />
              <div className="w-[45px] h-[45px] rounded-full border border-slate-800/30 absolute" />
              
              {/* Radar Sweeper lines */}
              <div className="absolute top-0 bottom-0 w-[1px] bg-slate-850" />
              <div className="absolute left-0 right-0 h-[1px] bg-slate-850" />

              {/* Headphone listener center node */}
              <div className="z-10 bg-slate-900 border border-slate-700/85 rounded-full p-1.5 shadow-md text-brand">
                <Headphones className="w-4 h-4 text-brand-light animate-pulse" />
              </div>

              {/* Dynamic Sound node representations based on active mode */}
              {spatialMode === "stereo" && (
                <>
                  {/* Standard Left sound node */}
                  <div className="absolute left-[12px] top-[26px] flex flex-col items-center gap-0.5 animate-pulse">
                    <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]" />
                    <span className="text-[7px] font-mono font-bold text-blue-450">L</span>
                  </div>
                  {/* Standard Right sound node */}
                  <div className="absolute right-[12px] top-[26px] flex flex-col items-center gap-0.5 animate-pulse">
                    <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]" />
                    <span className="text-[7px] font-mono font-bold text-blue-450">R</span>
                  </div>
                </>
              )}

              {spatialMode === "dolby" && (
                <>
                  {/* Virtual Dolby Orbit sound field */}
                  <div 
                    className="absolute w-[100px] h-[100px] border border-violet-500/20 rounded-full animate-spin pointer-events-none"
                    style={{ animationDuration: '4s' }}
                  />
                  {/* Orbiting Dolby satellite particle node */}
                  <div 
                    className="absolute flex flex-col items-center transition-all duration-75 z-20"
                    style={{
                      left: `calc(50% + ${Math.sin(radarAngle) * 38}px - 7px)`,
                      top: `calc(50% - ${Math.cos(radarAngle) * 38}px - 7px)`
                    }}
                  >
                    <div className="w-3.5 h-3.5 rounded-full bg-violet-400 border border-white shadow-[0_0_12px_rgba(167,139,250,0.9)] animate-ping absolute opacity-45 mx-auto" />
                    <div className="w-3.5 h-3.5 rounded-full bg-violet-400 border border-white shadow-[0_0_10px_rgba(167,139,250,0.9)] flex items-center justify-center">
                      <span className="text-[7px] font-mono text-slate-950 font-black">3D</span>
                    </div>
                  </div>
                </>
              )}

              {spatialMode === "dts" && (
                <>
                  {/* Widened sound beams representing DTS delay space matrix */}
                  <div 
                    className="absolute h-1.5 bg-gradient-to-r from-cyan-600/30 via-transparent to-cyan-600/30 border-y border-cyan-500/35 transition-all duration-200"
                    style={{ width: `${65 + (spatialDepth * 35)}px` }}
                  />
                  <div className="absolute left-[5px] top-[40px] flex flex-col items-center gap-0.5">
                    <div className="w-2 h-2 rounded-full bg-cyan-400" />
                    <span className="text-[6.5px] font-mono font-bold text-cyan-300">L-Surr</span>
                  </div>
                  <div className="absolute right-[5px] top-[40px] flex flex-col items-center gap-0.5">
                    <div className="w-2 h-2 rounded-full bg-cyan-400" />
                    <span className="text-[6.5px] font-mono font-bold text-cyan-300">R-Surr</span>
                  </div>
                </>
              )}

              {spatialMode === "stadium" && (
                <>
                  {/* Concentric ripples radiating from headphone listener */}
                  <div 
                    className="absolute rounded-full border border-amber-500/25 animate-ping opacity-60"
                    style={{ width: `${35 + (spatialDepth * 55)}px`, height: `${35 + (spatialDepth * 55)}px`, animationDuration: '2.5s' }}
                  />
                  <div 
                    className="absolute rounded-full border border-amber-500/15 animate-ping opacity-30"
                    style={{ width: `${8 + (spatialDepth * 80)}px`, height: `${8 + (spatialDepth * 80)}px`, animationDuration: '4s' }}
                  />
                  <div className="absolute left-[26px] top-[14px] w-1.5 h-1.5 rounded-full bg-amber-400 opacity-60" />
                  <div className="absolute right-[26px] top-[14px] w-1.5 h-1.5 rounded-full bg-amber-400 opacity-60" />
                  <div className="absolute left-[14px] top-[60px] w-1.5 h-1.5 rounded-full bg-amber-400 opacity-30" />
                  <div className="absolute right-[14px] top-[60px] w-1.5 h-1.5 rounded-full bg-amber-400 opacity-30" />
                </>
              )}
            </div>

            {/* Stage scope descriptions */}
            <div className="mt-3 text-center flex flex-col gap-0.5 select-none z-10 bg-slate-950/85 px-3 py-1 rounded-full border border-slate-900 max-w-full">
              <span className="text-[9.5px] font-mono font-bold uppercase tracking-wider text-slate-300 block truncate">
                {spatialMode === "stereo" ? "Standard Stereo Mode" : spatialMode === "dolby" ? "Dolby Atmos Space Radar" : spatialMode === "dts" ? "DTS:X Stereo Matrix" : "Concert Arena Echo Core"}
              </span>
              <span className="text-[8px] text-slate-500 block truncate">
                {spatialMode === "stereo" ? "Standard dual channel balanced audio" : spatialMode === "dolby" ? "Sound source orbiting 3D headset coordinates" : spatialMode === "dts" ? "Haas delay expanded left-right surround" : `Stadium reflection distance: ${Math.round(spatialDepth * 35)} meters`}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
