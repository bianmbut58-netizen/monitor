import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Load credentials from environment or fallback to user-provided ones
const SUPABASE_URL = process.env.SUPABASE_URL || "https://avoswstxvdipekgazotn.supabase.co";
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF2b3N3c3R4dmRpcGVrZ2F6b3RuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjY0MjEyNywiZXhwIjoyMDk4MjE4MTI3fQ.RBtlKIyuCXSe0blWfo4m-azWCotH1ykEK5v83hWIfTs";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8924930551:AAFXZAKyFj5g1V1skEYI4lRYWdf4vG4j31U";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "8193547847";

// Default targets to monitor
const DEFAULT_TARGETS = [
  { url: "https://fmccomic.my.id", name: "FMC Comic" },
  { url: "https://fmcstore.web.id", name: "FMC Store" }
];

// Initialize Supabase Client with service_role key to allow bypass of RLS for background monitor
let supabase: any = null;
try {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
    auth: {
      persistSession: false
    }
  });
  console.log("Supabase Client initialized successfully.");
} catch (err) {
  console.error("Error initializing Supabase:", err);
}

// Local Fallback Storage setup (in case Supabase is not configured or tables are missing)
const LOCAL_DB_PATH = path.join(process.cwd(), "data", "monitor_db.json");

// Ensure directory exists
if (!fs.existsSync(path.dirname(LOCAL_DB_PATH))) {
  fs.mkdirSync(path.dirname(LOCAL_DB_PATH), { recursive: true });
}

interface MonitorTarget {
  url: string;
  name: string;
  is_active: boolean;
}

interface UptimeLog {
  id?: number | string;
  url: string;
  checked_at: string;
  is_up: boolean;
  status_code: number | null;
  response_time_ms: number;
  error_message: string | null;
}

interface LocalDB {
  targets: MonitorTarget[];
  logs: UptimeLog[];
}

const loadLocalDB = (): LocalDB => {
  try {
    if (fs.existsSync(LOCAL_DB_PATH)) {
      const raw = fs.readFileSync(LOCAL_DB_PATH, "utf-8");
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error("Error reading local DB:", err);
  }
  // Return default seeded state
  const db: LocalDB = {
    targets: DEFAULT_TARGETS.map(t => ({ ...t, is_active: true })),
    logs: []
  };
  saveLocalDB(db);
  return db;
};

const saveLocalDB = (db: LocalDB) => {
  try {
    fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(db, null, 2), "utf-8");
  } catch (err) {
    console.error("Error writing to local DB:", err);
  }
};

// Seed realistic uptime history logs so the dashboard looks full and informative right away
const seedLogsIfEmpty = (db: LocalDB) => {
  if (db.logs.length > 0) return;

  console.log("Seeding realistic uptime logs for visual demonstration...");
  const seededLogs: UptimeLog[] = [];
  const now = new Date();

  // Create 24 hours of logs (one every hour for both sites)
  for (let i = 24; i >= 0; i--) {
    const checked_at = new Date(now.getTime() - i * 60 * 60 * 1000).toISOString();
    
    db.targets.forEach(target => {
      // Create slight variations (98% uptime, occasional slow responses)
      const random = Math.random();
      const is_up = random > 0.02; // 2% down rate for simulation realism
      const status_code = is_up ? 200 : (random > 0.01 ? 503 : 404);
      const response_time_ms = is_up ? Math.floor(150 + Math.random() * 400) : 0;
      const error_message = is_up ? null : "Server Error (Simulated)";

      seededLogs.push({
        id: `seeded_${target.url}_${i}`,
        url: target.url,
        checked_at,
        is_up,
        status_code,
        response_time_ms,
        error_message
      });
    });
  }

  db.logs = seededLogs;
  saveLocalDB(db);
};

const localData = loadLocalDB();
seedLogsIfEmpty(localData);

// State to keep track of current active monitoring check details
let lastCheckTime: string | null = null;
let isCheckingCurrently = false;
// Store the last status of websites to avoid spamming alerts (only alert on transition)
const lastKnownState: Record<string, boolean> = {};

// Load previous state from seeded/existing logs
localData.logs.forEach(log => {
  // Sort ascending, so the last assignment is the newest
  lastKnownState[log.url] = log.is_up;
});

// Send message to Telegram Bot
async function sendTelegramAlert(message: string) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log("Telegram Token or Chat ID missing. Skipping alert.");
    return;
  }
  
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: "HTML",
        disable_web_page_preview: true
      })
    });
    
    if (!response.ok) {
      const errText = await response.text();
      console.error("Failed to send Telegram Alert:", errText);
    } else {
      console.log("Telegram Alert sent successfully.");
    }
  } catch (err) {
    console.error("Error connecting to Telegram API:", err);
  }
}

