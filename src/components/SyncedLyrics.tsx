import { useEffect, useRef, useState } from "react";
import { LyricsLine, Track } from "../types";
import { Music, Eye, Edit3, Save, Sparkles } from "lucide-react";

interface SyncedLyricsProps {
  track: Track;
  currentTime: number;
  onLyricsUpdate: (trackId: string, plainLyrics: string, syncedLyrics?: LyricsLine[]) => void;
}

export default function SyncedLyrics({
  track,
  currentTime,
  onLyricsUpdate,
}: SyncedLyricsProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const activeLineRef = useRef<HTMLDivElement | null>(null);
  const [activeLineIndex, setActiveLineIndex] = useState<number>(-1);
  const [isEditing, setIsEditing] = useState(false);
  const [editedLyrics, setEditedLyrics] = useState(track.lyrics || "");
  const [lyricsViewMode, setLyricsViewMode] = useState<"synced" | "plain">("synced");

  const hasSynced = track.syncedLyrics && track.syncedLyrics.length > 0;

  // Track the active lyrics index in real-time
  useEffect(() => {
    if (!hasSynced || !track.syncedLyrics) {
      setActiveLineIndex(-1);
      return;
    }

    // Find the latest line with timestamp <= currentTime
    let index = -1;
    for (let i = 0; i < track.syncedLyrics.length; i++) {
      if (currentTime >= track.syncedLyrics[i].time) {
        index = i;
      } else {
        break;
      }
    }

    setActiveLineIndex(index);
  }, [currentTime, track.syncedLyrics, hasSynced]);

  // Smoothly scroll active lyrics lines to center
  useEffect(() => {
    if (activeLineRef.current && containerRef.current && hasSynced) {
      const activeEl = activeLineRef.current;
      const container = containerRef.current;

      const activeTop = activeEl.offsetTop;
      const activeHeight = activeEl.offsetHeight;
      const containerHeight = container.clientHeight;

      // Scroll to center
      container.scrollTo({
        top: activeTop - containerHeight / 2 + activeHeight / 2,
        behavior: "smooth",
      });
    }
  }, [activeLineIndex, hasSynced]);

  // Sync state if song changes
  useEffect(() => {
    setEditedLyrics(track.lyrics || "");
    setIsEditing(false);
  }, [track]);

  // Handle saving pasted or custom edited lyrics
  const handleSaveLyrics = () => {
    // Generate simple timestamps model in chronological 10s increments if saving raw text as a baseline helper, 
    // or try parsing standard [mm:ss.xx] LRC formatted lyrics!
    const lrcLines = parseLRC(editedLyrics);
    if (lrcLines.length > 0) {
      onLyricsUpdate(track.id, editedLyrics, lrcLines);
      setLyricsViewMode("synced");
    } else {
      // Just save standard plain lyrics, and create dynamic synced intervals on save if needed
      onLyricsUpdate(track.id, editedLyrics);
      setLyricsViewMode("plain");
    }
    setIsEditing(false);
  };

  // Helper to parse standard .lrc file contents if they copy-paste one
  const parseLRC = (text: string): LyricsLine[] => {
    const lines = text.split("\n");
    const result: LyricsLine[] = [];
    const lrcRegex = /\[(\d{2}):(\d{2})\.(\d{2})\](.*)/;
    const briefRegex = /\[(\d{2}):(\d{2})\](.*)/;

    lines.forEach((line) => {
      let match = lrcRegex.exec(line);
      if (match) {
        const mins = parseInt(match[1]);
        const secs = parseInt(match[2]);
        const ms = parseInt(match[3]);
        const time = mins * 60 + secs + ms / 100;
        const txt = match[4].trim();
        result.push({ time, text: txt });
      } else {
        match = briefRegex.exec(line);
        if (match) {
          const mins = parseInt(match[1]);
          const secs = parseInt(match[2]);
          const time = mins * 60 + secs;
          const txt = match[3].trim();
          result.push({ time, text: txt });
        }
      }
    });

    return result.sort((a, b) => a.time - b.time);
  };

  // Generate simulated dynamic lyrics for custom tracks that don't have lyrics
  const handleAutoGenerateLyrics = () => {
    const words = [
      "Cruising down the highway, under neon skies...",
      "Can you feel the frequency, vibrating high?",
      "Every beat, a heartbeat, syncing to our speed.",
      "Just another melody, everything we need.",
      "Moving, flowing, through the stream of time.",
      "Equalizing spirits, rhythm so sublime.",
      "Analog dreams fading into digital space.",
      "Let the bass-heavy balance carry us to this place.",
    ];
    
    // Distribute equally across track duration
    const secondsInterval = track.duration / (words.length + 2);
    const simulatedLrc: LyricsLine[] = [
      { time: 0, text: "🎵 [Procedural Soundscape Ambient Beats] 🎵" },
    ];
    
    words.forEach((w, idx) => {
      simulatedLrc.push({
        time: Math.floor((idx + 1) * secondsInterval),
        text: w,
      });
    });

    simulatedLrc.push({
      time: Math.floor((words.length + 1) * secondsInterval),
      text: "🎵 [Equalizer Echo Outro] 🎵",
    });

    // Format plain representation
    const plainText = simulatedLrc
      .map((l) => {
        const mm = Math.floor(l.time / 60).toString().padStart(2, "0");
        const ss = Math.floor(l.time % 60).toString().padStart(2, "0");
        return `[${mm}:${ss}] ${l.text}`;
      })
      .join("\n");

    onLyricsUpdate(track.id, plainText, simulatedLrc);
    setEditedLyrics(plainText);
    setLyricsViewMode("synced");
  };

  return (
    <div className="w-full bg-slate-900/60 backdrop-blur-xl border border-slate-800/70 p-4 rounded-3xl flex flex-col gap-3 text-white h-full min-h-[280px] relative overflow-hidden">
      {/* Upper Navigation Bar */}
      <div className="flex items-center justify-between border-b border-slate-800/50 pb-2 z-10 bg-transparent shrink-0">
        <div className="flex items-center gap-1.5 text-brand">
          <Music className="w-4 h-4" />
          <h3 className="text-xs font-semibold tracking-wider uppercase">Lyrics Display</h3>
        </div>

        <div className="flex items-center gap-2">
          {!isEditing && hasSynced && (
            <div className="flex bg-slate-800/80 rounded-lg p-0.5 border border-slate-700/40 text-[10px]">
              <button
                id="lyrics-mode-synced"
                onClick={() => setLyricsViewMode("synced")}
                className={`px-2 py-0.5 rounded-md transition-all ${
                  lyricsViewMode === "synced"
                    ? "bg-brand text-white font-semibold shadow-md shadow-brand/10"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Synced
              </button>
              <button
                id="lyrics-mode-plain"
                onClick={() => setLyricsViewMode("plain")}
                className={`px-2 py-0.5 rounded-md transition-all ${
                  lyricsViewMode === "plain"
                    ? "bg-brand text-white font-semibold shadow-md shadow-brand/10"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Full Text
              </button>
            </div>
          )}

          {!isEditing ? (
            <button
              id="lyrics-edit-btn"
              onClick={() => setIsEditing(true)}
              className="p-1 rounded-xl bg-slate-800/60 border border-slate-700/40 hover:bg-slate-700/80 transition-all text-slate-300 flex items-center gap-1 text-[10px]"
              title="Edit / Add Custom Lyrics"
            >
              <Edit3 className="w-3.5 h-3.5" /> Edit
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              {!hasSynced && (
                <button
                  id="lyrics-autogen-btn"
                  onClick={handleAutoGenerateLyrics}
                  className="px-2 py-1 rounded-lg bg-emerald-950/70 text-emerald-300 border border-emerald-800/50 hover:bg-emerald-900 transition-all text-[9px] flex items-center gap-1"
                  title="Generate simulated synced lyrics"
                >
                  <Sparkles className="w-3 h-3" /> Auto Sync
                </button>
              )}
              <button
                id="lyrics-save-btn"
                onClick={handleSaveLyrics}
                className="px-2.5 py-1 rounded-lg bg-brand hover:bg-brand-light transition-all text-white text-[10px] flex items-center gap-1 font-semibold"
              >
                <Save className="w-3 h-3" /> Save
              </button>
              <button
                id="lyrics-cancel-btn"
                onClick={() => {
                  setEditedLyrics(track.lyrics || "");
                  setIsEditing(false);
                }}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 hover:text-white text-[10px] text-slate-400"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Lyrics Body Frame */}
      <div className="flex-1 overflow-y-auto relative w-full h-full">
        {isEditing ? (
          <div className="w-full h-full flex flex-col gap-2">
            <textarea
              id="lyrics-editor-textarea"
              value={editedLyrics}
              onChange={(e) => setEditedLyrics(e.target.value)}
              placeholder="Paste lyrics here. You can paste standard timestamp tags formatted like [00:15] to sync them with time, or paste regular plain text song lines."
              className="w-full flex-1 bg-slate-950/80 border border-slate-800 rounded-2xl p-3 text-xs outline-none focus:border-brand/85 focus:ring-1 focus:ring-brand font-mono resize-none leading-relaxed text-slate-200"
            />
            <span className="text-[9px] font-mono text-slate-500">
              Format tip: <code className="text-slate-400">[02:14] Your lyric text</code> adds automated sync.
            </span>
          </div>
        ) : lyricsViewMode === "synced" && hasSynced && track.syncedLyrics ? (
          /* Apple Music scrolling layout */
          <div
            ref={containerRef}
            className="w-full h-full overflow-y-auto scrollbar-none flex flex-col gap-5 py-[80px] pb-[100px] select-none scroll-smooth"
            style={{ maskImage: "linear-gradient(to bottom, transparent 0%, white 35%, white 65%, transparent 100%)", WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, white 35%, white 65%, transparent 100%)" }}
          >
            {track.syncedLyrics.map((line, idx) => {
              const isActive = idx === activeLineIndex;
              const isPast = idx < activeLineIndex;

              return (
                <div
                  key={idx}
                  ref={isActive ? activeLineRef : null}
                  className={`text-center transition-all duration-300 font-sans tracking-tight ${
                    isActive
                      ? "text-xl font-bold text-white scale-[1.04] opacity-100 filter drop-shadow-[0_0_8px_rgba(255,78,0,0.5)]"
                      : isPast
                      ? "text-sm text-slate-400 opacity-60 font-medium scale-[0.98] blur-[0.3px]"
                      : "text-sm text-slate-500 opacity-40 font-medium scale-[0.97] blur-[0.5px]"
                  }`}
                >
                  {line.text}
                </div>
              );
            })}
          </div>
        ) : (
          /* Standard fallback text view */
          <div className="w-full h-full overflow-y-auto pr-1 text-slate-300 flex flex-col text-sm whitespace-pre-wrap leading-relaxed px-2 py-1 font-sans text-center">
            {track.lyrics ? (
              // render plain lyrics without timestamps
              track.lyrics.replace(/\[\d{2}:\d{2}(\.\d{2})?\]\s*/g, "")
            ) : (
              <div className="h-full flex flex-col justify-center items-center gap-1.5 text-center p-4">
                <p className="text-slate-400 text-xs font-semibold">No Lyrics Available</p>
                <p className="text-[11px] text-slate-500 max-w-[200px]">
                  Click the <b>Edit</b> button to paste lyrics, or tap <b>Auto Sync</b> to generate simulated lyrics.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
