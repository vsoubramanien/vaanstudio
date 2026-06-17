import React, { useRef, useState, useEffect } from "react";
import { Track, Playlist } from "../types";
import {
  Music,
  Play,
  AudioLines,
  Trash2,
  PlusCircle,
  RefreshCw,
  FolderOpen,
  List,
  ListPlus,
  ArrowLeft,
  Check,
  Plus,
  FolderPlus
} from "lucide-react";

interface TrackListProps {
  tracks: Track[];
  currentTrackId: string;
  isPlaying: boolean;
  onTrackSelect: (trackId: string) => void;
  onTrackUpload: (track: Track, file: File) => void;
  onTrackDelete: (trackId: string) => void;
  onScanTrigger: () => void;
  scanStatus: "idle" | "requesting" | "scanning" | "processing" | "saving" | "completed" | "error";
  
  playlists: Playlist[];
  onPlaylistCreate: (name: string) => void;
  onPlaylistDelete: (id: string) => void;
  onTrackTogglePlaylist: (trackId: string, playlistId: string) => void;
  activePlaylistId: string | null;
  onActivePlaylistChange: (playlistId: string | null) => void;
}

export default function TrackList({
  tracks,
  currentTrackId,
  isPlaying,
  onTrackSelect,
  onTrackUpload,
  onTrackDelete,
  onScanTrigger,
  scanStatus,
  playlists,
  onPlaylistCreate,
  onPlaylistDelete,
  onTrackTogglePlaylist,
  activePlaylistId,
  onActivePlaylistChange,
}: TrackListProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<"tracks" | "playlists">("tracks");
  const [viewedPlaylistId, setViewedPlaylistId] = useState<string | null>(null);
  const [trackPlaylistDropdownId, setTrackPlaylistDropdownId] = useState<string | null>(null);
  const [newPlaylistName, setNewPlaylistName] = useState("");

  // Format seconds to mm:ss
  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs === Infinity) return "--:--";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = () => {
      setTrackPlaylistDropdownId(null);
    };
    window.addEventListener("click", handleOutsideClick);
    return () => window.removeEventListener("click", handleOutsideClick);
  }, []);

  // Process standard audio file upload
  const handleFiles = async (files: FileList) => {
    setIsProcessing(true);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith("audio/")) continue;

      // Extract details
      const fileUrl = URL.createObjectURL(file);
      const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
      const parts = nameWithoutExt.split(" - ");
      let title = nameWithoutExt;
      let artist = "Unknown Artist";

      if (parts.length > 1) {
        artist = parts[0].trim();
        title = parts.slice(1).join(" - ").trim();
      }

      // Read real duration from offscreen HTML5 audio helper
      const audioHelper = new Audio();
      audioHelper.src = fileUrl;

      // Wrap in a promise to extract metadata cleanly
      const duration = await new Promise<number>((resolve) => {
        audioHelper.onloadedmetadata = () => {
          resolve(audioHelper.duration || 180); // default to 3 mins if unreadable
        };
        audioHelper.onerror = () => {
          resolve(180);
        };
      });

      const coverPlaceholder = `https://picsum.photos/seed/${encodeURIComponent(title)}/400/400`;

      const newTrack: Track = {
        id: `uploaded-${Date.now()}-${i}`,
        title,
        artist,
        album: "Local Upload",
        duration: Math.round(duration),
        src: fileUrl,
        coverUrl: coverPlaceholder,
        lyrics: `Lyrics for "${title}" - Uploaded Track\n\nNo lyrics embedded. Press standard Edit button to add lyrics for this track!`,
        isUploaded: true,
      };

      onTrackUpload(newTrack, file);
    }
    setIsProcessing(false);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newPlaylistName.trim();
    if (!trimmed) return;
    onPlaylistCreate(trimmed);
    setNewPlaylistName("");
  };

  const activePlaylist = playlists.find((p) => p.id === activePlaylistId);
  const visibleTracks = activePlaylist
    ? tracks.filter((t) => activePlaylist.trackIds.includes(t.id))
    : tracks;

  const viewedPlaylist = playlists.find((p) => p.id === viewedPlaylistId);
  const viewedPlaylistTracks = viewedPlaylist
    ? tracks.filter((t) => viewedPlaylist.trackIds.includes(t.id))
    : [];

  return (
    <div className="w-full bg-slate-900/60 backdrop-blur-xl border border-slate-800/70 p-4 rounded-3xl flex flex-col gap-3 text-white h-full relative">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-slate-800/50 pb-2">
        <div className="flex items-center gap-1.5 text-brand">
          <Music className="w-4 h-4" />
          <h3 className="text-xs font-semibold tracking-wider uppercase">Your Playlist</h3>
        </div>
        
        <div className="flex items-center gap-1.5">
          <button
            id="btn-scan-trigger-tracklist"
            onClick={(e) => {
              e.stopPropagation();
              onScanTrigger();
            }}
            className={`flex items-center gap-1 text-[10px] uppercase tracking-wide font-bold px-2 py-0.5 rounded-lg border transition-all cursor-pointer ${
              scanStatus !== "idle" && scanStatus !== "completed" && scanStatus !== "error"
                ? "bg-amber-500/10 border-amber-500/40 text-amber-400 animate-pulse"
                : "bg-indigo-600/10 hover:bg-indigo-600/20 border-indigo-500/30 text-indigo-300"
            }`}
            title="Scan local directories or import folders in background"
          >
            {scanStatus !== "idle" && scanStatus !== "completed" && scanStatus !== "error" ? (
              <RefreshCw className="w-3 h-3 animate-spin" />
            ) : (
              <FolderOpen className="w-3 h-3" />
            )}
            <span>{scanStatus !== "idle" && scanStatus !== "completed" && scanStatus !== "error" ? "Scanning..." : "Scan"}</span>
          </button>

          <span className="text-[10px] bg-slate-800 border border-slate-700/60 px-2 py-0.5 rounded-full font-mono text-slate-400">
            {tracks.length} {tracks.length === 1 ? "Track" : "Tracks"}
          </span>
        </div>
      </div>

      {/* Sub tabs: Library vs Playlists */}
      <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800/60 text-xs shrink-0 select-none">
        <button
          onClick={() => {
            setActiveSubTab("tracks");
            setViewedPlaylistId(null);
          }}
          className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 font-semibold transition-all cursor-pointer ${
            activeSubTab === "tracks"
              ? "bg-brand/10 border border-brand/20 text-brand-light font-bold"
              : "border border-transparent text-slate-400 hover:text-slate-350"
          }`}
        >
          <Music className="w-3.5 h-3.5" />
          <span>Song Library</span>
        </button>
        <button
          onClick={() => setActiveSubTab("playlists")}
          className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 font-semibold transition-all cursor-pointer ${
            activeSubTab === "playlists"
              ? "bg-brand/10 border border-brand/20 text-brand-light font-bold"
              : "border border-transparent text-slate-400 hover:text-slate-350"
          }`}
        >
          <List className="w-3.5 h-3.5" />
          <span>Playlists</span>
          {playlists.length > 0 && (
            <span className="text-[9px] bg-slate-850 text-slate-300 px-1.5 py-0.2 rounded-full border border-slate-700/60 font-mono">
              {playlists.length}
            </span>
          )}
        </button>
      </div>

      {/* RENDER ACTIVE TAB */}
      {activeSubTab === "tracks" ? (
        <div className="flex-1 flex flex-col gap-3 min-h-0">
          {/* Active Playlist Filter Banner */}
          {activePlaylist && (
            <div className="flex items-center justify-between bg-brand/5 border border-brand/20 px-3.5 py-2 rounded-2xl shrink-0 text-slate-200">
              <div className="flex items-center gap-2 min-w-0">
                <span className="flex h-2 w-2 relative shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-light opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-light"></span>
                </span>
                <div className="min-w-0">
                  <p className="text-[9px] text-slate-500 uppercase tracking-widest leading-none font-bold">Queue Restricted</p>
                  <p className="text-xs font-semibold truncate mt-0.5 text-brand-light">{activePlaylist.name}</p>
                </div>
              </div>
              <button
                onClick={() => onActivePlaylistChange(null)}
                className="text-[10px] bg-slate-800 hover:bg-slate-700/60 px-2 py-1 rounded-lg border border-slate-700/40 text-slate-300 transition-all cursor-pointer hover:text-white font-semibold"
              >
                Clear Queue Filter
              </button>
            </div>
          )}

          {/* Playlist grid listing */}
          <div className="flex-1 overflow-y-auto flex flex-col gap-2 pr-1 scrollbar-thin">
            {visibleTracks.length === 0 ? (
              <div className="w-full h-full bg-slate-950/20 border border-slate-800/40 p-6 rounded-3xl flex flex-col justify-center items-center text-slate-400 gap-1.5 min-h-[160px]">
                <Music className="w-8 h-8 text-slate-600 animate-pulse" />
                <span className="text-xs font-semibold">Playlist is empty</span>
                <p className="text-[10px] text-slate-500 text-center max-w-[200px]">Reset the queue filter to view the library, then click "+" to add songs!</p>
              </div>
            ) : (
              visibleTracks.map((track, idx) => {
                const isActive = track.id === currentTrackId;
                return (
                  <div
                    key={track.id}
                    onClick={() => onTrackSelect(track.id)}
                    className={`flex items-center justify-between p-2 rounded-2xl cursor-pointer group hover:bg-slate-800/40 border border-transparent transition-all ${
                      isActive
                        ? "bg-brand/10 border-brand/20 shadow-inner"
                        : ""
                    }`}
                  >
                    {/* Cover Art and Info */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative w-10 h-10 rounded-xl overflow-hidden shadow bg-slate-950 shrink-0 border border-slate-800">
                        <img
                          src={track.coverUrl}
                          alt={track.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover select-none"
                        />
                        {isActive && isPlaying && (
                          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                            <div className="flex items-end gap-0.5 h-4 w-4">
                              <div className="w-0.5 bg-brand-light animate-[bounce_0.8s_infinite_100ms]" style={{ height: '40%' }} />
                              <div className="w-0.5 bg-brand-light animate-[bounce_0.8s_infinite_300ms]" style={{ height: '100%' }} />
                              <div className="w-0.5 bg-brand-light animate-[bounce_0.8s_infinite_200ms]" style={{ height: '60%' }} />
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex flex-col justify-center">
                        <h4
                          className={`text-xs font-semibold leading-tight truncate px-0.5 ${
                            isActive ? "text-brand-light" : "text-slate-205"
                          }`}
                        >
                          {track.title}
                        </h4>
                        <p className="text-[10px] text-slate-400 truncate mt-0.5 px-0.5 border-none">
                          {track.artist}
                        </p>
                      </div>
                    </div>

                    {/* Action buttons (duration + dropdown + standard remove) */}
                    <div className="flex items-center gap-2 relative">
                      <span className="text-[10px] font-mono text-slate-500">
                        {formatTime(track.duration)}
                      </span>

                      {/* Add to Playlist Context Target */}
                      <button
                        id={`add-to-pl-${track.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setTrackPlaylistDropdownId(
                            trackPlaylistDropdownId === track.id ? null : track.id
                          );
                        }}
                        className={`p-1 rounded-lg border text-slate-450 hover:text-slate-200 transition-all cursor-pointer ${
                          trackPlaylistDropdownId === track.id
                            ? "bg-brand/15 border-brand/50 text-brand-light"
                            : "bg-slate-800/50 border-slate-700/40 hover:bg-slate-750"
                        }`}
                        title="Add to Playlist"
                      >
                        <ListPlus className="w-3.5 h-3.5" />
                      </button>

                      {/* Dropdown popup overlay */}
                      {trackPlaylistDropdownId === track.id && (
                        <div 
                          onClick={(e) => e.stopPropagation()}
                          className={`absolute right-0 z-50 w-44 bg-slate-950 border border-slate-800 p-1 rounded-xl shadow-2xl flex flex-col backdrop-blur-xl animate-in fade-in duration-150 ${
                            idx === 0
                              ? "top-8 mt-1 slide-in-from-top-1"
                              : "bottom-8 slide-in-from-bottom-1"
                          }`}
                        >
                          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest px-2 py-1 select-none border-b border-slate-900 mb-1 leading-none">Add to Playlist</p>
                          {playlists.length === 0 ? (
                            <div className="p-2 text-center text-[9px] text-slate-650 font-medium">To create playlists, go to the Playlists tab.</div>
                          ) : (
                            <div className="max-h-32 overflow-y-auto flex flex-col gap-0.5">
                              {playlists.map((pl) => {
                                const inPlaylist = pl.trackIds.includes(track.id);
                                return (
                                  <button
                                    key={pl.id}
                                    onClick={() => onTrackTogglePlaylist(track.id, pl.id)}
                                    className="flex items-center justify-between text-left px-2 py-1.25 rounded-md text-[10px] hover:bg-slate-900 text-slate-300 hover:text-white transition-colors cursor-pointer"
                                  >
                                    <span className="truncate pr-1.5 font-medium">{pl.name}</span>
                                    {inPlaylist ? (
                                      <Check className="w-3 h-3 text-brand" />
                                    ) : (
                                      <Plus className="w-3 h-3 text-slate-600" />
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      {track.isUploaded ? (
                        <button
                          id={`delete-track-${track.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onTrackDelete(track.id);
                          }}
                          className="p-1.5 rounded-lg bg-slate-805 hover:bg-rose-950 hover:text-rose-450 border border-slate-700/40 text-slate-400 transition-all cursor-pointer"
                          title="Remove Song"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <div className="w-6" /> // spacer to align
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : (
        /* PLAYLISTS TAB VIEW */
        <div className="flex-1 flex flex-col gap-3 min-h-0">
          {viewedPlaylistId === null ? (
            /* ALL PLAYLIST CARDS */
            <>
              {/* Creator Form */}
              <form onSubmit={handleCreateSubmit} className="flex gap-2 shrink-0">
                <input
                  type="text"
                  placeholder="Create active custom playlist..."
                  value={newPlaylistName}
                  onChange={(e) => setNewPlaylistName(e.target.value)}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 transition-all"
                />
                <button
                  type="submit"
                  className="bg-brand/10 hover:bg-brand/20 border border-brand/30 hover:border-brand/50 text-brand-light text-xs font-bold px-3 py-2 rounded-xl transition-all cursor-pointer"
                >
                  Create
                </button>
              </form>

              {/* Lists of playlists */}
              {playlists.length === 0 ? (
                <div className="flex-1 flex flex-col justify-center items-center text-center p-6 text-slate-500 gap-2 min-h-[160px]">
                  <FolderPlus className="w-8 h-8 text-slate-700 animate-pulse" />
                  <span className="text-xs font-semibold text-slate-400">No playlists available</span>
                  <p className="text-[10px] text-slate-500 max-w-[200px]">Create an active playlist above, then add some catalog tracks using the library "+" menu!</p>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto flex flex-col gap-2 pr-1 scrollbar-thin">
                  {playlists.map((pl) => {
                    const isFullyActive = pl.id === activePlaylistId;
                    return (
                      <div
                        key={pl.id}
                        onClick={() => setViewedPlaylistId(pl.id)}
                        className={`flex items-center justify-between p-3 rounded-2xl cursor-pointer bg-slate-950/45 border transition-all hover:bg-slate-950/80 group ${
                          isFullyActive
                            ? "border-brand-light/35 shadow-[0_0_12px_rgba(34,211,238,0.06)]"
                            : "border-slate-800/40 hover:border-slate-800"
                        }`}
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className={`p-2 rounded-xl ${isFullyActive ? "bg-brand/10 text-brand-light" : "bg-slate-900 text-slate-400"} shrink-0`}>
                            <List className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex flex-col justify-center">
                            <span className="text-xs font-semibold text-slate-200 truncate group-hover:text-white transition-colors">{pl.name}</span>
                            <span className="text-[9px] text-slate-550 font-mono mt-0.5">{pl.trackIds.length} {pl.trackIds.length === 1 ? "track" : "tracks"}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {pl.trackIds.length > 0 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onActivePlaylistChange(pl.id);
                                // Play first song in this playlist
                                const matchTrack = tracks.find((t) => pl.trackIds.includes(t.id));
                                if (matchTrack) {
                                  onTrackSelect(matchTrack.id);
                                }
                              }}
                              className="p-1.5 rounded-lg bg-indigo-600/15 hover:bg-indigo-600/30 border border-indigo-500/25 text-indigo-305 transition-all cursor-pointer"
                              title="Engage and Play Playlist"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onPlaylistDelete(pl.id);
                            }}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/45 hover:text-rose-450 border border-slate-700/40 text-slate-400 transition-all cursor-pointer opacity-0 group-hover:opacity-100 focus:opacity-100"
                            title="Delete Playlist"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            /* DEEP DIVE INSIDE VIEWED PLAYLIST */
            <>
              {/* Back / Title header */}
              {viewedPlaylist && (
                <div className="flex items-center justify-between border-b border-slate-900 pb-2.5 shrink-0 select-none">
                  <button
                    onClick={() => setViewedPlaylistId(null)}
                    className="flex items-center gap-1.25 text-[10px] font-bold text-slate-400 hover:text-white bg-slate-950 border border-slate-800 px-2 py-1 rounded-lg transition-all cursor-pointer"
                  >
                    <ArrowLeft className="w-3 h-3" />
                    <span>Playlists</span>
                  </button>
                  <div className="text-right min-w-0 pr-1.5">
                    <h4 className="text-xs font-bold text-brand-light truncate leading-none mb-1">{viewedPlaylist.name}</h4>
                    <span className="text-[9px] font-mono text-slate-500">{viewedPlaylist.trackIds.length} loaded</span>
                  </div>
                </div>
              )}

              {/* Tracks inside viewed playlist */}
              <div className="flex-1 overflow-y-auto flex flex-col gap-2 pr-1 scrollbar-thin">
                {viewedPlaylistTracks.length === 0 ? (
                  <div className="w-full h-full p-6 text-center text-slate-500 flex flex-col justify-center items-center gap-1.5 min-h-[160px]">
                    <Music className="w-8 h-8 text-slate-755" />
                    <span className="text-xs font-medium text-slate-400">Empty Playlist</span>
                    <p className="text-[9px] text-slate-500 max-w-[180px]">Go back to Library, click "+" on songs next to them to select this playlist!</p>
                  </div>
                ) : (
                  viewedPlaylistTracks.map((track) => {
                    const isActive = track.id === currentTrackId;
                    return (
                      <div
                        key={track.id}
                        onClick={() => onTrackSelect(track.id)}
                        className={`flex items-center justify-between p-1.5 rounded-xl cursor-pointer group hover:bg-slate-850/50 border border-transparent transition-all ${
                          isActive ? "bg-brand/10 border-brand/20 shadow-inner" : ""
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="relative w-8 h-8 rounded-lg overflow-hidden shrink-0 border border-slate-800 bg-slate-900 bg-cover">
                            <img src={track.coverUrl} alt={track.title} className="w-full h-full object-cover select-none" />
                            {isActive && isPlaying && (
                              <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                <div className="flex items-end gap-0.5 h-3 w-3">
                                  <div className="w-0.5 bg-brand-light animate-[bounce_0.8s_infinite_100ms]" style={{ height: '40%' }} />
                                  <div className="w-0.5 bg-brand-light animate-[bounce_0.8s_infinite_300ms]" style={{ height: '100%' }} />
                                  <div className="w-0.5 bg-brand-light animate-[bounce_0.8s_infinite_200ms]" style={{ height: '60%' }} />
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <h4 className={`text-[11px] font-bold truncate leading-tight ${isActive ? "text-brand-light" : "text-slate-205"}`}>{track.title}</h4>
                            <span className="text-[9px] text-slate-400 truncate block mt-0.5">{track.artist}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-slate-500">{formatTime(track.duration)}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onTrackTogglePlaylist(track.id, viewedPlaylist!.id);
                            }}
                            className="p-1 rounded bg-slate-900 border border-slate-850 text-slate-500 hover:text-rose-400 hover:border-rose-955 transition-colors cursor-pointer"
                            title="Remove from Playlist"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Modern drag and drop Audio File Uploader */}
      <div
        id="uploader-drop-zone"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border border-dashed rounded-2xl p-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all shrink-0 ${
          isDragging
            ? "border-brand-light/40 bg-brand-transparent text-brand-light"
            : "border-slate-800 hover:border-slate-700 bg-slate-950/40 text-slate-400 hover:text-slate-350"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/mp3, audio/flac, audio/wav, audio/mpeg, audio/ogg, audio/x-m4a, audios/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
          }}
        />

        <div className="flex items-center gap-2">
          {isProcessing ? (
            <div className="w-4 h-4 rounded-full border-2 border-brand-light border-t-transparent animate-spin" />
          ) : (
            <PlusCircle className="w-4 h-4 text-brand-light" />
          )}
          <span className="text-xs font-semibold">
            {isProcessing ? "Processing audio metadata..." : "Add your custom songs"}
          </span>
        </div>
        <p className="text-[10px] text-slate-550 mt-1 select-none">
          Supports <b>.mp3</b>, <b>.flac</b>, <b>.wav</b> & others. Drag & drop files here.
        </p>
      </div>
    </div>
  );
}