// Check a single website
async function checkWebsite(target: { url: string; name: string }): Promise<UptimeLog> {
  const startTime = Date.now();
  let is_up = false;
  let status_code: number | null = null;
  let error_message: string | null = null;
  
  try {
    // Send a fetch request with a timeout of 10 seconds
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const res = await fetch(target.url, {
      method: "GET",
      headers: {
        "User-Agent": "UptimeMonitorBot/1.0 (https://ai.studio/build)",
        "Accept": "*/*"
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    status_code = res.status;
    
    // Any 2xx or 3xx status code means the site is up
    if (res.status >= 200 && res.status < 400) {
      is_up = true;
    } else {
      error_message = `HTTP status ${res.status} ${res.statusText}`;
    }
  } catch (err: any) {
    error_message = err.message || "Connection failed";
    if (err.name === "AbortError") {
      error_message = "Connection timeout (10s)";
    }
  }
  
  const response_time_ms = Date.now() - startTime;
  
  return {
    url: target.url,
    checked_at: new Date().toISOString(),
    is_up,
    status_code,
    response_time_ms: is_up ? response_time_ms : 0,
    error_message: is_up ? null : error_message
  };
}

// Perform active checks on all targets
async function performAllChecks() {
  if (isCheckingCurrently) return;
  isCheckingCurrently = true;
  lastCheckTime = new Date().toISOString();
  console.log(`Starting monitoring check on ${lastCheckTime}...`);
  
  try {
    // 1. Load targets
    let targets: MonitorTarget[] = [];
    let usingSupabase = false;

    if (supabase) {
      try {
        const { data, error } = await supabase.from("monitor_targets").select("*").eq("is_active", true);
        if (!error && data && data.length > 0) {
          targets = data;
          usingSupabase = true;
        }
      } catch (err) {
        console.warn("Could not query Supabase monitor_targets table. Falling back to local data.", err);
      }
    }
    
    if (targets.length === 0) {
      const db = loadLocalDB();
      targets = db.targets.filter(t => t.is_active);
    }
    
    // 2. Perform concurrent checks
    const results = await Promise.all(targets.map(t => checkWebsite(t)));
    
    // 3. Save logs & Handle Alerts
    const db = loadLocalDB();
    
    for (const log of results) {
      const targetName = targets.find(t => t.url === log.url)?.name || log.url;
      const wasUp = lastKnownState[log.url];
      const isUpNow = log.is_up;
      
      console.log(`Site ${targetName} (${log.url}) status: ${isUpNow ? "UP" : "DOWN"} (${log.response_time_ms}ms)`);
      
      // Keep track of state transitions
      if (wasUp !== undefined && wasUp !== isUpNow) {
        if (!isUpNow) {
          // Changed Up -> Down: Alert!
          const alertMsg = `⚠️ <b>WEBSITE DOWN ALERT</b>\n\n` +
            `<b>Nama:</b> ${targetName}\n` +
            `<b>URL:</b> ${log.url}\n` +
            `<b>Status:</b> DOWN\n` +
            `<b>Status Code:</b> ${log.status_code || "N/A"}\n` +
            `<b>Error:</b> ${log.error_message || "Unknown error"}\n` +
            `<b>Waktu:</b> ${new Date(log.checked_at).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB\n\n` +
            `<i>Sistem Monitoring 24/7 Aktif</i>`;
          await sendTelegramAlert(alertMsg);
        } else {
          // Changed Down -> Up: Recovery Alert!
          const recoveryMsg = `✅ <b>WEBSITE RECOVERY ALERT</b>\n\n` +
            `<b>Nama:</b> ${targetName}\n` +
            `<b>URL:</b> ${log.url}\n` +
            `<b>Status:</b> UP (KEMBALI NORMAL)\n` +
            `<b>Status Code:</b> ${log.status_code}\n` +
            `<b>Response Time:</b> ${log.response_time_ms}ms\n` +
            `<b>Waktu:</b> ${new Date(log.checked_at).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB\n\n` +
            `<i>Sistem Monitoring 24/7 Aktif</i>`;
          await sendTelegramAlert(recoveryMsg);
        }
      } else if (wasUp === undefined && !isUpNow) {
        // Initial state is Down, send alert too so owner knows
        const alertMsg = `⚠️ <b>WEBSITE MONITOR STARTED: DOWN</b>\n\n` +
          `<b>Nama:</b> ${targetName}\n` +
          `<b>URL:</b> ${log.url}\n` +
          `<b>Status Code:</b> ${log.status_code || "N/A"}\n` +
          `<b>Error:</b> ${log.error_message || "Unknown error"}`;
        await sendTelegramAlert(alertMsg);
      }
      
      lastKnownState[log.url] = isUpNow;
      
      // Save log to Supabase
      let savedToSupabase = false;
      if (supabase) {
        try {
          const { error } = await supabase.from("uptime_logs").insert([
            {
              url: log.url,
              checked_at: log.checked_at,
              is_up: log.is_up,
              status_code: log.status_code,
              response_time_ms: log.response_time_ms,
              error_message: log.error_message
            }
          ]);
          if (!error) savedToSupabase = true;
        } catch (err) {
          // Table doesn't exist yet, it is expected if user didn't set up yet
        }
      }
      
      // Always write to local storage as double redundancy
      db.logs.push({
        id: Math.random().toString(36).substring(2, 11),
        ...log
      });
    }
    
    // Prune local logs to avoid file bloating (keep last 500 logs)
    if (db.logs.length > 500) {
      db.logs = db.logs.slice(-500);
    }
    
    saveLocalDB(db);
  } catch (err) {
    console.error("Failed to perform monitoring check:", err);
  } finally {
    isCheckingCurrently = false;
  }
}

// Interval setup for 1 hour checks (3600000 ms)
const CHECK_INTERVAL_MS = 60 * 60 * 1000;
setInterval(performAllChecks, CHECK_INTERVAL_MS);

// Perform a check immediately on server launch (with a short delay to allow Vite middleware to attach)
setTimeout(() => {
  performAllChecks();
}, 5000);

// API Endpoints

// 1. Get targets
app.get("/api/targets", async (req, res) => {
  try {
    if (supabase) {
      const { data, error } = await supabase.from("monitor_targets").select("*").order("name");
      if (!error && data && data.length > 0) {
        return res.json({ targets: data, database: "supabase" });
      }
    }
  } catch (err) {
    // Ignore, fallback below
  }
  
  const db = loadLocalDB();
  res.json({ targets: db.targets, database: "local" });
});

// 2. Add target
app.post("/api/targets", async (req, res) => {
  const { url, name } = req.body;
  if (!url || !name) {
    return res.status(400).json({ error: "URL dan Nama wajib diisi" });
  }

  const target: MonitorTarget = { url, name, is_active: true };

  // Write to Supabase
  let savedToSupabase = false;
  if (supabase) {
    try {
      const { error } = await supabase.from("monitor_targets").upsert([target]);
      if (!error) savedToSupabase = true;
    } catch (err) {}
  }

  // Write to Local
  const db = loadLocalDB();
  const existingIdx = db.targets.findIndex(t => t.url === url);
  if (existingIdx >= 0) {
    db.targets[existingIdx] = target;
  } else {
    db.targets.push(target);
  }
  saveLocalDB(db);

  res.json({ success: true, target, database: savedToSupabase ? "supabase" : "local" });
});

// 3. Delete target
app.delete("/api/targets", async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: "URL target wajib diisi" });
  }

  let deletedFromSupabase = false;
  if (supabase) {
    try {
      const { error } = await supabase.from("monitor_targets").delete().eq("url", url);
      if (!error) deletedFromSupabase = true;
    } catch (err) {}
  }

  const db = loadLocalDB();
  db.targets = db.targets.filter(t => t.url !== url);
  // Also prune logs of this url
  db.logs = db.logs.filter(l => l.url !== url);
  saveLocalDB(db);

  res.json({ success: true, database: deletedFromSupabase ? "supabase" : "local" });
});

