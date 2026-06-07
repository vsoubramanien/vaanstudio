import React, { useState, useRef, useEffect } from "react";
import { SAMPLE_TRACKS } from "./data/sampleTracks";
import { Track, Playlist } from "./types";
import vaanLogo from "./assets/images/vaan_logo_1780250156730.png";
import AudioVisualizer from "./components/AudioVisualizer";
import EqualizerPanel from "./components/EqualizerPanel";
import SyncedLyrics from "./components/SyncedLyrics";
import TrackList from "./components/TrackList";
import {
  saveTrackToDB,
  deleteTrackFromDB,
  getAllTracksFromDB,
  savePlaylistToDB,
  deletePlaylistFromDB,
  getAllPlaylistsFromDB
} from "./utils/db";
import {
  runBackgroundScanner,
  crawlHTML5DirectoryList,
  ScanProgress
} from "./utils/scanner";
import { Capacitor } from "@capacitor/core";

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
  PlayCircle,
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
  Info,
  FolderOpen,
  HardDrive,
  X,
  ChevronUp,
  AlertCircle,
  CheckCircle2,
  RefreshCw
} from "lucide-react";

// Generate a synthetic, exponentially decaying stereo impulse response for the reverb convolver
function createReverbImpulseResponse(ctx: AudioContext, duration: number, decay: number = 2.0, environment: string = "hall"): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.max(1, Math.round(sampleRate * duration));
  const impulse = ctx.createBuffer(2, length, sampleRate);
  const left = impulse.getChannelData(0);
  const right = impulse.getChannelData(1);
  for (let i = 0; i < length; i++) {
    const percent = i / length;
    let valLeft = (Math.random() * 2 - 1) * Math.pow(1 - percent, decay);
    let valRight = (Math.random() * 2 - 1) * Math.pow(1 - percent, decay);

    if (environment === "rock") {
      // Rock Club: tight early reflections, shorter decay, some flutter
      const flutter = Math.sin(percent * Math.PI * 30) * 0.12;
      valLeft *= (1 + flutter);
      valRight *= (1 - flutter);
    } else if (environment === "studio") {
      // Small Studio: very fast decay, absorbed highs (warm tone)
      const dampFactor = Math.exp(-percent * 6.0);
      valLeft *= dampFactor;
      valRight *= dampFactor;
    } else if (environment === "cathedral") {
      // Cathedral: long pre-delay, dense reflections, resonant low end
      const wave = Math.sin(percent * Math.PI * 6) * 0.25;
      valLeft = (valLeft + wave) * Math.exp(-percent * 1.2);
      valRight = (valRight + wave) * Math.exp(-percent * 1.2);
    } else if (environment === "concert") {
      // Concert Hall: elegant stereo sprawl, mild pre-delay
      const preDelay = Math.round(0.04 * sampleRate); // 40ms pre-delay gap
      if (i < preDelay) {
        valLeft *= 0.05;
        valRight *= 0.05;
      } else {
        valLeft *= Math.exp(-(i - preDelay) / (length - preDelay) * 1.8);
        valRight *= Math.exp(-(i - preDelay) / (length - preDelay) * 1.8);
      }
    }

    left[i] = valLeft;
    right[i] = valRight;
  }
  return impulse;
}

