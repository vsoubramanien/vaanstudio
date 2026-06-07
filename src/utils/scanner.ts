import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Track } from "../types";
import { saveTrackToDB } from "./db";

// Helper to delay execution and yield to the main thread
export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Convert raw base64 string from Capacitor Filesystem to a Blob
export function base64ToBlob(base64: string, mimeType: string = "audio/mpeg"): Blob {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

// Convert absolute/relative filename into clean artist and title metadata (fallback)
export function parseMetaFromFilename(filename: string): { title: string; artist: string; album: string } {
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");
  const hyphenIndex = nameWithoutExt.indexOf(" - ");
  
  let artist = "Local Library";
  let title = nameWithoutExt.trim();
  const album = "Device Storage";

  if (hyphenIndex !== -1) {
    artist = nameWithoutExt.substring(0, hyphenIndex).trim();
    title = nameWithoutExt.substring(hyphenIndex + 3).trim();
  }

  return { title, artist, album };
}

// Extract ID3v2 tags from a Buffer
export function parseID3Tags(arrayBuffer: ArrayBuffer, filename: string): { title: string; artist: string; album: string } {
  const fallback = parseMetaFromFilename(filename);
  let title = fallback.title;
  let artist = fallback.artist;
  let album = fallback.album;

  try {
    const view = new DataView(arrayBuffer);
    
    // Check if it starts with "ID3" (hex 49 44 33)
    if (view.byteLength > 10 && 
        view.getUint8(0) === 0x49 && 
        view.getUint8(1) === 0x44 && 
        view.getUint8(2) === 0x33) {
      
      const majorVersion = view.getUint8(3);
      
      // Get the ID3 tag size (syncsafe integer: 4 bytes of 7-bits each)
      const sizeBytes = [view.getUint8(6), view.getUint8(7), view.getUint8(8), view.getUint8(9)];
      const id3Size = (sizeBytes[0] << 21) | (sizeBytes[1] << 14) | (sizeBytes[2] << 7) | sizeBytes[3];
      
      let offset = 10;
      const limit = Math.min(id3Size + 10, view.byteLength);

      // Simple loop to crawl ID3 frames
      while (offset < limit - 10) {
        let frameId = "";
        for (let i = 0; i < 4; i++) {
          frameId += String.fromCharCode(view.getUint8(offset + i));
        }

        // If tag is padded/empty, break
        if (!frameId || frameId[0] === "\x00") break;

        let frameSize = 0;
        if (majorVersion === 4) {
          // Syncsafe frame sizes on v2.4
          frameSize = (view.getUint8(offset + 4) << 21) | 
                      (view.getUint8(offset + 5) << 14) | 
                      (view.getUint8(offset + 6) << 7) | 
                      view.getUint8(offset + 7);
        } else {
          // Normal 32-bit frame sizes on v2.3
          frameSize = view.getUint32(offset + 4);
        }

        if (frameSize <= 0 || offset + 10 + frameSize > view.byteLength) break;

        const contentOffset = offset + 10;
        
        // Handle common metadata frames (TIT2: Title, TPE1: Artist, TALB: Album)
        if (frameId === "TIT2" || frameId === "TPE1" || frameId === "TALB") {
          const encoding = view.getUint8(contentOffset);
          let text = "";

          // Frame contents excluding the encoding byte
          const textBytes = new Uint8Array(arrayBuffer, contentOffset + 1, frameSize - 1);
          
          if (encoding === 0) {
            // ISO-8859-1 (Western European / ASCII)
            text = new TextDecoder("windows-1252").decode(textBytes);
          } else if (encoding === 1) {
            // UTF-16 with BOM
            text = new TextDecoder("utf-16").decode(textBytes);
          } else if (encoding === 2) {
            // UTF-16BE (big endian)
            text = new TextDecoder("utf-16be").decode(textBytes);
          } else if (encoding === 3) {
            // UTF-8
            text = new TextDecoder("utf-8").decode(textBytes);
          }

          // Clean up whitespaces and nulls
          text = text.trim().replace(/\0/g, "");

          if (text) {
            if (frameId === "TIT2") title = text;
            else if (frameId === "TPE1") artist = text;
            else if (frameId === "TALB") album = text;
          }
        }

        offset += 10 + frameSize;
      }
    }
  } catch (e) {
    console.warn("Could not parse ID3 tags binaries from track:", filename, e);
  }

  return { title, artist, album };
}

// Probes an off-screen Audio element to retrieve media duration safely
export function getAudioDuration(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const tempUrl = URL.createObjectURL(blob);
    const audio = new Audio();
    audio.src = tempUrl;
    audio.preload = "metadata";
    audio.muted = true;
    
    // Safety guard to resolve if loading hangs
    const timeout = setTimeout(() => {
      audio.src = "";
      URL.revokeObjectURL(tempUrl);
      resolve(198); // standard default: 3:18
    }, 4000);

    audio.onloadedmetadata = () => {
      clearTimeout(timeout);
      const res = audio.duration;
      audio.src = "";
      URL.revokeObjectURL(tempUrl);
      resolve(isNaN(res) || !isFinite(res) ? 198 : res);
    };

    audio.onerror = () => {
      clearTimeout(timeout);
      audio.src = "";
      URL.revokeObjectURL(tempUrl);
      resolve(198);
    };
  });
}

