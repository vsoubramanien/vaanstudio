import React, { useRef, useState } from "react";
import { Track } from "../types";
import { Music, Play, AudioLines, FileDown, Trash2, PlusCircle } from "lucide-react";

interface TrackListProps {
  tracks: Track[];
  currentTrackId: string;
  isPlaying: boolean;
  onTrackSelect: (trackId: string) => void;
  onTrackUpload: (track: Track, file: File) => void;
  onTrackDelete: (trackId: string) => void;
}

export default function TrackList({
  tracks,
  currentTrackId,
  isPlaying,
  onTrackSelect,
  onTrackUpload,
  onTrackDelete,
}: TrackListProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Format seconds to mm:ss
  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs === Infinity) return "--:--";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

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

      // Assemble a beautiful custom avatar/cover URL
      // Let's make an elegant SVG-gradient based avatar in CSS styles!
      const randomHue = Math.floor(Math.random() * 360);
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

  return (
    <div className="w-full bg-slate-900/60 backdrop-blur-xl border border-slate-800/70 p-5 rounded-3xl flex flex-col gap-4 text-white">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-slate-800/50 pb-2">
        <div className="flex items-center gap-1.5 text-brand">
          <Music className="w-4 h-4" />
          <h3 className="text-xs font-semibold tracking-wider uppercase">Your Playlist</h3>
        </div>
        <span className="text-[10px] bg-slate-800 border border-slate-700/60 px-2 py-0.5 rounded-full font-mono text-slate-405">
          {tracks.length} {tracks.length === 1 ? "Track" : "Tracks"}
        </span>
      </div>
      {/* Playlist Grid Scrolling */}
      <div className="max-h-[220px] overflow-y-auto flex flex-col gap-2 pr-1 scrollbar-thin">
        {tracks.map((track) => {
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
                      isActive ? "text-brand-light" : "text-slate-200"
                    }`}
                  >
                    {track.title}
                  </h4>
                  <p className="text-[10px] text-slate-450 truncate mt-0.5 px-0.5 border-none">
                    {track.artist}
                  </p>
                </div>
              </div>

              {/* Action buttons (duration + optional delete) */}
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-mono text-slate-500">
                  {formatTime(track.duration)}
                </span>

                {track.isUploaded ? (
                  <button
                    id={`delete-track-${track.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onTrackDelete(track.id);
                    }}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 hover:text-rose-400 border border-slate-700/40 text-slate-400 transition-all cursor-pointer opacity-0 group-hover:opacity-100 focus:opacity-100"
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
        })}
      </div>

      {/* Modern drag and drop Audio File Uploader */}
      <div
        id="uploader-drop-zone"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border border-dashed rounded-2xl p-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
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
        <p className="text-[10px] text-slate-500 mt-1 select-none">
          Supports <b>.mp3</b>, <b>.flac</b>, <b>.wav</b> & others. Drag & drop files here.
        </p>
      </div>
    </div>
  );
}
