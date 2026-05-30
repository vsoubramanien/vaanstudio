export interface LyricsLine {
  time: number; // in seconds
  text: string;
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number; // in seconds
  src: string; // audio source URL or object URL
  coverUrl: string; // cover image URL
  lyrics?: string; // plain text lyrics
  syncedLyrics?: LyricsLine[]; // time-synced lyrics
  isUploaded?: boolean;
}

export interface EqualizerPreset {
  name: string;
  gains: number[]; // Array of 5 gains for frequencies: 60Hz, 230Hz, 910Hz, 4kHz, 14kHz
}