// Check and request filesystem permissions
export async function requestStoragePermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true;
  try {
    const permits = await Filesystem.requestPermissions();
    return permits.publicStorage === "granted";
  } catch (err) {
    console.error("Failed requesting storage permissions:", err);
    return false;
  }
}

export interface ScanProgress {
  status: "idle" | "requesting" | "scanning" | "processing" | "saving" | "completed" | "error";
  currentFolder: string;
  filesFoundCount: number;
  filesIndexedCount: number;
  message: string;
}

// Standard file extensions denoting audio tracks we can import
const MUSIC_EXTENSIONS = [".mp3", ".m4a", ".wav", ".ogg", ".aac", ".flac"];

function isAudioFile(filename: string): boolean {
  const norm = filename.toLowerCase();
  return MUSIC_EXTENSIONS.some((ext) => norm.endsWith(ext));
}

// Native Android file crawl implementation
async function nativeAndroidCrawl(
  onProgress: (prog: ScanProgress) => void,
  onTrackAdded: (track: Track) => void
): Promise<void> {
  const hasPerms = await requestStoragePermission();
  if (!hasPerms) {
    onProgress({
      status: "error",
      currentFolder: "",
      filesFoundCount: 0,
      filesIndexedCount: 0,
      message: "Required filesystem permissions were denied.",
    });
    return;
  }

  // Common root folders on Android devices
  const rootDirectories = [
    { dir: Directory.Documents, path: "" },
    { dir: Directory.External, path: "" },
  ];

  let filesFound: { dir: Directory; path: string; name: string }[] = [];
  
  onProgress({
    status: "scanning",
    currentFolder: "Root Directories",
    filesFoundCount: 0,
    filesIndexedCount: 0,
    message: "Scanning system directories for audio files...",
  });

  const crawlRecursive = async (dir: Directory, currentSubPath: string) => {
    try {
      const readResult = await Filesystem.readdir({
        directory: dir,
        path: currentSubPath,
      });

      for (const item of readResult.files) {
        // Yield to browser execution to eliminate latency spikes
        await sleep(10);

        if (item.type === "directory") {
          const nextPath = currentSubPath ? `${currentSubPath}/${item.name}` : item.name;
          onProgress({
            status: "scanning",
            currentFolder: nextPath,
            filesFoundCount: filesFound.length,
            filesIndexedCount: 0,
            message: `Scanning folder: ${item.name}`,
          });
          await crawlRecursive(dir, nextPath);
        } else if (item.type === "file") {
          if (isAudioFile(item.name)) {
            const nextPath = currentSubPath ? `${currentSubPath}/${item.name}` : item.name;
            filesFound.push({ dir, path: nextPath, name: item.name });
            onProgress({
              status: "scanning",
              currentFolder: currentSubPath || "root",
              filesFoundCount: filesFound.length,
              filesIndexedCount: 0,
              message: `Found track: ${item.name}`,
            });
          }
        }
      }
    } catch (e) {
      console.warn(`Could not read directory path [${currentSubPath}] in storage:`, e);
    }
  };

  // Run crawls across defined directories sequentially
  for (const root of rootDirectories) {
    await crawlRecursive(root.dir, root.path);
  }

  if (filesFound.length === 0) {
    onProgress({
      status: "completed",
      currentFolder: "",
      filesFoundCount: 0,
      filesIndexedCount: 0,
      message: "No audio tracks (.mp3, .wav, .m4a) were found on device storage.",
    });
    return;
  }

  // Iterate files sequentially inside a delayed background queue
  let indexesCount = 0;
  for (const item of filesFound) {
    try {
      onProgress({
        status: "processing",
        currentFolder: item.path,
        filesFoundCount: filesFound.length,
        filesIndexedCount: indexesCount,
        message: `Reading metadata for: ${item.name}`,
      });

      // Yielding strictly to prevent any music stuttering
      await sleep(160);

      // Read file in base64 mode
      const rawFile = await Filesystem.readFile({
        directory: item.dir,
        path: item.path,
      });

      const mimeType = item.name.toLowerCase().endsWith(".wav")
        ? "audio/wav"
        : item.name.toLowerCase().endsWith(".ogg")
        ? "audio/ogg"
        : "audio/mpeg";

      const blob = base64ToBlob(rawFile.data as string, mimeType);
      const arrayBuffer = await blob.arrayBuffer();

      // Extract details
      const meta = parseID3Tags(arrayBuffer, item.name);
      const duration = await getAudioDuration(blob);

      // Save to IndexedDB (keeps files offline and playable)
      const scannedTrack: Track = {
        id: `scanned-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        title: meta.title,
        artist: meta.artist,
        album: meta.album,
        duration,
        src: URL.createObjectURL(blob),
        coverUrl: `https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=120&q=80`, // stylish ambient placeholder cover
        isUploaded: true, // handles db Blob conversion
      };

      await saveTrackToDB(scannedTrack, blob);
      onTrackAdded(scannedTrack);
      
      indexesCount++;
    } catch (err) {
      console.error(`Failed indexing device file ${item.name}:`, err);
    }
  }

  onProgress({
    status: "completed",
    currentFolder: "",
    filesFoundCount: filesFound.length,
    filesIndexedCount: indexesCount,
    message: `Successfully crawled and indexed ${indexesCount} local tracks to Vaan Player library!`,
  });
}

// HTML5 Folder Selector recursive crawling for standard browser fallback testing
export async function crawlHTML5DirectoryList(
  filesList: File[],
  onProgress: (prog: ScanProgress) => void,
  onTrackAdded: (track: Track) => void
): Promise<void> {
  const audioFiles = filesList.filter((f) => isAudioFile(f.name));

  if (audioFiles.length === 0) {
    onProgress({
      status: "completed",
      currentFolder: "",
      filesFoundCount: 0,
      filesIndexedCount: 0,
      message: "No compatible audio files found in selected folder.",
    });
    return;
  }

  let indexesCount = 0;
  onProgress({
    status: "processing",
    currentFolder: "Selected Folder",
    filesFoundCount: audioFiles.length,
    filesIndexedCount: 0,
    message: "Initializing folder parsing queue...",
  });

  for (const file of audioFiles) {
    try {
      onProgress({
        status: "processing",
        currentFolder: file.webkitRelativePath || "Custom Folder",
        filesFoundCount: audioFiles.length,
        filesIndexedCount: indexesCount,
        message: `Extracting tags: ${file.name}`,
      });

      // Soft throttling to guarantee completely smooth audio stream transitions
      await sleep(150);

      const arrayBuffer = await file.arrayBuffer();
      const meta = parseID3Tags(arrayBuffer, file.name);
      const duration = await getAudioDuration(file);

      const scannedTrack: Track = {
        id: `scanned-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        title: meta.title,
        artist: meta.artist,
        album: meta.album || "Local Import",
        duration,
        src: URL.createObjectURL(file),
        coverUrl: `https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=120&q=80`,
        isUploaded: true,
      };

      await saveTrackToDB(scannedTrack, file);
      onTrackAdded(scannedTrack);
      indexesCount++;
    } catch (e) {
      console.error(`HTML5 scanner failed to import file ${file.name}:`, e);
    }
  }

  onProgress({
    status: "completed",
    currentFolder: "",
    filesFoundCount: audioFiles.length,
    filesIndexedCount: indexesCount,
    message: `Successfully imported ${indexesCount} tracks to Vaan Player local index!`,
  });
}

// Primary entry point for Background Scanner orchestrator
export async function runBackgroundScanner(
  onProgress: (prog: ScanProgress) => void,
  onTrackAdded: (track: Track) => void,
  webSimulationFallback: () => Promise<void>
): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      await nativeAndroidCrawl(onProgress, onTrackAdded);
    } catch (e) {
      console.error("Native crawler crashed:", e);
      onProgress({
        status: "error",
        currentFolder: "",
        filesFoundCount: 0,
        filesIndexedCount: 0,
        message: "Native Android background filesystem scan encountered a fatal error.",
      });
    }
  } else {
    // Web simulation / Interactive prompt trigger
    await webSimulationFallback();
  }
}
