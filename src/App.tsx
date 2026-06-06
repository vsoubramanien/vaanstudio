import React, { useState, useRef, useEffect } from "react";
import { SAMPLE_TRACKS } from "./data/sampleTracks";
import { Track } from "./types";
import vaanLogo from "./assets/images/vaan_logo_1780250156730.png";
import AudioVisualizer from "./components/AudioVisualizer";
import EqualizerPanel from "./components/EqualizerPanel";
import SyncedLyrics from "./components/SyncedLyrics";
import TrackList from "./components/TrackList";
import {
  saveTrackToDB,
  deleteTrackFromDB,
  getAllTracksFromDB
} from "./utils/db";

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
  Palette,
  Wifi,
  Battery,
  HardDriveUpload,
  FastForward,
  Rewind,
  Flame,
  Info
} from "lucide-react";

// Generate a synthetic, exponentially decaying stereo impulse response for the reverb convolver
function createReverbImpulseResponse(ctx: AudioContext, duration: number, decay: number = 2.0): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.max(1, Math.round(sampleRate * duration));
  const impulse = ctx.createBuffer(2, length, sampleRate);
  const left = impulse.getChannelData(0);
  const right = impulse.getChannelData(1);
  for (let i = 0; i < length; i++) {
    const percent = i / length;
    // Declining random noise with exponential decay
    const valLeft = (Math.random() * 2 - 1) * Math.pow(1 - percent, decay);
    const valRight = (Math.random() * 2 - 1) * Math.pow(1 - percent, decay);
    left[i] = valLeft;
    right[i] = valRight;
  }
  return impulse;
}

