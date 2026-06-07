import { Track, Playlist } from "../types";

const DB_NAME = "VaanMusicPlayerDB";
const STORE_NAME = "tracks";
const DB_VERSION = 2;

export interface DBTrackRecord {
  id: string;
  metadata: Omit<Track, "src"> & { src?: string };
  file?: Blob | File;
}

export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event: any) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("playlists")) {
        db.createObjectStore("playlists", { keyPath: "id" });
      }
    };
  });
}


export async function getTrackRecordFromDB(id: string): Promise<DBTrackRecord | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveTrackToDB(track: Track, file?: Blob | File): Promise<void> {
  const db = await openDB();

  // If a file was not passed, preserve the existing file if available
  let existingFile: Blob | File | undefined = file;
  if (!file) {
    try {
      const existingRecord = await getTrackRecordFromDB(track.id);
      if (existingRecord?.file) {
        existingFile = existingRecord.file;
      }
    } catch (e) {
      console.warn("Could not check existing track record for preservation:", e);
    }
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    // Keep non-uploaded tracks src alive, remove ephemeral ObjectURLs for local uploads
    const metadata = { ...track };
    if (track.isUploaded) {
      delete (metadata as any).src;
    }

    const record: DBTrackRecord = {
      id: track.id,
      metadata,
      file: existingFile,
    };

    const request = store.put(record);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function deleteTrackFromDB(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getAllTracksFromDB(): Promise<Track[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const records: DBTrackRecord[] = request.result || [];
      const tracks: Track[] = records.map((record) => {
        let src = record.metadata.src || "";
        if (record.file) {
          src = URL.createObjectURL(record.file);
        }
        return {
          ...record.metadata,
          src,
        };
      });
      resolve(tracks);
    };

    request.onerror = () => reject(request.error);
  });
}

export async function savePlaylistToDB(playlist: Playlist): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("playlists", "readwrite");
    const store = transaction.objectStore("playlists");
    const request = store.put(playlist);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function deletePlaylistFromDB(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("playlists", "readwrite");
    const store = transaction.objectStore("playlists");
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getAllPlaylistsFromDB(): Promise<Playlist[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains("playlists")) {
      resolve([]);
      return;
    }
    const transaction = db.transaction("playlists", "readonly");
    const store = transaction.objectStore("playlists");
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