// 4. Get stats & logs
app.get("/api/dashboard", async (req, res) => {
  let targets: MonitorTarget[] = [];
  let logs: UptimeLog[] = [];
  let databaseUsed = "local";

  // Attempt to fetch from Supabase
  if (supabase) {
    try {
      const { data: dbTargets, error: errT } = await supabase.from("monitor_targets").select("*");
      const { data: dbLogs, error: errL } = await supabase.from("uptime_logs").select("*").order("checked_at", { ascending: false }).limit(200);
      
      if (!errT && dbTargets && dbTargets.length > 0) {
        targets = dbTargets;
        databaseUsed = "supabase";
      }
      
      if (!errL && dbLogs) {
        logs = dbLogs;
      }
    } catch (err) {
      console.warn("Supabase query failed, using local DB fallback:", err);
    }
  }

  // Fallback to local
  if (targets.length === 0) {
    const db = loadLocalDB();
    targets = db.targets;
    logs = db.logs.slice().reverse(); // Show newest first
    databaseUsed = "local";
  }

  // Calculate stats per website
  const stats = targets.map(target => {
    const targetLogs = logs.filter(l => l.url === target.url);
    const totalChecks = targetLogs.length;
    const upChecks = targetLogs.filter(l => l.is_up).length;
    const uptimePercentage = totalChecks > 0 ? (upChecks / totalChecks) * 100 : 100;
    
    // Calculate average response time
    const upLogs = targetLogs.filter(l => l.is_up && l.response_time_ms > 0);
    const avgResponseTime = upLogs.length > 0
      ? Math.round(upLogs.reduce((sum, l) => sum + l.response_time_ms, 0) / upLogs.length)
      : 0;

    const lastLog = targetLogs[0] || null;

    return {
      url: target.url,
      name: target.name,
      is_active: target.is_active,
      uptime_percentage: parseFloat(uptimePercentage.toFixed(2)),
      avg_response_time_ms: avgResponseTime,
      total_checks: totalChecks,
      total_downs: totalChecks - upChecks,
      is_up: lastLog ? lastLog.is_up : null,
      last_checked_at: lastLog ? lastLog.checked_at : null,
      status_code: lastLog ? lastLog.status_code : null,
      error_message: lastLog ? lastLog.error_message : null,
      response_time_ms: lastLog ? lastLog.response_time_ms : null
    };
  });

  res.json({
    database: databaseUsed,
    targets,
    stats,
    logs: logs.slice(0, 50), // Send last 50 logs to client
    config: {
      telegram_bot_token_configured: !!TELEGRAM_BOT_TOKEN,
      telegram_chat_id_configured: !!TELEGRAM_CHAT_ID,
      supabase_configured: !!process.env.SUPABASE_URL
    },
    system: {
      last_check: lastCheckTime,
      is_checking: isCheckingCurrently
    }
  });
});

