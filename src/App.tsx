import React, { useState, useRef, useEffect } from "react";
import { SAMPLE_TRACKS } from "./data/sampleTracks";
import { Track } from "./types";
import AudioVisualizer from "./components/AudioVisualizer";
import EqualizerPanel from "./components/EqualizerPanel";
import SyncedLyrics from "./components/SyncedLyrics";
import TrackList from "./components/TrackList";

// Icon imports
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Volume2,
  VolumeX,
  Shuffle,
  Repeat,
  Smartphone,
  LayoutGrid,
  Music,
  Activity,
  Sliders,
  Sparkles,
  Wifi,
  Battery,
  HardDriveUpload,
  FastForward,
  Rewind,
  Flame,
  Info
} from "lucide-react";

export default function App() {
  // State definitions
  const [tracks, setTracks] = useState<Track[]>(SAMPLE_TRACKS);
  const [currentTrackId, setCurrentTrackId] = useState<string>("1");
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(SAMPLE_TRACKS[0].duration);
  const [volume, setVolume] = useState<number>(0.8);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [repeatMode, setRepeatMode] = useState<"off" | "one" | "all">("all");
  const [isShuffle, setIsShuffle] = useState<boolean>(false);
  const [layoutMode, setLayoutMode] = useState<"mobile" | "dashboard">("mobile");
  
  // Equalizer gains corresponding to [60, 230, 910, 4000, 14000] Hz
  const [gains, setGains] = useState<number[]>([0, 0, 0, 0, 0]);
  const [visualizerTheme, setVisualizerTheme] = useState<"neon" | "sunset" | "matrix" | "monochrome">("neon");
  const [mobileTab, setMobileTab] = useState<"player" | "lyrics" | "eq" | "playlist">("player");

  // System Clock for Android status bar
  const [sysTime, setSysTime] = useState("14:18");

  // Audio References
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const filtersRef = useRef<BiquadFilterNode[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  // Active track helper
  const currentTrack = tracks.find((t) => t.id === currentTrackId) || tracks[0];

  // System time updater
  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      let hours = d.getHours().toString().padStart(2, "0");
      let minutes = d.getMinutes().toString().padStart(2, "0");
      setSysTime(`${hours}:${minutes}`);
    };
    updateTime();
    const timer = setInterval(updateTime, 1000 * 30);
    return () => clearInterval(timer);
  }, []);

  // Web Audio Context initialization (bypassing browser blocks via click)
  const initAudioEngine = () => {
    if (!audioRef.current) return;

    if (!audioCtxRef.current) {
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioContextClass();
        audioCtxRef.current = ctx;

        // Create Media Element Source
        const source = ctx.createMediaElementSource(audioRef.current);
        sourceNodeRef.current = source;

        // Build 5-band Equalizer chain (Peaking filters)
        const frequencies = [60, 230, 910, 4000, 14000];
        const filters = frequencies.map((freq, idx) => {
          const filter = ctx.createBiquadFilter();
          filter.type = "peaking";
          filter.frequency.value = freq;
          filter.Q.value = 1.0;
          filter.gain.value = gains[idx];
          return filter;
        });
        filtersRef.current = filters;

        // Create AnalyserNode for audio visualization
        const analyserNode = ctx.createAnalyser();
        analyserNode.fftSize = 256;
        analyserRef.current = analyserNode;
        setAnalyser(analyserNode);

        // Chain the connections together
        // source -> f[0] -> f[1] -> f[2] -> f[3] -> f[4] -> analyser -> destination (speakers)
        let previousNode: AudioNode = source;
        filters.forEach((filter) => {
          previousNode.connect(filter);
          previousNode = filter;
        });

        previousNode.connect(analyserNode);
        analyserNode.connect(ctx.destination);
      } catch (err) {
        console.error("Failed to construct Web Audio graph: ", err);
      }
    }

    // Safely resume suspended audio context
    if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume();
    }
  };

  // Sync EQ BiquadFilter gains dynamically with state updates
  useEffect(() => {
    if (filtersRef.current.length === 5) {
      filtersRef.current.forEach((filter, idx) => {
        filter.gain.setValueAtTime(gains[idx], audioCtxRef.current?.currentTime || 0);
      });
    }
  }, [gains]);

  // Adjust audio element properties when state triggers
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  // Toggle play-pause loop safely
  const togglePlay = async () => {
    if (!audioRef.current) return;
    initAudioEngine();

    try {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        await audioRef.current.play();
        setIsPlaying(true);
      }
    } catch (err) {
      console.warn("Autoplay block or media failure. Please try again after user interactions:", err);
    }
  };

  // Handle seeking / track positioning
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = val;
      setCurrentTime(val);
    }
  };

  // Track skipping logic (Forward)
  const handleNextTrack = (userTriggered = true) => {
    const currentIndex = tracks.findIndex((t) => t.id === currentTrackId);
    let nextIndex = currentIndex;

    if (isShuffle) {
      // Pick a random track index distinct from active (if there are multiple)
      if (tracks.length > 1) {
        let rand;
        do {
          rand = Math.floor(Math.random() * tracks.length);
        } while (rand === currentIndex);
        nextIndex = rand;
      }
    } else {
      nextIndex = currentIndex + 1;
      if (nextIndex >= tracks.length) {
        // If at the end, behave according to repeat mode
        if (repeatMode === "all") {
          nextIndex = 0;
        } else if (repeatMode === "off" && !userTriggered) {
          // Stay at end and halt playback
          setIsPlaying(false);
          if (audioRef.current) {
            audioRef.current.currentTime = 0;
            setCurrentTime(0);
          }
          return;
        } else {
          // Wrap around for user skips anyway
          nextIndex = 0;
        }
      }
    }

    handleTrackSelect(tracks[nextIndex].id);
  };

  // Track skipping logic (Backward)
  const handlePrevTrack = () => {
    // Standard player rule: if song has played > 3 seconds, rewinding resets current track instead of skipping!
    if (currentTime > 3) {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        setCurrentTime(0);
      }
      return;
    }

    const currentIndex = tracks.findIndex((t) => t.id === currentTrackId);
    let nextIndex = currentIndex - 1;
    if (nextIndex < 0) {
      nextIndex = tracks.length - 1;
    }

    handleTrackSelect(tracks[nextIndex].id);
  };

  // Quick skipped jump
  const handleFastForward = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.min(duration, currentTime + 10);
    }
  };

  const handleFastRewind = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(0, currentTime - 10);
    }
  };

  // Handle explicit track selections
  const handleTrackSelect = (trackId: string) => {
    setCurrentTrackId(trackId);
    setCurrentTime(0);

    // Give browser a microsecond to apply src change to the DOM element
    setTimeout(async () => {
      if (audioRef.current) {
        initAudioEngine();
        
        // Match duration to media header context
        if (!isNaN(audioRef.current.duration)) {
          setDuration(audioRef.current.duration);
        }

        if (isPlaying) {
          try {
            await audioRef.current.play();
          } catch (e) {
            console.error(e);
          }
        }
      }
    }, 80);
  };

  // Sound ending handler
  const handleEnded = () => {
    if (repeatMode === "one") {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch((e) => console.error(e));
      }
    } else {
      handleNextTrack(false);
    }
  };

  // Custom tracks add handlings
  const handleTrackUpload = (newTrack: Track) => {
    setTracks((prev) => [...prev, newTrack]);
    // Optionally switch to the song immediately
    handleTrackSelect(newTrack.id);
  };

  // Custom tracks deleting handlings
  const handleTrackDelete = (trackId: string) => {
    // If deleted song was playing, skip forward first
    if (currentTrackId === trackId) {
      handleNextTrack();
    }
    setTracks((prev) => prev.filter((t) => t.id !== trackId));
  };

  // Lyrics updating helper (for editing or auto-generating timestamps)
  const handleLyricsUpdate = (
    trackId: string,
    plainLyrics: string,
    syncedLyrics?: { time: number; text: string }[]
  ) => {
    setTracks((prev) =>
      prev.map((t) =>
        t.id === trackId
          ? { ...t, lyrics: plainLyrics, syncedLyrics: syncedLyrics }
          : t
      )
    );
  };

  // Manual EQ adjustments
  const handleGainChange = (index: number, value: number) => {
    setGains((prev) => {
      const copy = [...prev];
      copy[index] = value;
      return copy;
    });
  };

  // Preset selected triggers
  const handlePresetSelect = (presetGains: number[]) => {
    setGains(presetGains);
  };

  // Format seconds into digital clock mm:ss format
  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs === Infinity) return "00:00";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // Beautiful interactive background styles based on track theme
  const getAmbientBgColor = () => {
    if (currentTrackId === "1") return "from-brand-dark/25 via-slate-950 to-slate-950";
    if (currentTrackId === "2") return "from-brand-dark/15 via-slate-950 to-slate-950";
    if (currentTrackId === "3") return "from-brand-dark/35 via-slate-950 to-slate-950";
    return "from-brand-dark/20 via-slate-950 to-slate-950";
  };

  return (
    <div className={`min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans transition-all duration-700 bg-gradient-to-b ${getAmbientBgColor()} p-4 md:p-6 overflow-x-hidden`}>
      
      {/* Invisible HTML5 Audio back-end engine */}
      <audio
        ref={audioRef}
        src={currentTrack.src}
        crossOrigin="anonymous"
        onTimeUpdate={() => {
          if (audioRef.current) {
            setCurrentTime(audioRef.current.currentTime);
          }
        }}
        onDurationChange={() => {
          if (audioRef.current && !isNaN(audioRef.current.duration)) {
            setDuration(audioRef.current.duration);
          }
        }}
        onEnded={handleEnded}
      />

      {/* Navigation Top Header Dashboard */}
      <header className="max-w-7xl w-full mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/40 pb-4 mb-6 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-brand/10 border border-brand/35 text-brand-light">
            <Music className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-xl font-bold tracking-tight text-white font-display">
                Acoustic DSP Studio
              </h1>
              <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold inline-flex items-center gap-0.5 animate-bounce">
                <Flame className="w-2.5 h-2.5" /> android native
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Real-time WebAudio Equalization & Sync Lyrics
            </p>
          </div>
        </div>

        {/* Viewport Toggles and Visualizer Themes */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Visualizer theme Picker */}
          <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-slate-800 text-xs">
            <span className="text-[10px] text-slate-500 font-mono px-2">THEME:</span>
            {(["neon", "sunset", "matrix", "monochrome"] as const).map((th) => (
              <button
                key={th}
                id={`vis-theme-${th}`}
                onClick={() => setVisualizerTheme(th)}
                className={`px-2 py-1 rounded-lg capitalize transition-all text-[11px] ${
                  visualizerTheme === th
                    ? "bg-slate-800 text-brand-light border border-slate-700/60 font-semibold"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {th}
              </button>
            ))}
          </div>

          {/* Core Layout Trigger */}
          <div className="flex bg-slate-900/80 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              id="layout-btn-mobile"
              onClick={() => setLayoutMode("mobile")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
                layoutMode === "mobile"
                  ? "bg-brand text-white shadow-lg shadow-brand/20 font-semibold"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Mobile shell</span>
            </button>
            <button
              id="layout-btn-dashboard"
              onClick={() => setLayoutMode("dashboard")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
                layoutMode === "dashboard"
                  ? "bg-brand text-white shadow-lg shadow-brand/20 font-semibold"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Studio Grid</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Framework Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto flex items-center justify-center">
        {layoutMode === "mobile" ? (
          /* ========================================================= */
          /* 📱 PREMIUM PORTRAIT ANDROID SIMULATOR                      */
          /* ========================================================= */
          <div className="relative w-full max-w-[390px] h-[780px] rounded-[48px] border-8 border-slate-800 bg-slate-950 shadow-2xl flex flex-col overflow-hidden ring-4 ring-slate-900 ring-offset-4 ring-offset-slate-950">
            {/* Front physical camera notch & ears */}
            <div className="absolute top-0 inset-x-0 h-7 flex items-center justify-between px-8 text-[11px] font-sans font-semibold text-slate-350 z-50 pointer-events-none select-none bg-slate-950/60 backdrop-blur-md">
              <span>{sysTime}</span>
              {/* Selfie Camera punch hole */}
              <div className="w-14 h-4 rounded-full bg-slate-950 border border-slate-800 flex items-center justify-end pr-2 shrink-0">
                <div className="w-2 h-2 rounded-full bg-slate-900 border border-indigo-950" />
              </div>
              <div className="flex items-center gap-1.5">
                <Wifi className="w-3.5 h-3.5" />
                <Battery className="w-4 h-4 text-emerald-400 fill-emerald-400" />
              </div>
            </div>

            {/* Android Device Sub-Screen Content Area */}
            <div className="flex-1 flex flex-col pt-8 pb-4 relative overflow-hidden bg-slate-950">
              {/* Dynamic ambient halo circle glow behind album art */}
              <div className="absolute top-[10%] left-1/2 -translate-x-1/2 w-72 h-72 rounded-full bg-brand/10 blur-[80px] pointer-events-none z-0" />

              {/* Sub-panels (tabbed) inside Mobile Shell */}
              <div className="flex-1 overflow-y-auto px-5 pt-3 select-none flex flex-col gap-4 relative z-10">
                {mobileTab === "player" && (
                  <div className="flex-1 flex flex-col justify-between py-2 gap-4">
                    
                    {/* Header track artist info */}
                    <div className="text-center pt-2">
                      <span className="text-[10px] uppercase tracking-widest font-mono text-brand font-semibold bg-brand-transparent border border-brand/25 px-2.5 py-0.5 rounded-full select-none">
                        Now Playing
                      </span>
                    </div>

                    {/* Classic rotating active record or cover widget */}
                    <div className="flex items-center justify-center my-2">
                      <div className="relative group p-0.5">
                        {/* Outer rotating color halo */}
                        <div className={`absolute inset-0 rounded-full bg-gradient-to-tr from-brand-dark via-brand to-brand-light blur transition-all ${
                          isPlaying ? "animate-[spin_4s_linear_infinite]" : "opacity-30"
                        }`} />
                        
                        {/* High fidelity album disk container */}
                        <div className={`relative w-56 h-56 rounded-full overflow-hidden border-4 border-slate-900 shadow-2xl shrink-0 ${
                          isPlaying ? "animate-[spin_18s_linear_infinite]" : ""
                        }`}>
                          <img
                            src={currentTrack.coverUrl}
                            alt={currentTrack.title}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover select-none"
                          />
                          {/* Inner Vinyl Ring Mask */}
                          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(0,0,0,0.85)_46%,rgba(0,0,0,0.95)_55%,transparent_56%)] pointer-events-none" />
                          {/* Center Spindle pinhole notch */}
                          <div className="absolute inset-0 margin-auto w-12 h-12 bg-slate-950 border-4 border-slate-900 rounded-full flex items-center justify-center pointer-events-none left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                            <div className="w-3 h-3 bg-brand rounded-full" />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Track metadata titles */}
                    <div className="text-center">
                      <h2 className="text-lg font-bold tracking-tight text-white select-text font-display">
                        {currentTrack.title}
                      </h2>
                      <p className="text-xs text-brand-light font-medium tracking-wide mt-1 select-text">
                        {currentTrack.artist} • <span className="text-slate-400">{currentTrack.album}</span>
                      </p>
                    </div>

                    {/* Integrated Canvas Spectrum Visualizer */}
                    <div className="w-full mt-1">
                      <AudioVisualizer
                        analyser={analyser}
                        isPlaying={isPlaying}
                        visualizerTheme={visualizerTheme}
                      />
                    </div>

                    {/* Compact timeline bar indicators */}
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 px-1">
                        <span>{formatTime(currentTime)}</span>
                        <span>{formatTime(duration)}</span>
                      </div>
                      
                      <div className="relative group w-full h-1.5 bg-slate-800 rounded-full cursor-pointer flex items-center justify-center p-0">
                        <div
                          className="absolute left-0 top-0 h-full bg-gradient-to-r from-brand-dark to-brand-light rounded-full pointer-events-none"
                          style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
                        />
                        <input
                          id="mobile-progress-bar"
                          type="range"
                          min="0"
                          max={duration || 100}
                          step="0.1"
                          value={currentTime}
                          onChange={handleSeek}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer accent-brand"
                          aria-label="Track progress slider control"
                        />
                        {/* Round seek head indicator */}
                        <div
                          className="absolute w-3.5 h-3.5 rounded-full bg-white border border-brand shadow pointer-events-none transition-transform"
                          style={{ left: `calc(${(currentTime / (duration || 1)) * 100}% - 7px)` }}
                        />
                      </div>
                    </div>

                    {/* Master Media playback key pad */}
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between px-2">
                        {/* Shuffle button */}
                        <button
                          id="mobile-shuffle-btn"
                          onClick={() => setIsShuffle(!isShuffle)}
                          className={`p-2 rounded-xl transition-all ${
                            isShuffle
                              ? "bg-brand/15 text-brand-light font-bold border border-brand/20"
                              : "text-slate-400 hover:text-white"
                          }`}
                          title="Shuffle Mode"
                        >
                          <Shuffle className="w-4 h-4" />
                        </button>

                        <div className="flex items-center gap-3">
                          {/* Fast Rewind */}
                          <button
                            id="mobile-rewind-btn"
                            onClick={handleFastRewind}
                            className="p-2 rounded-xl bg-slate-900 border border-slate-800/80 hover:bg-slate-800 text-slate-350 transition-all cursor-pointer inline-flex items-center"
                            title="Rewind 10s"
                          >
                            <FastForward className="w-4 h-4 rotate-180" />
                          </button>

                          {/* Skip Back */}
                          <button
                            id="mobile-prev-btn"
                            onClick={handlePrevTrack}
                            className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-white transition-all cursor-pointer"
                            title="Previous Song"
                          >
                            <SkipBack className="w-4 h-4 fill-white" />
                          </button>

                          {/* Play-Pause Ring */}
                          <button
                            id="mobile-play-btn"
                            onClick={togglePlay}
                            className="p-5 rounded-full bg-brand hover:bg-brand-light text-white transition-transform duration-300 transform active:scale-95 shadow-lg shadow-brand/25 cursor-pointer flex items-center justify-center outline-none ring-2 ring-white/10"
                            title="Play/Pause Menu"
                          >
                            {isPlaying ? (
                              <Pause className="w-6 h-6 fill-white" />
                            ) : (
                              <Play className="w-6 h-6 fill-white ml-0.5" />
                            )}
                          </button>

                          {/* Skip Forward */}
                          <button
                            id="mobile-next-btn"
                            onClick={() => handleNextTrack(true)}
                            className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-white transition-all cursor-pointer"
                            title="Next Song"
                          >
                            <SkipForward className="w-4 h-4 fill-white" />
                          </button>

                          {/* Fast Forward */}
                          <button
                            id="mobile-forward-btn"
                            onClick={handleFastForward}
                            className="p-2 rounded-xl bg-slate-900 border border-slate-800/80 hover:bg-slate-800 text-slate-350 transition-all cursor-pointer"
                            title="Forward 10s"
                          >
                            <FastForward className="w-4 h-4" />
                          </button>
                        </div>
                        {/* Repeat button mode selector */}
                        <button
                          id="mobile-repeat-btn"
                          onClick={() => {
                            if (repeatMode === "off") setRepeatMode("all");
                            else if (repeatMode === "all") setRepeatMode("one");
                            else setRepeatMode("off");
                          }}
                          className={`p-2 rounded-xl border transition-all flex items-center justify-center relative ${
                            repeatMode !== "off"
                              ? "bg-brand/15 text-brand border-brand/20 animate-pulse"
                              : "text-slate-400 hover:text-white border-transparent"
                          }`}
                          title={`Repeat Mode: ${repeatMode}`}
                        >
                          <Repeat className="w-4 h-4" />
                          {repeatMode === "one" && (
                            <span className="absolute right-0.5 bottom-0.5 text-[8px] font-extrabold bg-brand text-white rounded-full h-3 w-3 flex items-center justify-center ring-1 ring-slate-900 scale-90">
                              1
                            </span>
                          )}
                        </button>
                      </div>

                      {/* Precise Volume bar */}
                      <div className="flex items-center gap-2.5 px-3 bg-slate-900/40 py-2 rounded-2xl border border-slate-800/40">
                        <button
                          id="mobile-mute-btn"
                          onClick={() => setIsMuted(!isMuted)}
                          className="text-brand-light hover:text-white transition-colors"
                        >
                          {isMuted ? (
                            <VolumeX className="w-4 h-4 text-rose-450" />
                          ) : (
                            <Volume2 className="w-4 h-4" />
                          )}
                        </button>
                        <input
                          id="mobile-volume-slider"
                          type="range"
                          min="0"
                          max="1"
                          step="0.01"
                          value={volume}
                          onChange={(e) => {
                            setVolume(parseFloat(e.target.value));
                            if (isMuted) setIsMuted(false);
                          }}
                          className="flex-1 h-1 rounded-full cursor-pointer bg-slate-800 accent-brand"
                          aria-label="Volume slider"
                        />
                        <span className="text-[10px] font-mono text-slate-400 w-8 text-right select-none">
                          {isMuted ? "0" : Math.round(volume * 100)}%
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Sub-panels: Lyrics inside mobile scroll */}
                {mobileTab === "lyrics" && (
                  <div className="flex-1 flex flex-col pt-1">
                    <SyncedLyrics
                      track={currentTrack}
                      currentTime={currentTime}
                      onLyricsUpdate={handleLyricsUpdate}
                    />
                  </div>
                )}

                {/* Sub-panels: Equalizer inside mobile scroll */}
                {mobileTab === "eq" && (
                  <div className="flex-1 flex flex-col pt-1">
                    <EqualizerPanel
                      gains={gains}
                      onGainChange={handleGainChange}
                      onPresetSelect={handlePresetSelect}
                    />
                  </div>
                )}

                {/* Sub-panels: Track-list playlist manager inside mobile scroll */}
                {mobileTab === "playlist" && (
                  <div className="flex-1 flex flex-col pt-1">
                    <TrackList
                      tracks={tracks}
                      currentTrackId={currentTrackId}
                      isPlaying={isPlaying}
                      onTrackSelect={handleTrackSelect}
                      onTrackUpload={handleTrackUpload}
                      onTrackDelete={handleTrackDelete}
                    />
                  </div>
                )}
              </div>

              {/* Bottom virtual Navigation System Buttons (Android Navigation Hub) */}
              <nav className="h-[58px] bg-slate-900/90 border-t border-slate-800/80 grid grid-cols-4 items-center px-2 relative z-20 shrink-0">
                <button
                  id="tab-btn-player"
                  onClick={() => setMobileTab("player")}
                  className={`flex flex-col items-center justify-center gap-1 py-1 transition-all ${
                    mobileTab === "player" ? "text-brand font-bold" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Music className="w-4 h-4" />
                  <span className="text-[10px]">Player</span>
                </button>
                <button
                  id="tab-btn-lyrics"
                  onClick={() => setMobileTab("lyrics")}
                  className={`flex flex-col items-center justify-center gap-1 py-1 transition-all ${
                    mobileTab === "lyrics" ? "text-brand font-bold" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Activity className="w-4 h-4" />
                  <span className="text-[10px]">Lyrics</span>
                </button>
                <button
                  id="tab-btn-eq"
                  onClick={() => setMobileTab("eq")}
                  className={`flex flex-col items-center justify-center gap-1 py-1 transition-all ${
                    mobileTab === "eq" ? "text-brand font-bold" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Sliders className="w-4 h-4" />
                  <span className="text-[10px]">Equalizer</span>
                </button>
                <button
                  id="tab-btn-playlist"
                  onClick={() => setMobileTab("playlist")}
                  className={`flex flex-col items-center justify-center gap-1 py-1 transition-all ${
                    mobileTab === "playlist" ? "text-brand font-bold" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <LayoutGrid className="w-4 h-4" />
                  <span className="text-[10px]">Tracks</span>
                </button>

                {/* Bottom Gesture pill notch anchor */}
                <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-28 h-1 bg-slate-750 rounded-full" />
              </nav>
            </div>
          </div>
        ) : (
          /* ========================================================= */
          /* 🖥️ LANDSCAPE STUDIO MIXER BENTO DASHBOARD                   */
          /* ========================================================= */
          <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-6 items-start pb-10">
            {/* Left Column: Player Vinyl + Visualizer Spectrum (large) */}
            <div className="lg:col-span-4 flex flex-col gap-6">
              <div className="w-full bg-slate-900/60 backdrop-blur-xl border border-slate-800/70 p-6 rounded-3xl flex flex-col justify-between h-[420px] relative overflow-hidden group">
                {/* Visual anchor logo */}
                <div className="absolute top-4 left-4 flex items-center gap-1">
                  <span className="text-[10px] bg-slate-950 border border-brand/25 px-2 py-0.5 rounded-full font-mono text-brand uppercase tracking-widest leading-none font-semibold">
                    Studio Core
                  </span>
                </div>

                <div className="flex h-full flex-col justify-center items-center gap-6 mt-3">
                  {/* Rotating Vinyl disk */}
                  <div className="relative p-0.5">
                    <div className={`absolute inset-0 rounded-full bg-gradient-to-tr from-brand-dark via-brand to-brand-light blur transition-all ${
                      isPlaying ? "animate-[spin_4s_linear_infinite]" : "opacity-30"
                    }`} />
                    
                    <div className={`relative w-44 h-44 rounded-full overflow-hidden border-4 border-slate-950 shadow-2xl shrink-0 ${
                      isPlaying ? "animate-[spin_18s_linear_infinite]" : ""
                    }`}>
                      <img
                        src={currentTrack.coverUrl}
                        alt={currentTrack.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover select-none"
                      />
                      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(0,0,0,0.85)_46%,rgba(0,0,0,0.95)_55%,transparent_56%)] pointer-events-none" />
                      <div className="absolute inset-0 margin-auto w-10 h-10 bg-slate-950 border-4 border-slate-905 rounded-full flex items-center justify-center pointer-events-none left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                        <div className="w-2 h-2 bg-brand rounded-full" />
                      </div>
                    </div>
                  </div>

                  {/* Metadata display */}
                  <div className="text-center w-full">
                    <h2 className="text-xl font-bold tracking-tight text-white line-clamp-1 select-text font-display">
                      {currentTrack.title}
                    </h2>
                    <p className="text-xs text-brand-light font-medium tracking-wide mt-1 select-text">
                      {currentTrack.artist} • <span className="text-slate-400">{currentTrack.album}</span>
                    </p>
                  </div>
                </div>

                {/* Volume slider controls */}
                <div className="flex items-center gap-2.5 px-3 bg-slate-950/40 py-2 rounded-2xl border border-slate-800/30">
                  <button
                    id="deck-mute-btn"
                    onClick={() => setIsMuted(!isMuted)}
                    className="text-brand hover:text-white transition-colors"
                  >
                    {isMuted ? (
                      <VolumeX className="w-4 h-4 text-rose-450" />
                    ) : (
                      <Volume2 className="w-4 h-4" />
                    )}
                  </button>
                  <input
                    id="deck-volume-slider"
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={volume}
                    onChange={(e) => {
                      setVolume(parseFloat(e.target.value));
                      if (isMuted) setIsMuted(false);
                    }}
                    className="flex-1 h-1 rounded-full cursor-pointer bg-slate-800 accent-brand"
                    aria-label="Studio master volume control slider"
                  />
                  <span className="text-[10px] font-mono text-slate-400 w-8 text-right select-none">
                    {isMuted ? "0" : Math.round(volume * 100)}%
                  </span>
                </div>
              </div>

              {/* Connected Visualizer underneath Player Cover */}
              <div className="w-full">
                <AudioVisualizer
                  analyser={analyser}
                  isPlaying={isPlaying}
                  visualizerTheme={visualizerTheme}
                />
              </div>

              {/* Master Media Controllers Frame */}
              <div className="w-full bg-slate-900/60 backdrop-blur-xl border border-slate-800/70 p-5 rounded-3xl flex flex-col gap-4 text-white">
                {/* Slider progress */}
                <div className="flex flex-col gap-1 px-1">
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-500">
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(duration)}</span>
                  </div>

                  <div className="relative group w-full h-1.5 bg-slate-850 rounded-full cursor-pointer flex items-center justify-center p-0 mt-0.5">
                    <div
                      className="absolute left-0 top-0 h-full bg-gradient-to-r from-brand-dark to-brand-light rounded-full pointer-events-none animate-pulse"
                      style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
                    />
                    <input
                      id="studio-progress-bar"
                      type="range"
                      min="0"
                      max={duration || 100}
                      step="0.1"
                      value={currentTime}
                      onChange={handleSeek}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer accent-brand"
                      aria-label="Studio track scrubbing progress slider control"
                    />
                    <div
                      className="absolute w-3.5 h-3.5 rounded-full bg-white border border-brand shadow pointer-events-none transition-transform"
                      style={{ left: `calc(${(currentTime / (duration || 1)) * 100}% - 7px)` }}
                    />
                  </div>
                </div>

                {/* Grid layout for buttons */}
                <div className="flex items-center justify-between">
                  {/* Shuffle click */}
                  <button
                    id="studio-shuffle-btn"
                    onClick={() => setIsShuffle(!isShuffle)}
                    className={`p-2.5 rounded-xl border transition-all ${
                      isShuffle
                        ? "bg-brand/15 text-brand-light border-brand/20 font-semibold"
                        : "text-slate-400 hover:text-white border-transparent"
                    }`}
                    title="Toggle Shuffle"
                  >
                    <Shuffle className="w-4.5 h-4.5" />
                  </button>

                  <div className="flex items-center gap-2">
                    {/* Fast Rewind */}
                    <button
                      id="studio-rewind-btn"
                      onClick={handleFastRewind}
                      className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 hover:bg-slate-850 text-slate-350 transition-all cursor-pointer inline-flex items-center"
                      title="Rewind 10s"
                    >
                      <FastForward className="w-4.5 h-4.5 rotate-180" />
                    </button>

                    {/* Skip Back */}
                    <button
                      id="studio-prev-btn"
                      onClick={handlePrevTrack}
                      className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 hover:bg-slate-850 text-white transition-all cursor-pointer"
                      title="Previous Song"
                    >
                      <SkipBack className="w-4.5 h-4.5 fill-white" />
                    </button>

                    {/* Primary Play Pause Button */}
                    <button
                      id="studio-play-btn"
                      onClick={togglePlay}
                      className="p-4.5 rounded-full bg-brand hover:bg-brand-light text-white transition-transform duration-200 transform active:scale-95 shadow-xl shadow-brand/20 cursor-pointer flex items-center justify-center ring-2 ring-brand/25"
                      title="Play/Pause"
                    >
                      {isPlaying ? (
                        <Pause className="w-5.5 h-5.5 fill-white" />
                      ) : (
                        <Play className="w-5.5 h-5.5 fill-white ml-0.5" />
                      )}
                    </button>

                    {/* Skip Forward */}
                    <button
                      id="studio-next-btn"
                      onClick={() => handleNextTrack(true)}
                      className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 hover:bg-slate-850 text-white transition-all cursor-pointer"
                      title="Next Song"
                    >
                      <SkipForward className="w-4.5 h-4.5 fill-white" />
                    </button>

                    {/* Fast Forward */}
                    <button
                      id="studio-forward-btn"
                      onClick={handleFastForward}
                      className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 hover:bg-slate-850 text-slate-350 transition-all cursor-pointer"
                      title="Forward 10s"
                    >
                      <FastForward className="w-4.5 h-4.5" />
                    </button>
                  </div>

                  {/* Repeat configuration */}
                  <button
                    id="studio-repeat-btn"
                    onClick={() => {
                      if (repeatMode === "off") setRepeatMode("all");
                      else if (repeatMode === "all") setRepeatMode("one");
                      else setRepeatMode("off");
                    }}
                    className={`p-2.5 rounded-xl border transition-all flex items-center justify-center relative ${
                      repeatMode !== "off"
                        ? "bg-brand/15 text-brand border-brand/20"
                        : "text-slate-400 hover:text-white border-transparent"
                    }`}
                    title={`Repeat Mode: ${repeatMode}`}
                  >
                    <Repeat className="w-4.5 h-4.5" />
                    {repeatMode === "one" && (
                      <span className="absolute right-0.5 bottom-0.5 text-[8px] font-bold bg-brand text-white rounded-full h-3 w-3 flex items-center justify-center ring-1 ring-slate-900 scale-90">
                        1
                      </span>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Right Columns Grid: Equalizer Panel (top), Lyrics and Playlist side-by-side */}
            <div className="lg:col-span-8 flex flex-col gap-6">
              {/* Equalizer module spanning full right top width */}
              <div className="w-full">
                <EqualizerPanel
                  gains={gains}
                  onGainChange={handleGainChange}
                  onPresetSelect={handlePresetSelect}
                />
              </div>

              {/* Lyrics Panel + Upload-Playlist Panel bottom Row Side by Side */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
                {/* Apple-music-like Synced Lyrics Module */}
                <SyncedLyrics
                  track={currentTrack}
                  currentTime={currentTime}
                  onLyricsUpdate={handleLyricsUpdate}
                />

                {/* Audio library uploader module */}
                <TrackList
                  tracks={tracks}
                  currentTrackId={currentTrackId}
                  isPlaying={isPlaying}
                  onTrackSelect={handleTrackSelect}
                  onTrackUpload={handleTrackUpload}
                  onTrackDelete={handleTrackDelete}
                />
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Humble Technical Help footer area */}
      <footer className="max-w-7xl w-full mx-auto mt-auto pt-6 border-t border-slate-800/40 text-[11px] text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-4 select-none shrink-0 border-transparent">
        <span className="flex items-center gap-1">
          <Info className="w-3.5 h-3.5 text-brand" />
          Tip: You can drag in local <b>.mp3</b> or <b>.flac</b> media to populate your personalized library.
        </span>
        <div className="text-[10px] uppercase font-mono tracking-wider flex items-center gap-2">
          <span>HTML5 WebAudio Context</span>
          <span>•</span>
          <span className="text-brand-light font-bold">2026 Edition</span>
        </div>
      </footer>
    </div>
  );
}
