import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

// Simple hash helper to distribute SoundHelix track audio sources
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return hash;
}

// Map of beautiful theme images curated using high-quality photography
const THEME_COVERS: Record<string, string> = {
  starry_sky: "https://images.unsplash.com/photo-1506318137071-a8e063b4bec0?w=400&auto=format&fit=crop&q=80",
  blue_clouds: "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=400&auto=format&fit=crop&q=80",
  sunset_vibe: "https://images.unsplash.com/photo-1490730141103-6cac27aaab94?w=400&auto=format&fit=crop&q=80",
  neon_night: "https://images.unsplash.com/photo-1515621061946-eff1c2a352bd?w=400&auto=format&fit=crop&q=80",
  aurora_sky: "https://images.unsplash.com/photo-1529963183134-61a90db47eaf?w=400&auto=format&fit=crop&q=80",
  lofi_rain: "https://images.unsplash.com/photo-1428908728789-d2de25dbd4e2?w=400&auto=format&fit=crop&q=80",
  acoustic_fields: "https://images.unsplash.com/photo-1448375240586-882707db888b?w=400&auto=format&fit=crop&q=80",
  cosmic_nebula: "https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=400&auto=format&fit=crop&q=80"
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Initialize Gemini Client
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  // API endpoint for searching and generating tracks with synced lyrics
  app.post("/api/search-song", async (req, res) => {
    const { query } = req.body;
    if (!query || typeof query !== "string" || !query.trim()) {
      return res.status(400).json({ error: "Search query is required." });
    }

    try {
      console.log(`Searching for songs matching track keyword: "${query}"`);

      const prompt = `You are VaanMusicPlayer's AI Music Discovery & Lyric Engine. The name "Vaan" means Sky in Tamil.
The user is searching for songs matching: "${query}".

Analyze the search query. If the user refers to a real song, search for its actual details (or estimate/retrieve details accurately). If the user inputs a creative description, concept, Tamil concept, keyword, or mood, generate a beautiful original song concept matching the sky/ambient spirit of Vaan.

Generate exactly 3 potential song results in JSON format. Provide detailed time-synced lyrics (syncedLyrics with 8-15 logically timed lines matching the song's key verses) and a full text lyrics string.
Each song must be assigned a visual theme of cover art from the following list: "starry_sky", "blue_clouds", "sunset_vibe", "neon_night", "aurora_sky", "lofi_rain", "acoustic_fields", "cosmic_nebula". Pick the one that fits best.

Return a valid JSON array of up to 3 objects matching the exact required schema. Do not include markdown tags like \`\`\`json outside the actual payload return.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            description: "A list of 3 matching song results",
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING, description: "The song title" },
                artist: { type: Type.STRING, description: "Artist or band name" },
                album: { type: Type.STRING, description: "Album name (or Single / Year)" },
                duration: { type: Type.INTEGER, description: "Duration in seconds (e.g. 180 to 300)" },
                visualTheme: { type: Type.STRING, description: "One of: starry_sky, blue_clouds, sunset_vibe, neon_night, aurora_sky, lofi_rain, acoustic_fields, cosmic_nebula" },
                lyrics: { type: Type.STRING, description: "Full plain text lyrics" },
                syncedLyrics: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      time: { type: Type.INTEGER, description: "Time timestamp in seconds when this line is sung/played" },
                      text: { type: Type.STRING, description: "The lyric text line" }
                    },
                    required: ["time", "text"]
                  }
                }
              },
              required: ["title", "artist", "album", "duration", "visualTheme", "lyrics", "syncedLyrics"]
            }
          }
        }
      });

      const responseText = response.text || "[]";
      let rawResults = JSON.parse(responseText);

      if (!Array.isArray(rawResults)) {
        rawResults = [rawResults];
      }

      // Map results to the clean runtime client structure including audio stream and coverURL
      const songs = rawResults.map((song: any, index: number) => {
        const title = song.title || "Vaan Theme";
        const artist = song.artist || "Celestial Engine";
        const album = song.album || "Milky Way Studio";
        const duration = song.duration || 210;

        // SoundHelix has 1-16 available tracks. Assign a track index deterministically based on title name.
        const hashVal = hashString(title);
        const songIndex = (Math.abs(hashVal) % 16) + 1;
        const src = `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-${songIndex}.mp3`;

        // Pick matching curated high-res background cover art or default to starry_sky
        const visualTheme = song.visualTheme || "starry_sky";
        const coverUrl = THEME_COVERS[visualTheme] || THEME_COVERS.starry_sky;

        return {
          id: `ai-search-${Date.now()}-${index}`,
          title,
          artist,
          album,
          duration,
          src,
          coverUrl,
          lyrics: song.lyrics,
          syncedLyrics: song.syncedLyrics,
          isUploaded: true // Allows dynamic deletion
        };
      });

      res.json(songs);
    } catch (err: any) {
      console.error("Gemini song search error:", err);
      res.status(500).json({ error: "Failed to generate AI search results." });
    }
  });

  // Mount Vite middleware or Static asset directory depending on production mode
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server successfully running on port ${PORT}`);
  });
}

startServer();