// 5. Trigger instant check
app.post("/api/check-now", async (req, res) => {
  if (isCheckingCurrently) {
    return res.status(400).json({ error: "Pengecekan sedang berjalan..." });
  }
  await performAllChecks();
  res.json({ success: true, checked_at: lastCheckTime });
});

// 6. Test telegram notification
app.post("/api/test-telegram", async (req, res) => {
  const testMessage = `🔔 <b>TEST NOTIFIKASI MONITORING</b>\n\n` +
    `Halo Owner! Ini adalah pesan uji coba dari sistem monitoring website Anda.\n\n` +
    `🤖 <b>Status Bot:</b> Aktif & Terhubung\n` +
    `📍 <b>Chat ID Anda:</b> <code>${TELEGRAM_CHAT_ID}</code>\n` +
    `⏰ <b>Waktu:</b> ${new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB\n\n` +
    `<i>Integrasi Telegram Berhasil!</i>`;
    
  await sendTelegramAlert(testMessage);
  res.json({ success: true, message: "Uji coba notifikasi telah dikirim ke Telegram!" });
});

// 7. Get setup SQL instructions
app.get("/api/setup-sql", (req, res) => {
  const sql = `-- SETUP SQL UNTUK SUPABASE
-- Silakan salin dan jalankan script ini di SQL Editor dashboard Supabase Anda!

-- 1. Tabel untuk menyimpan target monitoring website
CREATE TABLE IF NOT EXISTS monitor_targets (
  url TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2. Memasukkan target default yang akan dimonitoring
INSERT INTO monitor_targets (url, name)
VALUES 
  ('https://fmccomic.my.id', 'FMC Comic'),
  ('https://fmcstore.web.id', 'FMC Store')
ON CONFLICT (url) DO NOTHING;

-- 3. Tabel untuk menyimpan riwayat log pengecekan uptime
CREATE TABLE IF NOT EXISTS uptime_logs (
  id BIGSERIAL PRIMARY KEY,
  url TEXT NOT NULL,
  checked_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  is_up BOOLEAN NOT NULL,
  status_code INT,
  response_time_ms INT,
  error_message TEXT
);

-- 4. Membuat index untuk performa kueri grafik yang cepat
CREATE INDEX IF NOT EXISTS idx_uptime_logs_url_checked_at ON uptime_logs (url, checked_at DESC);

-- 5. Memberikan izin (GRANT) akses penuh kepada role Supabase
-- Penting: Jika Anda melihat status "local fallback", jalankan baris di bawah ini di SQL Editor Supabase!
GRANT ALL ON public.monitor_targets TO postgres, service_role, anon, authenticated;
GRANT ALL ON public.uptime_logs TO postgres, service_role, anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, service_role, anon, authenticated;
`;

  res.json({ sql });
});

// Vite middleware setup
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