export default function App() {
  // State definitions
  const [tracks, setTracks] = useState<Track[]>(SAMPLE_TRACKS);
  const [currentTrackId, setCurrentTrackId] = useState<string>(SAMPLE_TRACKS[0]?.id || "");
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolume] = useState<number>(0.8);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [repeatMode, setRepeatMode] = useState<"off" | "one" | "all">("all");
  const [isShuffle, setIsShuffle] = useState<boolean>(false);
  const [layoutMode, setLayoutMode] = useState<"mobile" | "dashboard">("mobile");
  
  // Equalizer gains corresponding to [40, 125, 400, 1000, 2500, 6000, 15000] Hz
  const [gains, setGains] = useState<number[]>([0, 0, 0, 0, 0, 0, 0]);
  const [visualizerTheme, setVisualizerTheme] = useState<"neon" | "sunset" | "matrix" | "monochrome">("neon");
  const [visualizerStyle, setVisualizerStyle] = useState<"bars" | "radial" | "grid" | "oscilloscope">("bars");
  const [mobileTab, setMobileTab] = useState<"player" | "lyrics" | "eq" | "playlist" | "visuals">("playlist");

  // Expanded DSP FX States
  const [bassBoost, setBassBoost] = useState<number>(0); // 0 to 12 dB
  const [reverbWet, setReverbWet] = useState<number>(0); // 0.0 to 1.0 (wet level)
  const [reverbSize, setReverbSize] = useState<number>(2.0); // 0.5 to 4.0 seconds field size
  const [pan, setPan] = useState<number>(0); // -1.0 (L) to 1.0 (R)

  // System Clock for Android status bar
  const [sysTime, setSysTime] = useState("14:18");

  // Audio References
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const filtersRef = useRef<BiquadFilterNode[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  // Expanded DSP Node References
  const bassBoostRef = useRef<BiquadFilterNode | null>(null);
  const convolverRef = useRef<ConvolverNode | null>(null);
  const wetGainRef = useRef<GainNode | null>(null);
  const dryGainRef = useRef<GainNode | null>(null);
  const pannerRef = useRef<StereoPannerNode | null>(null);

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

  // Restore persisted tracks list and selection on mount
  useEffect(() => {
    const loadPersistedTracks = async () => {
      try {
        const persistedTracks = await getAllTracksFromDB();
        if (persistedTracks && persistedTracks.length > 0) {
          setTracks(persistedTracks);
          const savedTrackId = localStorage.getItem("currentTrackId");
          if (savedTrackId && persistedTracks.some((t) => t.id === savedTrackId)) {
            setCurrentTrackId(savedTrackId);
          } else {
            setCurrentTrackId(persistedTracks[0].id);
          }
        } else {
          setTracks(SAMPLE_TRACKS);
          if (SAMPLE_TRACKS.length > 0) {
            setCurrentTrackId(SAMPLE_TRACKS[0].id);
          }
        }
      } catch (err) {
        console.error("Failed to load tracks from DB on startup:", err);
        setTracks(SAMPLE_TRACKS);
      }
    };
    loadPersistedTracks();
  }, []);

  // Save currentTrackId to localStorage on change
  useEffect(() => {
    if (currentTrackId) {
      localStorage.setItem("currentTrackId", currentTrackId);
    }
  }, [currentTrackId]);

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

        // 1. Create Bass Boost Bass Node (lowshelf filter)
        const bassBoostNode = ctx.createBiquadFilter();
        bassBoostNode.type = "lowshelf";
        bassBoostNode.frequency.value = 100; // Bass-frequency limit
        bassBoostNode.gain.value = bassBoost;
        bassBoostRef.current = bassBoostNode;

        // 2. Build 7-band Equalizer chain (Peaking filters)
        const frequencies = [40, 125, 400, 1000, 2500, 6000, 15000];
        const filters = frequencies.map((freq, idx) => {
          const filter = ctx.createBiquadFilter();
          filter.type = "peaking";
          filter.frequency.value = freq;
          filter.Q.value = 1.0;
          filter.gain.value = gains[idx];
          return filter;
        });
        filtersRef.current = filters;

        // 3. Create Reverb convolver block: convolverNode, wetGainNode, dryGainNode
        const convolver = ctx.createConvolver();
        try {
          convolver.buffer = createReverbImpulseResponse(ctx, reverbSize, 2.0);
        } catch (e) {
          console.error("Failed to generate reverb impulse buffer during init:", e);
        }
        convolverRef.current = convolver;

        const wetGainNode = ctx.createGain();
        wetGainNode.gain.value = reverbWet;
        wetGainRef.current = wetGainNode;

        const dryGainNode = ctx.createGain();
        dryGainNode.gain.value = 1.0 - reverbWet * 0.3;
        dryGainRef.current = dryGainNode;

        // Create AnalyserNode for audio visualization
        const analyserNode = ctx.createAnalyser();
        analyserNode.fftSize = 256;
        analyserRef.current = analyserNode;
        setAnalyser(analyserNode);

        // Connections:
        // source -> bassBoostNode -> filter[0] -> ... -> filter[4]
        source.connect(bassBoostNode);

        let previousNode: AudioNode = bassBoostNode;
        filters.forEach((filter) => {
          previousNode.connect(filter);
          previousNode = filter;
        });

        // Split standard signal to reverb (convolver -> wetGainNode) and dry path (dryGainNode)
        const eqOutput = previousNode;
        eqOutput.connect(dryGainNode);
        eqOutput.connect(convolver);
        convolver.connect(wetGainNode);

        // Setup Panner (StereoPannerNode) conditionally
        if (ctx.createStereoPanner) {
          const panner = ctx.createStereoPanner();
          panner.pan.value = pan;
          pannerRef.current = panner;

          dryGainNode.connect(panner);
          wetGainNode.connect(panner);
          panner.connect(analyserNode);
        } else {
          dryGainNode.connect(analyserNode);
          wetGainNode.connect(analyserNode);
        }

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
    if (filtersRef.current.length === 7) {
      filtersRef.current.forEach((filter, idx) => {
        filter.gain.setValueAtTime(gains[idx], audioCtxRef.current?.currentTime || 0);
      });
    }
  }, [gains]);

  // Sync Bass Boost dynamically with state updates
  useEffect(() => {
    if (bassBoostRef.current) {
      bassBoostRef.current.gain.setValueAtTime(bassBoost, audioCtxRef.current?.currentTime || 0);
    }
  }, [bassBoost]);

  // Sync Stereo Pan dynamically with state updates
  useEffect(() => {
    if (pannerRef.current) {
      pannerRef.current.pan.setValueAtTime(pan, audioCtxRef.current?.currentTime || 0);
    }
  }, [pan]);

  // Sync Reverb wet level (wet mix) dynamically with state updates
  useEffect(() => {
    if (wetGainRef.current) {
      wetGainRef.current.gain.setValueAtTime(reverbWet, audioCtxRef.current?.currentTime || 0);
    }
    if (dryGainRef.current) {
      dryGainRef.current.gain.setValueAtTime(1.0 - reverbWet * 0.3, audioCtxRef.current?.currentTime || 0);
    }
  }, [reverbWet]);

  // Sync Reverb size / decay (impulse buffer regen) dynamically with state updates
  useEffect(() => {
    const ctx = audioCtxRef.current;
    if (ctx && convolverRef.current) {
      try {
        convolverRef.current.buffer = createReverbImpulseResponse(ctx, reverbSize, 2.0);
      } catch (err) {
        console.warn("Failed to update convolver buffer dynamically:", err);
      }
    }
  }, [reverbSize]);

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
  const handleTrackUpload = (newTrack: Track, file?: File) => {
    setTracks((prev) => [...prev, newTrack]);
    saveTrackToDB(newTrack, file).catch((err) =>
      console.error("Failed to save track to DB:", err)
    );
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
    deleteTrackFromDB(trackId).catch((err) =>
      console.error("Failed to delete track from DB:", err)
    );
  };

  // Lyrics updating helper (for editing or auto-generating timestamps)
  const handleLyricsUpdate = (
    trackId: string,
    plainLyrics: string,
    syncedLyrics?: { time: number; text: string }[]
  ) => {
    setTracks((prev) => {
      const updated = prev.map((t) =>
        t.id === trackId
          ? { ...t, lyrics: plainLyrics, syncedLyrics: syncedLyrics }
          : t
      );
      const trackToSave = updated.find((t) => t.id === trackId);
      if (trackToSave) {
        saveTrackToDB(trackToSave).catch((err) =>
          console.error("Failed to save updated lyrics to DB:", err)
        );
      }
      return updated;
    });
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
    <div className={`h-screen bg-slate-950 text-slate-100 flex flex-col font-sans transition-all duration-700 bg-gradient-to-b ${getAmbientBgColor()} p-3 md:p-4.5 overflow-hidden`}>
      
      {/* Invisible HTML5 Audio back-end engine */}
      <audio
        ref={audioRef}
        src={currentTrack?.src || undefined}
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

      {/* Main Framework Viewport */}
      <main className={`flex-1 max-w-7xl w-full mx-auto flex items-stretch justify-center min-h-0 ${layoutMode === "mobile" ? "overflow-hidden" : "overflow-y-auto scrollbar-thin pr-1"}`}>
        {layoutMode === "mobile" ? (
          /* ========================================================= */
          /* 📱 CUSTOM TABLET INTERFACE VIEWPORT                       */
          /* ========================================================= */
          <div className="relative w-full h-full flex-1 min-h-0 rounded-3xl border border-slate-800/80 bg-slate-950 shadow-2xl flex flex-col overflow-hidden mx-auto animate-fade-in">

            {/* Tablet Sub-Screen Content Area */}
            <div className="flex-1 flex flex-col pt-2 relative overflow-hidden bg-slate-950">
              {/* Dynamic ambient halo circle glow behind tablet desktop */}
              <div className="absolute top-[20%] left-[25%] w-96 h-96 rounded-full bg-brand/10 blur-[100px] pointer-events-none z-0" />
              <div className="absolute top-[40%] right-[20%] w-80 h-80 rounded-full bg-brand-light/5 blur-[120px] pointer-events-none z-0" />

              {/* Tablet native internal app header */}
              <div className="px-6 pt-3 pb-1 flex items-center justify-between shrink-0 relative z-20">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 bg-brand/10 border border-brand/20 px-2 py-0.5 rounded">
                    <img
                      src={vaanLogo}
                      alt="Vaan Logo"
                      className="w-3.5 h-3.5 object-cover rounded-sm"
                      referrerPolicy="no-referrer"
                    />
                    <span className="text-xs font-bold font-display tracking-tight text-white uppercase">Vaan Player</span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono tracking-wider select-none">PREMIUM AUDIO DECK</span>
                </div>
                
                {/* Clean App Layout Switcher inside Tablet */}
                <div className="flex bg-slate-900/80 p-0.5 rounded-lg border border-slate-805 text-[10px]">
                  <button
                    id="layout-btn-mobile"
                    onClick={() => setLayoutMode("mobile")}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-all cursor-pointer font-medium ${
                      layoutMode === "mobile"
                        ? "bg-brand text-white shadow-sm font-semibold"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    <Smartphone className="w-3 h-3" />
                    <span>Tablet</span>
                  </button>
                  <button
                    id="layout-btn-dashboard"
                    onClick={() => setLayoutMode("dashboard")}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-all cursor-pointer font-medium ${
                      layoutMode === "dashboard"
                        ? "bg-brand text-white shadow-sm font-semibold"
                        : "text-slate-450 hover:text-white"
                    }`}
                  >
                    <LayoutGrid className="w-3 h-3" />
                    <span>Studio Grid</span>
                  </button>
                </div>
              </div>

              {/* Main Split Grid inside Landscape Tablet */}
              <div className="flex-1 grid grid-cols-12 gap-5 p-4 pb-5 overflow-hidden relative z-10">
                
                {/* LEFT CONSOLE COLUMN: Interactive Music Player & Deck Track info */}
                <div className="col-span-12 md:col-span-5 flex flex-col justify-between h-full overflow-hidden bg-slate-900/25 border border-slate-800/40 p-3.5 rounded-2xl backdrop-blur-sm">
                  
                  {/* High Quality Vinyl Disk rotation widget */}
                  <div className="flex items-center justify-center my-1 shrink-0">
                    <div className="relative group p-0.5">
                      {/* Outer rotating color halo */}
                      <div className={`absolute inset-0 rounded-full bg-gradient-to-tr from-brand-dark via-brand to-brand-light blur transition-all ${
                        isPlaying ? "animate-[spin_4s_linear_infinite]" : "opacity-30"
                      }`} />
                      
                      {/* Vinyl body */}
                      <div className={`relative w-28 h-28 rounded-full overflow-hidden border-4 border-slate-900 shadow-2xl shrink-0 ${
                        isPlaying ? "animate-[spin_18s_linear_infinite]" : ""
                      }`}>
                        <img
                          src={currentTrack?.coverUrl || vaanLogo}
                          alt={currentTrack?.title || "Vaan Music Player"}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover select-none"
                        />
                        {/* Vinyl inner ring texture mask */}
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(0,0,0,0.85)_46%,rgba(0,0,0,0.95)_55%,transparent_56%)] pointer-events-none" />
                        {/* Center spindle */}
                        <div className="absolute inset-0 margin-auto w-8 h-8 bg-slate-950 border-4 border-slate-900 rounded-full flex items-center justify-center pointer-events-none left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                          <div className="w-2 h-2 bg-brand rounded-full" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Metadata display */}
                  <div className="text-center shrink-0 mt-1.5">
                    <h2 className="text-base font-bold tracking-tight text-white line-clamp-1 font-display">
                      {currentTrack?.title || "Library is empty"}
                    </h2>
                    <p className="text-xs text-brand-light font-medium mt-0.5 truncate">
                      {currentTrack ? (
                        <>
                          {currentTrack.artist} • <span className="text-slate-400">{currentTrack.album}</span>
                        </>
                      ) : (
                        "Upload tracks on the right to start"
                      )}
                    </p>
                  </div>

                  {/* Integrated Canvas Spectrum Visualizer */}
                  <div className="w-full h-24 mt-2 shrink-0 bg-slate-950/50 border border-slate-800/50 rounded-xl overflow-hidden px-1.5 py-0.5">
                    <AudioVisualizer
                      analyser={analyser}
                      isPlaying={isPlaying}
                      visualizerTheme={visualizerTheme}
                      visualizerStyle={visualizerStyle}
                      heightClass="h-full"
                    />
                  </div>

                  {/* Timeline Scrubbing Bar */}
                  <div className="flex flex-col gap-0.5 mt-2.5 shrink-0">
                    <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 px-1 font-semibold leading-none">
                      <span>{formatTime(currentTime)}</span>
                      <span>{formatTime(duration)}</span>
                    </div>
                    
                    <div className="relative group w-full h-1 bg-slate-800 rounded-full cursor-pointer flex items-center justify-center p-0">
                      <div
                        className="absolute left-0 top-0 h-full bg-gradient-to-r from-brand-dark to-brand-light rounded-full pointer-events-none"
                        style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
                      />
                      <input
                        id="tablet-progress-bar"
                        type="range"
                        min="0"
                        max={duration || 100}
                        step="0.1"
                        value={currentTime}
                        onChange={handleSeek}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer accent-brand"
                        aria-label="Track progress slider control"
                      />
                      <div
                        className="absolute w-2.5 h-2.5 rounded-full bg-white border border-brand shadow pointer-events-none transition-transform"
                        style={{ left: `calc(${(currentTime / (duration || 1)) * 100}% - 5px)` }}
                      />
                    </div>
                  </div>

                  {/* Media playback primary controllers */}
                  <div className="flex flex-col gap-2 mt-2.5 shrink-0">
                    <div className="flex items-center justify-between px-1">
                      {/* Shuffle Button */}
                      <button
                        id="tablet-shuffle-btn"
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

                      <div className="flex items-center gap-2">
                        {/* Fast Rewind */}
                        <button
                          id="tablet-rewind-btn"
                          onClick={handleFastRewind}
                          className="p-1.5 rounded-lg bg-slate-900 border border-slate-800/80 hover:bg-slate-800 text-slate-355 transition-all cursor-pointer inline-flex items-center"
                          title="Rewind 10s"
                        >
                          <FastForward className="w-3.5 h-3.5 rotate-180" />
                        </button>

                        {/* Skip Back */}
                        <button
                          id="tablet-prev-btn"
                          onClick={handlePrevTrack}
                          className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-white transition-all cursor-pointer"
                          title="Previous Song"
                        >
                          <SkipBack className="w-3.5 h-3.5 fill-white" />
                        </button>

                        {/* Primary Play-Pause Ring */}
                        <button
                          id="tablet-play-btn"
                          onClick={togglePlay}
                          className="p-4 rounded-full bg-brand hover:bg-brand-light text-white transition-transform duration-200 transform active:scale-95 shadow-lg shadow-brand/25 cursor-pointer flex items-center justify-center outline-none ring-2 ring-white/10"
                          title="Play/Pause"
                        >
                          {isPlaying ? (
                            <Pause className="w-5 h-5 fill-white" />
                          ) : (
                            <Play className="w-5 h-5 fill-white ml-0.5" />
                          )}
                        </button>

                        {/* Skip Forward */}
                        <button
                          id="tablet-next-btn"
                          onClick={() => handleNextTrack(true)}
                          className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-white transition-all cursor-pointer"
                          title="Next Song"
                        >
                          <SkipForward className="w-3.5 h-3.5 fill-white" />
                        </button>

                        {/* Fast Forward */}
                        <button
                          id="tablet-forward-btn"
                          onClick={handleFastForward}
                          className="p-1.5 rounded-lg bg-slate-900 border border-slate-800/80 hover:bg-slate-800 text-slate-355 transition-all cursor-pointer"
                          title="Forward 10s"
                        >
                          <FastForward className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Repeat mode selector */}
                      <button
                        id="tablet-repeat-btn"
                        onClick={() => {
                          if (repeatMode === "off") setRepeatMode("all");
                          else if (repeatMode === "all") setRepeatMode("one");
                          else setRepeatMode("off");
                        }}
                        className={`p-2 rounded-xl border transition-all flex items-center justify-center relative ${
                          repeatMode !== "off"
                            ? "bg-brand/15 text-brand border-brand/20"
                            : "text-slate-400 hover:text-white"
                        }`}
                        title={`Repeat Mode: ${repeatMode}`}
                      >
                        <Repeat className="w-4 h-4" />
                        {repeatMode === "one" && (
                          <span className="absolute right-0.5 bottom-0.5 text-[7px] font-extrabold bg-brand text-white rounded-full h-2.5 w-2.5 flex items-center justify-center ring-1 ring-slate-900 scale-90">
                            1
                          </span>
                        )}
                      </button>
                    </div>

                    {/* Master Volume Bar */}
                    <div className="flex items-center gap-2.5 px-3 bg-slate-900/50 py-1.5 rounded-xl border border-slate-800/50">
                      <button
                        id="tablet-mute-btn"
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
                        id="tablet-volume-slider"
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

                {/* RIGHT INTERACTIVE COLUMN: Synced Lyrics, Equalizer, or Tracks playlist */}
                <div className="col-span-12 md:col-span-7 flex flex-col h-full overflow-hidden bg-slate-900/15 border border-slate-800/40 p-3.5 rounded-2xl backdrop-blur-sm">
                  {/* Tablet Segmented Tab Hub */}
                  <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800/70 text-xs mb-2.5 shrink-0">
                    {(["playlist", "eq", "lyrics", "visuals"] as const).map((tab) => {
                      const activeTab = mobileTab === "player" ? "playlist" : mobileTab;
                      const isCurrent = activeTab === tab;
                      return (
                        <button
                          key={tab}
                          onClick={() => setMobileTab(tab)}
                          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg font-medium transition-all cursor-pointer ${
                            isCurrent
                              ? "bg-slate-850 text-brand-light font-bold border border-slate-800 shadow-md text-white"
                              : "text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          {tab === "lyrics" ? (
                            <>
                              <Activity className="w-3.5 h-3.5 text-brand-light" />
                              <span>Synced Lyrics</span>
                            </>
                          ) : tab === "eq" ? (
                            <>
                              <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                              <span>Equalizer DSP</span>
                            </>
                          ) : tab === "playlist" ? (
                            <>
                              <LayoutGrid className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Tracks Library</span>
                            </>
                          ) : (
                            <>
                              <Palette className="w-3.5 h-3.5 text-cyan-400" />
                              <span>Visuals</span>
                            </>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Scrollable container for tabs */}
                  <div className="flex-1 flex flex-col min-h-0 overflow-y-auto pr-1">
                    {/* Lyrics tab */}
                    {(mobileTab === "lyrics" || mobileTab === "player") && (
                      <div className="h-full flex flex-col">
                        {currentTrack ? (
                          <SyncedLyrics
                            track={currentTrack}
                            currentTime={currentTime}
                            onLyricsUpdate={handleLyricsUpdate}
                          />
                        ) : (
                          <div className="w-full h-full bg-slate-900/45 border border-slate-800/50 p-6 rounded-3xl flex flex-col justify-center items-center text-slate-400 gap-1.5 min-h-[300px]">
                            <Music className="w-8 h-8 text-slate-500 animate-pulse" />
                            <span className="text-sm font-semibold">No track selected</span>
                            <span className="text-xs text-slate-500">Upload or import tracks from the Track Library</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Equalizer Tab */}
                    {mobileTab === "eq" && (
                      <div className="h-full">
                        <EqualizerPanel
                          gains={gains}
                          onGainChange={handleGainChange}
                          onPresetSelect={handlePresetSelect}
                          bassBoost={bassBoost}
                          onBassBoostChange={setBassBoost}
                          reverbWet={reverbWet}
                          onReverbWetChange={setReverbWet}
                          reverbSize={reverbSize}
                          onReverbSizeChange={setReverbSize}
                          pan={pan}
                          onPanChange={setPan}
                        />
                      </div>
                    )}

                    {/* Playlist Track list Tab */}
                    {mobileTab === "playlist" && (
                      <div className="h-full">
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

                    {/* Visuals Configuration Theme Tab */}
                    {mobileTab === "visuals" && (
                      <div className="h-full flex flex-col gap-5 bg-slate-900/15 p-4 rounded-xl border border-slate-800/30">
                        <div>
                          <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-widest flex items-center gap-1.5 mb-2.5">
                            <Sparkles className="w-3.5 h-3.5 text-brand" />
                            <span>Visualizer Waveform Style</span>
                          </h4>
                          <div className="grid grid-cols-2 gap-2.5">
                            {[
                              { id: "bars", name: "Spectrum Bars", desc: "Classic multi-band frequency levels" },
                              { id: "radial", name: "Radial Ring", desc: "Circular reactive audio pulse circle" },
                              { id: "grid", name: "3D Grid Landscape", desc: "Retro perspective terrain wireframe" },
                              { id: "oscilloscope", name: "Oscilloscope", desc: "Analog hardware green wave trace" }
                            ].map((styleItem) => (
                              <button
                                key={styleItem.id}
                                onClick={() => setVisualizerStyle(styleItem.id as any)}
                                className={`flex flex-col text-left p-2.5 rounded-xl border transition-all cursor-pointer ${
                                  visualizerStyle === styleItem.id
                                    ? "bg-brand/15 border-brand/50 text-white"
                                    : "bg-slate-950/40 border-slate-800/30 text-slate-400 hover:bg-slate-900/40 hover:text-white"
                                }`}
                              >
                                <span className={`text-[11px] font-bold ${visualizerStyle === styleItem.id ? "text-brand-light" : "text-white"}`}>
                                  {styleItem.name}
                                </span>
                                <span className="text-[9px] text-slate-500 mt-0.5 leading-normal font-sans select-none">
                                  {styleItem.desc}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-widest flex items-center gap-1.5 mb-2.5">
                            <Palette className="w-3.5 h-3.5 text-cyan-450" />
                            <span>Glow & Preset Colorway</span>
                          </h4>
                          <div className="grid grid-cols-2 gap-2.5">
                            {[
                              { id: "neon", name: "Neon Cyber", desc: "Futuristic digital cyan & hot purple", color: "from-cyan-400 via-brand to-indigo-650" },
                              { id: "sunset", name: "Solar Flare", desc: "Warm ambient orange reddish neon", color: "from-amber-400 via-rose-500 to-indigo-700" },
                              { id: "matrix", name: "phospher Green", desc: "Classic matrix green hacker text", color: "from-emerald-500 via-green-600 to-emerald-950" },
                              { id: "monochrome", name: "Pure Chrome", desc: "Silver grayscale aesthetic metallic", color: "from-slate-400 via-slate-600 to-slate-800" }
                            ].map((themeItem) => (
                              <button
                                key={themeItem.id}
                                onClick={() => setVisualizerTheme(themeItem.id as any)}
                                className={`flex items-center gap-2 text-left p-2.5 rounded-xl border transition-all cursor-pointer ${
                                  visualizerTheme === themeItem.id
                                    ? "bg-brand/15 border-brand/50 text-white"
                                    : "bg-slate-950/40 border-slate-800/30 text-slate-400 hover:bg-slate-900/40 hover:text-white"
                                }`}
                              >
                                <div className={`w-3 h-3 rounded-full bg-gradient-to-tr ${themeItem.color} shrink-0 ring-1 ring-slate-950`} />
                                <div className="flex flex-col">
                                  <span className={`text-[11px] font-bold ${visualizerTheme === themeItem.id ? "text-brand-light" : "text-white"}`}>
                                    {themeItem.name}
                                  </span>
                                  <span className="text-[9px] text-slate-500 mt-0.5 leading-normal font-sans select-none">
                                    {themeItem.desc}
                                  </span>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>
          </div>
        ) : (
          /* ========================================================= */
          /* 🖥️ LANDSCAPE STUDIO MIXER BENTO DASHBOARD                   */
          /* ========================================================= */
          <div className="w-full flex flex-col gap-6">
            {/* Studio Mixer Dashboard App Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/10 border border-slate-800/20 px-6 py-4.5 rounded-3xl backdrop-blur-md">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl overflow-hidden border border-brand/35 bg-brand/5 flex items-center justify-center shrink-0">
                  <img
                    src={vaanLogo}
                    alt="Vaan Logo"
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <h1 className="text-base font-bold tracking-tight text-white font-display leading-none">
                      VaanMusicPlayer - Studio Grid
                    </h1>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 leading-none">
                    Real-time WebAudio Studio DSP & Waveform Renderers
                  </p>
                </div>
              </div>

              {/* Clean App Layout Switcher inside Studio Grid */}
              <div className="flex bg-slate-900/80 p-0.5 rounded-lg border border-slate-805 text-[10px]">
                <button
                  id="layout-btn-mobile-dash"
                  onClick={() => setLayoutMode("mobile")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer font-medium ${
                    layoutMode === "mobile"
                      ? "bg-brand text-white shadow-sm font-semibold"
                      : "text-slate-500 hover:text-white"
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>Tablet</span>
                </button>
                <button
                  id="layout-btn-dashboard-dash"
                  onClick={() => setLayoutMode("dashboard")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer font-medium ${
                    layoutMode === "dashboard"
                      ? "bg-brand text-white shadow-sm font-semibold"
                      : "text-slate-500 hover:text-white"
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>Studio Grid</span>
                </button>
              </div>
            </div>

            {/* Original 12-column Grid */}
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
                        src={currentTrack?.coverUrl || vaanLogo}
                        alt={currentTrack?.title || "Vaan Music Player"}
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
                      {currentTrack?.title || "Library is empty"}
                    </h2>
                    <p className="text-xs text-brand-light font-medium tracking-wide mt-1 select-text">
                      {currentTrack ? (
                        <>
                          {currentTrack.artist} • <span className="text-slate-400">{currentTrack.album}</span>
                        </>
                      ) : (
                        "Upload tracks below to build library"
                      )}
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

              {/* Connected Visualizer underneath Player Cover with embedded settings deck */}
              <div className="w-full bg-slate-900/40 backdrop-blur-xl border border-slate-800/70 p-4 rounded-3xl flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-800/50">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Sparkles className="w-3.5 h-3.5 text-brand" />
                    <span className="font-semibold uppercase tracking-wider text-[10px] select-none">Visualizer DSP Deck</span>
                  </div>
                  {/* STYLE & THEME Selector controls inside Studio Grid Deck */}
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Visualizer Style */}
                    <div className="flex items-center gap-0.5 bg-slate-950/80 p-0.5 rounded-lg border border-slate-800/60 text-[9.5px]">
                      {(["bars", "radial", "grid", "oscilloscope"] as const).map((st) => (
                        <button
                          key={st}
                          id={`dash-vis-style-${st}`}
                          onClick={() => setVisualizerStyle(st)}
                          className={`px-1.5 py-0.5 rounded transition-all capitalize select-none cursor-pointer font-medium ${
                            visualizerStyle === st
                              ? "bg-brand/20 text-brand-light font-semibold shadow-sm"
                              : "text-slate-500 hover:text-slate-350"
                          }`}
                        >
                          {st === "bars" ? "spectrum" : st === "radial" ? "radial" : st === "grid" ? "3D grid" : "scope"}
                        </button>
                      ))}
                    </div>
                    {/* Visualizer Theme */}
                    <div className="flex items-center gap-0.5 bg-slate-950/80 p-0.5 rounded-lg border border-slate-800/60 text-[9.5px]">
                      {(["neon", "sunset", "matrix", "monochrome"] as const).map((th) => (
                        <button
                          key={th}
                          id={`dash-vis-theme-${th}`}
                          onClick={() => setVisualizerTheme(th)}
                          className={`px-1.5 py-0.5 rounded transition-all capitalize select-none cursor-pointer font-medium ${
                            visualizerTheme === th
                              ? "bg-brand/20 text-brand-light font-semibold shadow-sm"
                              : "text-slate-500 hover:text-slate-350"
                          }`}
                        >
                          {th}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <AudioVisualizer
                  analyser={analyser}
                  isPlaying={isPlaying}
                  visualizerTheme={visualizerTheme}
                  visualizerStyle={visualizerStyle}
                  heightClass="h-28"
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
                  bassBoost={bassBoost}
                  onBassBoostChange={setBassBoost}
                  reverbWet={reverbWet}
                  onReverbWetChange={setReverbWet}
                  reverbSize={reverbSize}
                  onReverbSizeChange={setReverbSize}
                  pan={pan}
                  onPanChange={setPan}
                />
              </div>

              {/* Lyrics Panel + Upload-Playlist Panel bottom Row Side by Side */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full md:h-[450px]">
                {/* Apple-music-like Synced Lyrics Module */}
                {currentTrack ? (
                  <SyncedLyrics
                    track={currentTrack}
                    currentTime={currentTime}
                    onLyricsUpdate={handleLyricsUpdate}
                  />
                ) : (
                  <div className="w-full bg-slate-900/60 backdrop-blur-xl border border-slate-800/70 p-5 rounded-3xl flex flex-col justify-center items-center text-slate-400 gap-1.5 h-[280px]">
                    <Music className="w-8 h-8 text-slate-500 animate-pulse" />
                    <span className="text-sm font-semibold">No track loaded</span>
                    <span className="text-xs text-slate-500">Drag and drop tracks into the list on the right</span>
                  </div>
                )}

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
          </div>
        )}
      </main>


    </div>
  );
}