export default function App() {
  // State definitions
  const [tracks, setTracks] = useState<Track[]>(SAMPLE_TRACKS);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);
  const [currentTrackId, setCurrentTrackId] = useState<string>(SAMPLE_TRACKS[0]?.id || "");
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolume] = useState<number>(0.8);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [repeatMode, setRepeatMode] = useState<"off" | "one" | "all">("all");
  const [isShuffle, setIsShuffle] = useState<boolean>(false);
  const [autoplayNext, setAutoplayNext] = useState<boolean>(true);
  const [layoutMode, setLayoutMode] = useState<"mobile" | "dashboard">("mobile");
  
  // Equalizer gains corresponding to [40, 125, 400, 1000, 2500, 6000, 15000] Hz
  const [gains, setGains] = useState<number[]>([0, 0, 0, 0, 0, 0, 0]);
  const [visualizerTheme, setVisualizerTheme] = useState<"neon" | "sunset" | "matrix" | "monochrome">("neon");
  const [visualizerStyle, setVisualizerStyle] = useState<"bars" | "radial" | "grid" | "oscilloscope" | "particles" | "plasma">("bars");
  const [mobileTab, setMobileTab] = useState<"player" | "eq" | "playlist" | "visuals">("playlist");

  // Expanded DSP FX States
  const [bassBoost, setBassBoost] = useState<number>(0); // 0 to 12 dB
  const [psychoBass, setPsychoBass] = useState<number>(0); // 0 to 10 harmonics mix
  const [trebleFocus, setTrebleFocus] = useState<boolean>(false); // Treble emphasis toggle
  const [reverbWet, setReverbWet] = useState<number>(0); // 0.0 to 1.0 (wet level)
  const [reverbSize, setReverbSize] = useState<number>(2.0); // 0.5 to 4.0 seconds field size
  const [reverbEnv, setReverbEnv] = useState<"rock" | "studio" | "cathedral" | "concert" | "hall">("hall"); // room reflection type
  const [pan, setPan] = useState<number>(0); // -1.0 (L) to 1.0 (R)

  // Cinematic Spatial Audio states
  const [spatialMode, setSpatialMode] = useState<"stereo" | "dolby" | "dts" | "stadium">("stereo");
  const [spatialOrbitSpeed, setSpatialOrbitSpeed] = useState<number>(0.6); // 0.1 to 2.0 rads/s
  const [spatialDepth, setSpatialDepth] = useState<number>(0.75); // 0.1 to 1.0 size / width factor

  // System Clock for Android status bar
  const [sysTime, setSysTime] = useState("14:18");

  // Background Automatic Storage Scanner states
  const [scanProgress, setScanProgress] = useState<ScanProgress>({
    status: "idle",
    currentFolder: "",
    filesFoundCount: 0,
    filesIndexedCount: 0,
    message: "",
  });
  const [showScannerDashboard, setShowScannerDashboard] = useState<boolean>(false);

  // Audio References
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const filtersRef = useRef<BiquadFilterNode[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  // Expanded DSP Node References
  const bassBoostRef = useRef<BiquadFilterNode | null>(null);
  const psychoBassFilterRef = useRef<BiquadFilterNode | null>(null);
  const psychoBassShaperRef = useRef<WaveShaperNode | null>(null);
  const psychoBassBandpassRef = useRef<BiquadFilterNode | null>(null);
  const psychoBassGainRef = useRef<GainNode | null>(null);
  const trebleFocusFilterRef = useRef<BiquadFilterNode | null>(null);

  const convolverRef = useRef<ConvolverNode | null>(null);
  const wetGainRef = useRef<GainNode | null>(null);
  const dryGainRef = useRef<GainNode | null>(null);
  const pannerRef = useRef<StereoPannerNode | null>(null);

  // Cinematic Spatial Engine nodes
  const routeStereoRef = useRef<GainNode | null>(null);
  const routeDolbyRef = useRef<GainNode | null>(null);
  const routeDtsRef = useRef<GainNode | null>(null);
  const routeStadiumRef = useRef<GainNode | null>(null);

  const spatialInputRef = useRef<GainNode | null>(null);
  const spatialOutRef = useRef<GainNode | null>(null);

  const dolbyPannerRef = useRef<PannerNode | null>(null);

  const dtsDelayLRef = useRef<DelayNode | null>(null);
  const dtsDelayRRef = useRef<DelayNode | null>(null);
  const dtsInvertLRef = useRef<GainNode | null>(null);
  const dtsInvertRRef = useRef<GainNode | null>(null);
  const dtsDryLRef = useRef<GainNode | null>(null);
  const dtsDryRRef = useRef<GainNode | null>(null);

  const stadiumWetRef = useRef<GainNode | null>(null);

  // Active track helper
  const currentTrack = tracks.find((t) => t.id === currentTrackId) || tracks[0];
  const activePlaylist = playlists.find((p) => p.id === activePlaylistId);
  const activeQueue = activePlaylist
    ? tracks.filter((t) => activePlaylist.trackIds.includes(t.id))
    : tracks;

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
    const loadPersistedPlaylists = async () => {
      try {
        const persistedPlaylists = await getAllPlaylistsFromDB();
        setPlaylists(persistedPlaylists);
      } catch (err) {
        console.error("Failed to load playlists from DB on startup:", err);
      }
    };
    loadPersistedTracks();
    loadPersistedPlaylists();
  }, []);

  // Save currentTrackId to localStorage on change
  useEffect(() => {
    if (currentTrackId) {
      localStorage.setItem("currentTrackId", currentTrackId);
    }
  }, [currentTrackId]);

  // --- NATIVE SYSTEM MEDIA SESSION CONTROLS ---
  // Connects the web application audio context, metadata, and playlist commands
  // directly to the operating system's lockscreen, bluetooth devices, and background trays.
  useEffect(() => {
    if (!('mediaSession' in navigator) || !currentTrack) return;

    try {
      // Helper to guarantee absolute URLs since Android's system music overlay fetches artwork 
      // out of the browser's relative thread/sandboxed scope.
      const getAbsoluteArtwork = (coverPath?: string) => {
        const fallback = vaanLogo;
        const targetPath = coverPath || fallback;
        let resolvedUrl = targetPath;

        if (targetPath && !targetPath.startsWith("http://") && !targetPath.startsWith("https://") && !targetPath.startsWith("data:") && !targetPath.startsWith("blob:")) {
          try {
            resolvedUrl = new URL(targetPath, window.location.href).href;
          } catch (e) {
            resolvedUrl = window.location.origin + (targetPath.startsWith("/") ? "" : "/") + targetPath;
          }
        }

        // Return a comprehensive list of specific target resolutions recommended for 
        // high-density Android notification tray widgets, lockscreens, WearOS, and Bluetooth interfaces.
        return [
          { src: resolvedUrl, sizes: "96x96", type: "image/png" },
          { src: resolvedUrl, sizes: "128x128", type: "image/png" },
          { src: resolvedUrl, sizes: "192x192", type: "image/png" },
          { src: resolvedUrl, sizes: "256x256", type: "image/png" },
          { src: resolvedUrl, sizes: "384x384", type: "image/png" },
          { src: resolvedUrl, sizes: "512x512", type: "image/png" }
        ];
      };

      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title || "Vaan Audio Track",
        artist: currentTrack.artist || "Vaan Player",
        album: currentTrack.album || "Vaan Music Library",
        artwork: getAbsoluteArtwork(currentTrack.coverUrl)
      });
    } catch (err) {
      console.warn("Failed to update system MediaSession details:", err);
    }
  }, [currentTrack]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
  }, [isPlaying]);

  useEffect(() => {
    if (!('mediaSession' in navigator) || !audioRef.current) return;
    if ('setPositionState' in navigator.mediaSession) {
      try {
        const pos = currentTime || 0;
        const dur = duration || 0;
        if (!isNaN(pos) && !isNaN(dur) && dur > 0 && pos >= 0 && pos <= dur) {
          navigator.mediaSession.setPositionState({
            duration: dur,
            playbackRate: audioRef.current.playbackRate || 1.0,
            position: pos
          });
        }
      } catch (err) {
        console.warn("Failed to update system playhead position:", err);
      }
    }
  }, [currentTime, duration]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;

    try {
      ms.setActionHandler("play", async () => {
        if (audioRef.current) {
          initAudioEngine();
          try {
            await audioRef.current.play();
            setIsPlaying(true);
          } catch (e) {
            console.warn("MediaSession play action failed:", e);
          }
        }
      });
      ms.setActionHandler("pause", () => {
        if (audioRef.current) {
          audioRef.current.pause();
          setIsPlaying(false);
        }
      });
      ms.setActionHandler("stop", () => {
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
          setIsPlaying(false);
          setCurrentTime(0);
        }
      });
      ms.setActionHandler("previoustrack", () => {
        handlePrevTrack();
      });
      ms.setActionHandler("nexttrack", () => {
        handleNextTrack(true);
      });
      ms.setActionHandler("seekbackward", (details) => {
        const offset = details.seekOffset || 10;
        if (audioRef.current) {
          const target = Math.max(0, audioRef.current.currentTime - offset);
          audioRef.current.currentTime = target;
          setCurrentTime(target);
          if ('setPositionState' in ms) {
            try {
              ms.setPositionState({
                duration: duration || 0,
                playbackRate: audioRef.current.playbackRate || 1.0,
                position: target
              });
            } catch (e) {}
          }
        }
      });
      ms.setActionHandler("seekforward", (details) => {
        const offset = details.seekOffset || 10;
        if (audioRef.current) {
          const target = Math.min(duration, audioRef.current.currentTime + offset);
          audioRef.current.currentTime = target;
          setCurrentTime(target);
          if ('setPositionState' in ms) {
            try {
              ms.setPositionState({
                duration: duration || 0,
                playbackRate: audioRef.current.playbackRate || 1.0,
                position: target
              });
            } catch (e) {}
          }
        }
      });
      ms.setActionHandler("seekto", (details) => {
        if (details.seekTime !== undefined && audioRef.current) {
          const seekTime = details.seekTime;
          audioRef.current.currentTime = seekTime;
          setCurrentTime(seekTime);
          if ('setPositionState' in ms) {
            try {
              ms.setPositionState({
                duration: duration || 0,
                playbackRate: audioRef.current.playbackRate || 1.0,
                position: seekTime
              });
            } catch (e) {}
          }
        }
      });
    } catch (err) {
      console.warn("Failed to attach system media session action handlers:", err);
    }

    return () => {
      try {
        ms.setActionHandler("play", null);
        ms.setActionHandler("pause", null);
        ms.setActionHandler("stop", null);
        ms.setActionHandler("previoustrack", null);
        ms.setActionHandler("nexttrack", null);
        ms.setActionHandler("seekbackward", null);
        ms.setActionHandler("seekforward", null);
        ms.setActionHandler("seekto", null);
      } catch (e) {}
    };
  }, [isPlaying, currentTrack, duration]);

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

        // 3. Create Treble Focus filter (highshelf peaking filter)
        const trebleFocusNode = ctx.createBiquadFilter();
        trebleFocusNode.type = "highshelf";
        trebleFocusNode.frequency.value = 7500;
        trebleFocusNode.gain.value = trebleFocus ? 7.5 : 0.0;
        trebleFocusFilterRef.current = trebleFocusNode;

        // 4. Create Reverb convolver block: convolverNode, wetGainNode, dryGainNode
        const convolver = ctx.createConvolver();
        try {
          convolver.buffer = createReverbImpulseResponse(ctx, reverbSize, 2.0, reverbEnv);
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
        // source -> bassBoostNode -> trebleFocusNode -> filter[0] -> ... -> filter[6]
        source.connect(bassBoostNode);
        bassBoostNode.connect(trebleFocusNode);

        let previousNode: AudioNode = trebleFocusNode;
        filters.forEach((filter) => {
          previousNode.connect(filter);
          previousNode = filter;
        });

        // Split standard signal to reverb (convolver -> wetGainNode) and dry path (dryGainNode)
        const eqOutput = previousNode;

        // 5. Build Psychoacoustic Sub-Harmonics Parallel Processing Chain
        const psychoBassFilter = ctx.createBiquadFilter();
        psychoBassFilter.type = "lowpass";
        psychoBassFilter.frequency.value = 90; // Isolate sub-bass frequencies
        psychoBassFilterRef.current = psychoBassFilter;

        const psychoBassShaper = ctx.createWaveShaper();
        const makeDistortionCurve = (amount: number) => {
          const k = typeof amount === 'number' ? amount : 50;
          const n_samples = 44100;
          const curve = new Float32Array(n_samples);
          const deg = Math.PI / 180;
          for (let i = 0 ; i < n_samples; ++i ) {
            const x = (i * 2) / n_samples - 1;
            curve[i] = ( 3 + k ) * x * 20 * deg / ( Math.PI + k * Math.abs(x) );
          }
          return curve;
        };
        psychoBassShaper.curve = makeDistortionCurve(10); // soft clipping for harmonic synthesis
        psychoBassShaper.oversample = "4x";
        psychoBassShaperRef.current = psychoBassShaper;

        const psychoBassBandpass = ctx.createBiquadFilter();
        psychoBassBandpass.type = "bandpass";
        psychoBassBandpass.frequency.value = 180; // Keep 2nd/3rd harmonics around 180Hz
        psychoBassBandpass.Q.value = 1.2;
        psychoBassBandpassRef.current = psychoBassBandpass;

        const psychoBassGain = ctx.createGain();
        psychoBassGain.gain.value = psychoBass * 0.15;
        psychoBassGainRef.current = psychoBassGain;

        eqOutput.connect(psychoBassFilter);
        psychoBassFilter.connect(psychoBassShaper);
        psychoBassShaper.connect(psychoBassBandpass);
        psychoBassBandpass.connect(psychoBassGain);

        // Mix clean audio output and psychoacoustic harmonics together before splitting
        const audioMixNode = ctx.createGain();
        eqOutput.connect(audioMixNode);
        psychoBassGain.connect(audioMixNode);

        audioMixNode.connect(dryGainNode);
        audioMixNode.connect(convolver);
        convolver.connect(wetGainNode);

        // Setup Spatial Engine Node routing
        const spatialInput = ctx.createGain();
        spatialInputRef.current = spatialInput;
        dryGainNode.connect(spatialInput);
        wetGainNode.connect(spatialInput);

        // 1. Standard Stereo Path with StereoPannerNode
        let stereoPanner: StereoPannerNode | null = null;
        if (ctx.createStereoPanner) {
          try {
            stereoPanner = ctx.createStereoPanner();
            stereoPanner.pan.value = pan;
            pannerRef.current = stereoPanner;
          } catch (e) {
            console.warn("Could not create StereoPannerNode:", e);
          }
        }

        // 2. Dolby Atmos 3D Panner Node (HRTF model for 3D positional virtualization)
        let dolbyPanner: PannerNode | null = null;
        try {
          dolbyPanner = ctx.createPanner();
          dolbyPanner.panningModel = "HRTF";
          dolbyPanner.distanceModel = "inverse";
          dolbyPanner.refDistance = 1;
          dolbyPanner.maxDistance = 10000;
          dolbyPanner.rolloffFactor = 1;
          dolbyPanner.coneInnerAngle = 360;
          dolbyPanner.coneOuterAngle = 360;
          dolbyPanner.positionX.value = 0;
          dolbyPanner.positionY.value = 0;
          dolbyPanner.positionZ.value = 1;
          dolbyPannerRef.current = dolbyPanner;
        } catch (e) {
          console.warn("Could not create Dolby PannerNode:", e);
        }

        // 3. DTS Matrix Surround Expanders (Haas effect delay & phase-inverted crossfeed)
        let dtsMerger: ChannelMergerNode | null = null;
        try {
          const dtsSplitter = ctx.createChannelSplitter(2);
          dtsMerger = ctx.createChannelMerger(2);

          const dtsDelayL = ctx.createDelay();
          const dtsDelayR = ctx.createDelay();
          dtsDelayL.delayTime.value = 0.022; // 22ms Haas delay for Front left
          dtsDelayR.delayTime.value = 0.028; // 28ms Haas delay for Front right
          dtsDelayLRef.current = dtsDelayL;
          dtsDelayRRef.current = dtsDelayR;

          const dtsInvertL = ctx.createGain();
          const dtsInvertR = ctx.createGain();
          dtsInvertL.gain.value = -0.45 * spatialDepth;
          dtsInvertR.gain.value = -0.45 * spatialDepth;
          dtsInvertLRef.current = dtsInvertL;
          dtsInvertRRef.current = dtsInvertR;

          const dtsDryL = ctx.createGain();
          const dtsDryR = ctx.createGain();
          dtsDryL.gain.value = 1.0;
          dtsDryR.gain.value = 1.0;
          dtsDryLRef.current = dtsDryL;
          dtsDryRRef.current = dtsDryR;

          // Split input signal
          spatialInput.connect(dtsSplitter);

          // Direct dry L/R mappings
          dtsSplitter.connect(dtsDryL, 0);
          dtsDryL.connect(dtsMerger, 0, 0); // L input -> L output

          dtsSplitter.connect(dtsDryR, 1);
          dtsDryR.connect(dtsMerger, 0, 1); // R input -> R output

          // Inverted delayed L surround crossfeed merged into R output
          dtsSplitter.connect(dtsDelayL, 0);
          dtsDelayL.connect(dtsInvertL);
          dtsInvertL.connect(dtsMerger, 0, 1);

          // Inverted delayed R surround crossfeed merged into L output
          dtsSplitter.connect(dtsDelayR, 1);
          dtsDelayR.connect(dtsInvertR);
          dtsInvertR.connect(dtsMerger, 0, 0);
        } catch (e) {
          console.warn("Could not construct DTS Matrix surround layout:", e);
        }

        // 4. Stadium Arena surround echoes
        let stadiumWet: GainNode | null = null;
        try {
          const stadiumDelay1 = ctx.createDelay();
          stadiumDelay1.delayTime.value = 0.18; // 180ms delay 
          const stadiumDelay2 = ctx.createDelay();
          stadiumDelay2.delayTime.value = 0.32; // 320ms echo

          const stadiumFeedback1 = ctx.createGain();
          stadiumFeedback1.gain.value = 0.4;
          const stadiumFeedback2 = ctx.createGain();
          stadiumFeedback2.gain.value = 0.3;

          stadiumWet = ctx.createGain();
          stadiumWet.gain.value = 0.45;

          // Hook feedbacks
          spatialInput.connect(stadiumDelay1);
          stadiumDelay1.connect(stadiumFeedback1);
          stadiumFeedback1.connect(stadiumDelay1);

          spatialInput.connect(stadiumDelay2);
          stadiumDelay2.connect(stadiumFeedback2);
          stadiumFeedback2.connect(stadiumDelay2);

          const stadiumMerger = ctx.createGain();
          stadiumDelay1.connect(stadiumMerger);
          stadiumDelay2.connect(stadiumMerger);
          stadiumMerger.connect(stadiumWet);

          stadiumWetRef.current = stadiumWet;
        } catch (e) {
          console.warn("Could not construct Stadium live echoes chain:", e);
        }

        // 5. Connect crossover gains
        const routeStereo = ctx.createGain();
        const routeDolby = ctx.createGain();
        const routeDts = ctx.createGain();
        const routeStadium = ctx.createGain();

        // Initial volumes set immediately depending on default 'spatialMode' (stereo)
        routeStereo.gain.value = spatialMode === "stereo" ? 1.0 : 0.0;
        routeDolby.gain.value = spatialMode === "dolby" ? 1.0 : 0.0;
        routeDts.gain.value = spatialMode === "dts" ? 1.0 : 0.0;
        routeStadium.gain.value = spatialMode === "stadium" ? 1.0 : 0.0;

        routeStereoRef.current = routeStereo;
        routeDolbyRef.current = routeDolby;
        routeDtsRef.current = routeDts;
        routeStadiumRef.current = routeStadium;

        // Stereo path inputs
        if (stereoPanner) {
          spatialInput.connect(stereoPanner);
          stereoPanner.connect(routeStereo);
        } else {
          spatialInput.connect(routeStereo);
        }

        // Dolby path inputs
        if (dolbyPanner) {
          spatialInput.connect(dolbyPanner);
          dolbyPanner.connect(routeDolby);
        } else {
          spatialInput.connect(routeDolby);
        }

        // DTS path inputs
        if (dtsMerger) {
          dtsMerger.connect(routeDts);
        } else {
          spatialInput.connect(routeDts);
        }

        // Stadium path inputs
        spatialInput.connect(routeStadium); // Direct dry passthrough
        if (stadiumWet) {
          stadiumWet.connect(routeStadium); // Add stadium echoes
        }

        // Output merger node connects straight to visualizers
        const spatialOut = ctx.createGain();
        spatialOutRef.current = spatialOut;

        routeStereo.connect(spatialOut);
        routeDolby.connect(spatialOut);
        routeDts.connect(spatialOut);
        routeStadium.connect(spatialOut);

        spatialOut.connect(analyserNode);
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

  // Sync Psychoacoustic Bass dynamically with state updates
  useEffect(() => {
    if (psychoBassGainRef.current) {
      psychoBassGainRef.current.gain.setValueAtTime(psychoBass * 0.15, audioCtxRef.current?.currentTime || 0);
    }
  }, [psychoBass]);

  // Sync Treble Focus dynamically with state updates
  useEffect(() => {
    if (trebleFocusFilterRef.current) {
      const targetGain = trebleFocus ? 7.5 : 0.0;
      trebleFocusFilterRef.current.gain.setValueAtTime(targetGain, audioCtxRef.current?.currentTime || 0);
    }
  }, [trebleFocus]);

  // Sync Reverb size / decay (impulse buffer regen) dynamically with state updates
  useEffect(() => {
    const ctx = audioCtxRef.current;
    if (ctx && convolverRef.current) {
      try {
        convolverRef.current.buffer = createReverbImpulseResponse(ctx, reverbSize, 2.0, reverbEnv);
      } catch (err) {
        console.warn("Failed to update convolver buffer dynamically:", err);
      }
    }
  }, [reverbSize, reverbEnv]);

  // Sync Spatial Mode dynamically with smooth crossover crossfades
  useEffect(() => {
    if (!audioCtxRef.current) return;

    const ctx = audioCtxRef.current;
    const time = ctx.currentTime;
    const fadeDuration = 0.15; // 150ms smooth crossover

    const routes = {
      stereo: routeStereoRef.current,
      dolby: routeDolbyRef.current,
      dts: routeDtsRef.current,
      stadium: routeStadiumRef.current,
    };

    try {
      Object.entries(routes).forEach(([modeName, gainNode]) => {
        if (gainNode) {
          const targetVal = spatialMode === modeName ? 1.0 : 0.0;
          // Smooth ramp
          gainNode.gain.setValueAtTime(gainNode.gain.value, time);
          gainNode.gain.linearRampToValueAtTime(targetVal, time + fadeDuration);
        }
      });
    } catch (e) {
      console.warn("Failed to crossfade spatial modes:", e);
    }
  }, [spatialMode]);

  // Sync DTS depth parameters dynamically with state updates
  useEffect(() => {
    if (!audioCtxRef.current) return;
    const time = audioCtxRef.current.currentTime;
    if (dtsInvertLRef.current) {
      dtsInvertLRef.current.gain.setValueAtTime(-0.45 * spatialDepth, time);
    }
    if (dtsInvertRRef.current) {
      dtsInvertRRef.current.gain.setValueAtTime(-0.45 * spatialDepth, time);
    }
  }, [spatialDepth]);

  // Rotate Dolby Atmos 3D coordinates over time when playing
  useEffect(() => {
    if (spatialMode !== "dolby" || !isPlaying) return;

    let animationFrameId: number;
    let angle = 0;

    const updateDolbyPosition = () => {
      if (dolbyPannerRef.current && audioCtxRef.current) {
        // Increment rotational angle
        angle += (spatialOrbitSpeed * 0.016); // step based on ~60fps
        
        // Circular orbit in front, behind, and elevated above listener (0,0,0)
        const radius = 3.5;
        const x = Math.sin(angle) * radius;
        const y = Math.sin(angle * 0.5) * 1.5; // elevated overhead sweep
        const z = Math.cos(angle) * radius;

        const time = audioCtxRef.current.currentTime;
        try {
          dolbyPannerRef.current.positionX.setValueAtTime(x, time);
          dolbyPannerRef.current.positionY.setValueAtTime(y, time);
          dolbyPannerRef.current.positionZ.setValueAtTime(z, time);
        } catch (e) {
          // Direct fallback properties if AudioParam values fail
          try {
            dolbyPannerRef.current.setPosition(x, y, z);
          } catch (err) {}
        }
      }
      animationFrameId = requestAnimationFrame(updateDolbyPosition);
    };

    updateDolbyPosition();
    return () => cancelAnimationFrame(animationFrameId);
  }, [spatialMode, spatialOrbitSpeed, isPlaying]);

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
    if (activeQueue.length === 0) return;
    const currentIndex = activeQueue.findIndex((t) => t.id === currentTrackId);
    let nextIndex = currentIndex;

    if (isShuffle) {
      // Pick a random track index distinct from active (if there are multiple)
      if (activeQueue.length > 1) {
        let rand;
        do {
          rand = Math.floor(Math.random() * activeQueue.length);
        } while (rand === currentIndex);
        nextIndex = rand;
      }
    } else {
      nextIndex = currentIndex + 1;
      if (nextIndex >= activeQueue.length) {
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

    const forcePlay = !userTriggered || isPlaying;
    handleTrackSelect(activeQueue[nextIndex].id, forcePlay);
  };

  // Track skipping logic (Backward)
  const handlePrevTrack = () => {
    if (activeQueue.length === 0) return;
    // Standard player rule: if song has played > 3 seconds, rewinding resets current track instead of skipping!
    if (currentTime > 3) {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        setCurrentTime(0);
      }
      return;
    }

    const currentIndex = activeQueue.findIndex((t) => t.id === currentTrackId);
    let nextIndex = currentIndex - 1;
    if (nextIndex < 0) {
      nextIndex = activeQueue.length - 1;
    }

    handleTrackSelect(activeQueue[nextIndex].id, isPlaying);
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
  const handleTrackSelect = (trackId: string, forcePlay = true) => {
    const shouldPlay = forcePlay || isPlaying;
    setCurrentTrackId(trackId);
    setCurrentTime(0);

    if (shouldPlay) {
      setIsPlaying(true);
    }

    // Give browser/React a microsecond to apply src change via standard state rendering to the DOM element
    setTimeout(async () => {
      if (audioRef.current) {
        initAudioEngine();
        
        // Match duration to media header context if possible
        if (!isNaN(audioRef.current.duration)) {
          setDuration(audioRef.current.duration);
        }

        if (shouldPlay) {
          try {
            await audioRef.current.play();
          } catch (e) {
            console.warn("Playback failed inside handleTrackSelect setTimeout:", e);
          }
        } else {
          audioRef.current.pause();
        }
      }
    }, 120);
  };

  // Sound ending handler
  const handleEnded = () => {
    if (repeatMode === "one") {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch((e) => console.error(e));
      }
    } else if (autoplayNext) {
      handleNextTrack(false);
    } else {
      setIsPlaying(false);
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        setCurrentTime(0);
      }
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

  // Background local music scanner handles
  const handleStartScanner = async () => {
    setShowScannerDashboard(true);
    setScanProgress({
      status: "requesting",
      currentFolder: "",
      filesFoundCount: 0,
      filesIndexedCount: 0,
      message: "Requesting filesystem authorization and configuring crawler tasks...",
    });

    const onProgressChange = (progress: ScanProgress) => {
      setScanProgress(progress);
    };

    const onTrackAdded = (newTrack: Track) => {
      setTracks((prev) => {
        const alreadyExists = prev.some(
          (t) => t.title.toLowerCase() === newTrack.title.toLowerCase() && 
                 t.artist.toLowerCase() === newTrack.artist.toLowerCase()
        );
        if (alreadyExists) return prev;
        return [...prev, newTrack];
      });
    };

    const webSimulationFallback = async () => {
      setScanProgress({
        status: "scanning",
        currentFolder: "Atmospheric Cache",
        filesFoundCount: 0,
        filesIndexedCount: 0,
        message: "Web Sandboxed environment. Please choose 'Import local folder' below, or let us populate live ambient streams for quick testing as simulated music crawl...",
      });
    };

    runBackgroundScanner(onProgressChange, onTrackAdded, webSimulationFallback);
  };

  const handleImportWebFolder = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    setShowScannerDashboard(true);
    setScanProgress({
      status: "requesting",
      currentFolder: "Parsing Selected Folder List",
      filesFoundCount: 0,
      filesIndexedCount: 0,
      message: "Parsing local directory structure in background...",
    });

    const onProgressChange = (progress: ScanProgress) => {
      setScanProgress(progress);
    };

    const onTrackAdded = (newTrack: Track) => {
      setTracks((prev) => {
        const alreadyExists = prev.some(
          (t) => t.title.toLowerCase() === newTrack.title.toLowerCase() && 
                 t.artist.toLowerCase() === newTrack.artist.toLowerCase()
        );
        if (alreadyExists) return prev;
        return [...prev, newTrack];
      });
    };

    const filesArray: File[] = Array.from(e.target.files);
    crawlHTML5DirectoryList(filesArray, onProgressChange, onTrackAdded);
  };

  const handleSimulateStreams = async () => {
    setScanProgress({
      status: "processing",
      currentFolder: "Atmospheric Web Index",
      filesFoundCount: 4,
      filesIndexedCount: 0,
      message: "Contacting cosmic catalog streams...",
    });
    
    const simulatedTracks = [
      {
        title: "Stardust Horizon",
        artist: "Cosmic Aura",
        album: "Atmospheric Space Drones",
        duration: 242,
        src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
        coverUrl: "https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=150&q=80",
      },
      {
        title: "Retro Wave Dream",
        artist: "Neon Synthland",
        album: "Outrun Classics",
        duration: 302,
        src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
        coverUrl: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=150&q=80",
      },
      {
        title: "Chill-fi Rainy Afternoon",
        artist: "Lofi Cafe Collective",
        album: "Rainy Day Loops",
        duration: 185,
        src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3",
        coverUrl: "https://images.unsplash.com/photo-1515462277126-270d878326e5?w=150&q=80",
      },
      {
        title: "Ocean Whisper",
        artist: "Nirvana Chillout",
        album: "Relaxation Waves",
        duration: 224,
        src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-16.mp3",
        coverUrl: "https://images.unsplash.com/photo-1505118380757-91f5f5632de0?w=150&q=80",
      }
    ];

    let indexed = 0;
    for (const trackData of simulatedTracks) {
      setScanProgress({
        status: "processing",
        currentFolder: `stream_catalog://${trackData.album}`,
        filesFoundCount: simulatedTracks.length,
        filesIndexedCount: indexed,
        message: `Importing remote loop: ${trackData.title} by ${trackData.artist}...`,
      });

      await new Promise((resolve) => setTimeout(resolve, 800));

      const blob = new Blob([""], { type: "audio/mpeg" });
      const scannedTrack: Track = {
        id: `simulated-scan-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        title: trackData.title,
        artist: trackData.artist,
        album: trackData.album,
        duration: trackData.duration,
        src: trackData.src,
        coverUrl: trackData.coverUrl,
        isUploaded: true,
      };

      await saveTrackToDB(scannedTrack, blob);
      setTracks((prev) => {
        const alreadyExists = prev.some(
          (t) => t.title.toLowerCase() === scannedTrack.title.toLowerCase() && 
                 t.artist.toLowerCase() === scannedTrack.artist.toLowerCase()
        );
        if (alreadyExists) return prev;
        return [...prev, scannedTrack];
      });
      indexed++;
    }

    setScanProgress({
      status: "completed",
      currentFolder: "",
      filesFoundCount: simulatedTracks.length,
      filesIndexedCount: indexed,
      message: `Successfully crawled and simulated ${indexed} catalog loops!`,
    });
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

    // Filter out deleted track from all playlists
    setPlaylists((prevPlaylists) => {
      return prevPlaylists.map((p) => {
        if (p.trackIds.includes(trackId)) {
          const updatedPlaylist = { ...p, trackIds: p.trackIds.filter((id) => id !== trackId) };
          savePlaylistToDB(updatedPlaylist).catch((err) =>
            console.error("Failed to save updated playlist after track delete:", err)
          );
          return updatedPlaylist;
        }
        return p;
      });
    });
  };

  // --- PLAYLIST CORE ACTIONS ---
  const handlePlaylistCreate = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const newPlaylist: Playlist = {
      id: `playlist-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: trimmed,
      trackIds: [],
    };
    setPlaylists((prev) => [...prev, newPlaylist]);
    savePlaylistToDB(newPlaylist).catch((err) =>
      console.error("Failed to save new playlist to DB:", err)
    );
  };

  const handlePlaylistDelete = (id: string) => {
    setPlaylists((prev) => prev.filter((p) => p.id !== id));
    deletePlaylistFromDB(id).catch((err) =>
      console.error("Failed to delete playlist from DB:", err)
    );
    if (activePlaylistId === id) {
      setActivePlaylistId(null);
    }
  };

  const handleTrackTogglePlaylist = (trackId: string, playlistId: string) => {
    setPlaylists((prevPlaylists) => {
      return prevPlaylists.map((p) => {
        if (p.id === playlistId) {
          const isAdded = p.trackIds.includes(trackId);
          const updatedTrackIds = isAdded
            ? p.trackIds.filter((id) => id !== trackId)
            : [...p.trackIds, trackId];
          const updatedPlaylist = { ...p, trackIds: updatedTrackIds };
          savePlaylistToDB(updatedPlaylist).catch((err) =>
            console.error("Failed to update playlist tracks in DB:", err)
          );
          return updatedPlaylist;
        }
        return p;
      });
    });
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
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onLoadedMetadata={() => {
          if (audioRef.current && !isNaN(audioRef.current.duration)) {
            setDuration(audioRef.current.duration);
          }
        }}
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
                      <div className={`relative w-36 h-36 rounded-full overflow-hidden border-4 border-slate-900 shadow-2xl shrink-0 ${
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
                        
                        {/* Premium Stylized Center Record Label overlay housing Vaan Player */}
                        <div className="absolute inset-0 margin-auto w-14 h-14 bg-slate-950 border-2 border-slate-800 rounded-full flex flex-col items-center justify-center pointer-events-none left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 shadow-inner z-10 select-none">
                          <img
                            src={vaanLogo}
                            alt="Vaan Logo"
                            className="w-5 h-5 object-cover rounded-full"
                            referrerPolicy="no-referrer"
                          />
                          <span className="text-[6.5px] text-white/80 font-bold font-display tracking-tight uppercase mt-0.5">Vaan Player</span>
                          <div className="w-1.5 h-1.5 bg-brand rounded-full mt-0.5 border border-slate-900" />
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
                      {/* Shuffle & Autoplay Control Group */}
                      <div className="flex items-center gap-1">
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
                        <button
                          id="tablet-autoplay-btn"
                          onClick={() => setAutoplayNext(!autoplayNext)}
                          className={`p-2 rounded-xl transition-all flex items-center justify-center ${
                            autoplayNext
                              ? "bg-emerald-500/15 text-emerald-400 font-bold border border-emerald-500/20"
                              : "text-slate-400 hover:text-white"
                          }`}
                          title={`Autoplay queue: ${autoplayNext ? "ON" : "OFF"}`}
                        >
                          <PlayCircle className="w-4 h-4" />
                        </button>
                      </div>

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

                    {/* Active Playlist Constraint Control */}
                    {activePlaylist && (
                      <div className="flex items-center justify-between bg-brand/10 border border-brand/20 px-3 py-1.5 rounded-xl text-slate-200 select-none animate-in fade-in slide-in-from-top-1 duration-200">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="flex h-2 w-2 relative shrink-0">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-light opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-light"></span>
                          </span>
                          <div className="min-w-0">
                            <p className="text-[8px] text-slate-400 uppercase tracking-widest leading-none font-bold">Playing Queue</p>
                            <p className="text-[11px] font-semibold truncate text-brand-light leading-snug">{activePlaylist.name}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => setActivePlaylistId(null)}
                          className="text-[9px] bg-slate-900 hover:bg-slate-800 border border-slate-800/80 hover:border-slate-700 px-2.5 py-0.5 rounded text-slate-300 hover:text-white transition-all cursor-pointer font-bold uppercase tracking-wider"
                          title="Clear queue restriction and restore full library queue"
                        >
                          Restore Library
                        </button>
                      </div>
                    )}

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

                {/* RIGHT INTERACTIVE COLUMN: Equalizer, or Tracks playlist */}
                <div className="col-span-12 md:col-span-7 flex flex-col h-full overflow-hidden bg-slate-900/15 border border-slate-800/40 p-3.5 rounded-2xl backdrop-blur-sm">
                  {/* Tablet Segmented Tab Hub */}
                  <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800/70 text-xs mb-2.5 shrink-0">
                    {(["playlist", "eq", "visuals"] as const).map((tab) => {
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
                          {tab === "eq" ? (
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
                          spatialMode={spatialMode}
                          onSpatialModeChange={setSpatialMode}
                          spatialOrbitSpeed={spatialOrbitSpeed}
                          onSpatialOrbitSpeedChange={setSpatialOrbitSpeed}
                          spatialDepth={spatialDepth}
                          onSpatialDepthChange={setSpatialDepth}
                          psychoBass={psychoBass}
                          onPsychoBassChange={setPsychoBass}
                          trebleFocus={trebleFocus}
                          onTrebleFocusChange={setTrebleFocus}
                          reverbEnv={reverbEnv}
                          onReverbEnvChange={setReverbEnv}
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
                          onScanTrigger={handleStartScanner}
                          scanStatus={scanProgress.status}
                          playlists={playlists}
                          onPlaylistCreate={handlePlaylistCreate}
                          onPlaylistDelete={handlePlaylistDelete}
                          onTrackTogglePlaylist={handleTrackTogglePlaylist}
                          activePlaylistId={activePlaylistId}
                          onActivePlaylistChange={setActivePlaylistId}
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
                              { id: "oscilloscope", name: "Oscilloscope", desc: "Analog hardware green wave trace" },
                              { id: "particles", name: "Stellar Particles", desc: "Interactive physical starburst galaxy" },
                              { id: "plasma", name: "Organic Plasma", desc: "Morphing multi-vertex blob core" }
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
                      {(["bars", "radial", "grid", "oscilloscope", "particles", "plasma"] as const).map((st) => (
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
                          {st === "bars" ? "spectrum" : st === "radial" ? "radial" : st === "grid" ? "3D grid" : st === "oscilloscope" ? "scope" : st === "particles" ? "stars" : "plasma"}
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
                  {/* Shuffle and Autoplay click */}
                  <div className="flex items-center gap-1.5">
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
                    <button
                      id="studio-autoplay-btn"
                      onClick={() => setAutoplayNext(!autoplayNext)}
                      className={`p-2.5 rounded-xl border transition-all flex items-center justify-center ${
                        autoplayNext
                          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20 font-semibold"
                          : "text-slate-400 hover:text-white border-transparent"
                      }`}
                      title={`Autoplay queue: ${autoplayNext ? "ON" : "OFF"}`}
                    >
                      <PlayCircle className="w-4.5 h-4.5" />
                    </button>
                  </div>

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
                  spatialMode={spatialMode}
                  onSpatialModeChange={setSpatialMode}
                  spatialOrbitSpeed={spatialOrbitSpeed}
                  onSpatialOrbitSpeedChange={setSpatialOrbitSpeed}
                  spatialDepth={spatialDepth}
                  onSpatialDepthChange={setSpatialDepth}
                  psychoBass={psychoBass}
                  onPsychoBassChange={setPsychoBass}
                  trebleFocus={trebleFocus}
                  onTrebleFocusChange={setTrebleFocus}
                  reverbEnv={reverbEnv}
                  onReverbEnvChange={setReverbEnv}
                />
              </div>

              {/* Upload-Playlist Panel bottom Row */}
              <div className="w-full md:h-[450px]">
                {/* Audio library uploader module */}
                <TrackList
                  tracks={tracks}
                  currentTrackId={currentTrackId}
                  isPlaying={isPlaying}
                  onTrackSelect={handleTrackSelect}
                  onTrackUpload={handleTrackUpload}
                  onTrackDelete={handleTrackDelete}
                  onScanTrigger={handleStartScanner}
                  scanStatus={scanProgress.status}
                  playlists={playlists}
                  onPlaylistCreate={handlePlaylistCreate}
                  onPlaylistDelete={handlePlaylistDelete}
                  onTrackTogglePlaylist={handleTrackTogglePlaylist}
                  activePlaylistId={activePlaylistId}
                  onActivePlaylistChange={setActivePlaylistId}
                />
              </div>
            </div>
          </div>
          </div>
        )}
      </main>

      {/* Hidden HTML5 folder uploader for testing web crawlers */}
      <input
        id="web-folder-scanner-input"
        type="file"
        multiple
        className="hidden"
        onChange={handleImportWebFolder}
        {...({ webkitdirectory: "", directory: "" } as any)}
      />

      {/* BACKGROUND CRAWLER MINIMIZED FLOATING BADGE */}
      {scanProgress.status !== "idle" && !showScannerDashboard && (
        <div
          id="scanner-minimized-badge"
          onClick={() => setShowScannerDashboard(true)}
          className="fixed bottom-6 right-6 z-50 bg-slate-900/90 backdrop-blur-md border border-indigo-500/40 text-indigo-300 px-4 py-3 rounded-2xl flex items-center gap-2.5 shadow-xl shadow-indigo-950/40 cursor-pointer hover:scale-105 transition-all text-xs font-semibold"
        >
          <div className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
          </div>
          <span>Scanner Background Tasks: {scanProgress.filesIndexedCount} indexed</span>
          <ChevronUp className="w-3.5 h-3.5 text-indigo-400" />
        </div>
      )}

      {/* BACKGROUND CRAWLER TELEMETRY HUD/OVERLAY */}
      {showScannerDashboard && (
        <div 
          id="scanner-hud-overlay"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md overflow-y-auto"
        >
          <div className="bg-slate-900/95 border border-slate-800 shadow-2xl p-6 rounded-3xl w-full max-w-lg flex flex-col gap-5 relative overflow-hidden">
            {/* Ambient Background Glow Effect */}
            <div className="absolute -top-10 -right-10 w-24 h-24 bg-indigo-600/10 rounded-full blur-2xl pointer-events-none" />
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800/40 pb-3">
              <div className="flex items-center gap-2">
                <HardDrive className="w-5 h-5 text-indigo-400" />
                <div>
                  <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider font-mono">
                    Storage Indexing Dashboard
                  </h3>
                  <p className="text-[10px] text-slate-500 mt-0.5 font-mono">
                    System thread status: COLD-START CRUISE
                  </p>
                </div>
              </div>
              <button
                id="btn-close-scanner-hud"
                onClick={() => setShowScannerDashboard(false)}
                className="p-1 px-1.5 bg-slate-850 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                title="Minimize dashboard to background"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Simulated Live Spinning Physical HDD Platters */}
            <div className="flex items-center gap-4 bg-slate-950/40 border border-slate-850 p-4 rounded-2xl">
              <div className="relative w-16 h-16 rounded-full bg-slate-900 border-2 border-slate-800 flex items-center justify-center overflow-hidden flex-shrink-0 shadow-[inset_0_2px_10px_rgba(0,0,0,0.8)]">
                {/* Physical rotor spinner */}
                <div 
                  className={`w-12 h-12 rounded-full border border-slate-700/60 flex items-center justify-center ${
                    scanProgress.status !== "idle" && scanProgress.status !== "completed" && scanProgress.status !== "error"
                      ? "animate-spin"
                      : ""
                  }`}
                  style={{ animationDuration: "2s" }}
                >
                  <div className="w-1 h-5 rounded-full bg-indigo-400 opacity-80" />
                </div>
                <div className="absolute w-3 h-3 bg-slate-950 border border-slate-700 rounded-full flex items-center justify-center">
                  <div className="w-1 h-1 bg-emerald-400 rounded-full" />
                </div>
              </div>
              
              <div className="flex-1 flex flex-col gap-1 min-w-0">
                <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                  Crawler Engine Status
                </span>
                <span className="text-xs font-mono text-indigo-300 flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    scanProgress.status === "completed"
                      ? "bg-emerald-400"
                      : scanProgress.status === "error"
                      ? "bg-rose-500"
                      : scanProgress.status === "idle"
                      ? "bg-slate-600"
                      : "bg-amber-400 animate-ping"
                  }`} />
                  {scanProgress.status.toUpperCase()}
                </span>
                <p className="text-[10px] text-slate-500 truncate mt-0.5">
                  {scanProgress.message}
                </p>
              </div>
            </div>

            {/* Folder progress detail */}
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono">
                <span>Indexing Details:</span>
                <span className="text-slate-500">
                  {scanProgress.filesIndexedCount} / {scanProgress.filesFoundCount} tracks synced
                </span>
              </div>
              
              {/* Progress bar */}
              <div className="w-full h-1.5 bg-slate-950/80 rounded-full overflow-hidden border border-slate-850/40 relative">
                <div 
                  className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-400 rounded-full transition-all duration-300"
                  style={{ 
                    width: `${
                      scanProgress.filesFoundCount > 0 
                        ? (scanProgress.filesIndexedCount / scanProgress.filesFoundCount) * 100 
                        : scanProgress.status === "completed" 
                        ? 100 
                        : 0
                    }%` 
                  }}
                />
              </div>

              {scanProgress.currentFolder && (
                <div className="bg-slate-950/30 border border-slate-800 px-3 py-2 rounded-xl text-[10px] font-mono text-slate-400 truncate flex items-center gap-1.5 mt-1">
                  <span className="text-emerald-400 font-bold">CRAWL:</span>
                  <span className="truncate">{scanProgress.currentFolder}</span>
                </div>
              )}
            </div>

            {/* Background Performance Guarantee Badge */}
            <div className="bg-indigo-950/20 border border-slate-800/60 p-3.5 rounded-2xl flex items-start gap-2.5">
              <div className="p-1 rounded bg-slate-900 border border-slate-800 shrink-0 select-none">
                🔊
              </div>
              <div className="flex-1 flex flex-col gap-0.5">
                <span className="text-[10px] font-bold text-slate-300 leading-normal">
                  Background Parallel Performance Guarantee
                </span>
                <p className="text-[9px] text-slate-500 leading-relaxed">
                  This crawler utilizes throttled asynchronous intervals to distribute storage directory directory lookups over microtasks. Your active sound stream, equalizer gain matrices, and graphics visualizers will run smoothly with ZERO interruption!
                </p>
              </div>
            </div>

            {/* Interactive Triggers section */}
            <div className="border-t border-slate-800/40 pt-4 flex flex-col gap-2.5">
              <span className="text-[10px] font-bold font-mono text-slate-400 uppercase tracking-widest">
                Testing Fallbacks & Import Options
              </span>

              <div className="grid grid-cols-2 gap-2.5 text-white">
                {/* HTML5 Folder Import button */}
                <button
                  id="btn-import-web-folder"
                  onClick={() => document.getElementById("web-folder-scanner-input")?.click()}
                  className="flex flex-col items-center justify-center p-3.5 rounded-2xl bg-slate-950/50 hover:bg-indigo-600/10 border border-slate-800 hover:border-indigo-500/50 text-slate-300 hover:text-white text-center gap-1.5 transition-all text-xs font-semibold select-none cursor-pointer"
                >
                  <FolderOpen className="w-5 h-5 text-indigo-400" />
                  <span>Crawl PC/Mac Folder</span>
                  <span className="text-[8px] text-slate-500 font-mono font-normal">recursive html5 import</span>
                </button>

                {/* Populated Atmospheric list button */}
                <button
                  id="btn-simulate-streams"
                  onClick={handleSimulateStreams}
                  className="flex flex-col items-center justify-center p-3.5 rounded-2xl bg-slate-950/50 hover:bg-emerald-600/10 border border-slate-800 hover:border-emerald-500/50 text-slate-300 hover:text-white text-center gap-1.5 transition-all text-xs font-semibold select-none cursor-pointer"
                >
                  <HardDrive className="w-5 h-5 text-emerald-400" />
                  <span>Crawl Atmospheric Streams</span>
                  <span className="text-[8px] text-slate-500 font-mono font-normal">simulated indexing catalog</span>
                </button>
              </div>

              {Capacitor.isNativePlatform() && (
                <button
                  id="btn-retrigger-native-scan"
                  onClick={handleStartScanner}
                  className="w-full bg-indigo-650 hover:bg-indigo-600 text-white font-bold text-center text-xs py-2.5 rounded-xl transition-all shadow-md shadow-indigo-600/10 mt-1 cursor-pointer"
                >
                  Retrigger Android Full Storage Scan
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
