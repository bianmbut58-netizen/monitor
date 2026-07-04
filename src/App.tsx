import React, { useState, useEffect } from "react";
import { 
  Activity, 
  CheckCircle, 
  XCircle, 
  RefreshCw, 
  Clock, 
  Send, 
  Database, 
  Terminal, 
  AlertTriangle, 
  Plus, 
  Trash2, 
  ExternalLink, 
  Copy, 
  Check, 
  Settings, 
  ShieldCheck,
  Server
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from "recharts";

interface MonitorTarget {
  url: string;
  name: string;
  is_active: boolean;
}

interface TargetStat {
  url: string;
  name: string;
  is_active: boolean;
  uptime_percentage: number;
  avg_response_time_ms: number;
  total_checks: number;
  total_downs: number;
  is_up: boolean | null;
  last_checked_at: string | null;
  status_code: number | null;
  error_message: string | null;
  response_time_ms: number | null;
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

interface DashboardData {
  database: string;
  targets: MonitorTarget[];
  stats: TargetStat[];
  logs: UptimeLog[];
  config: {
    telegram_bot_token_configured: boolean;
    telegram_chat_id_configured: boolean;
    supabase_configured: boolean;
  };
  system: {
    last_check: string | null;
    is_checking: boolean;
  };
}

export default function App() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<"dashboard" | "targets" | "setup">("dashboard");
  
  // Forms and settings state
  const [newUrl, setNewUrl] = useState("");
  const [newName, setNewName] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [sqlInstructions, setSqlInstructions] = useState("");
  const [copiedSql, setCopiedSql] = useState(false);

  // Fetch Dashboard Data
  const fetchDashboardData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await fetch("/api/dashboard");
      if (response.ok) {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const json = await response.json();
          setData(json);
        } else {
          console.warn("Received non-JSON content-type:", contentType);
        }
      }
    } catch (err) {
      console.error("Failed to fetch dashboard data:", err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Fetch SQL setup instructions
  const fetchSqlInstructions = async () => {
    try {
      const response = await fetch("/api/setup-sql");
      if (response.ok) {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const json = await response.json();
          setSqlInstructions(json.sql);
        }
      }
    } catch (err) {
      console.error("Failed to fetch SQL:", err);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    fetchSqlInstructions();
    
    // Auto-refresh stats every 30 seconds
    const interval = setInterval(() => {
      fetchDashboardData(true);
    }, 30000);
    
    return () => clearInterval(interval);
  }, []);

  // Handle Manual Status Check Now
  const handleCheckNow = async () => {
    setRefreshing(true);
    try {
      const response = await fetch("/api/check-now", { method: "POST" });
      if (response.ok) {
        await fetchDashboardData(true);
        showToast("Pengecekan selesai! Status website telah diperbarui.", "success");
      } else {
        showToast("Gagal melakukan pengecekan instan.", "error");
      }
    } catch (err) {
      showToast("Terjadi kesalahan jaringan.", "error");
    } finally {
      setRefreshing(false);
    }
  };

  // Handle Test Telegram Alert
  const handleTestTelegram = async () => {
    setActionLoading(true);
    try {
      const response = await fetch("/api/test-telegram", { method: "POST" });
      if (response.ok) {
        showToast("Uji coba notifikasi berhasil dikirim ke Telegram!", "success");
      } else {
        showToast("Gagal mengirim notifikasi ke Telegram.", "error");
      }
    } catch (err) {
      showToast("Kesalahan jaringan saat menghubungi server Telegram.", "error");
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Add New Target URL
  const handleAddTarget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUrl || !newName) {
      showToast("Semua kolom input wajib diisi!", "error");
      return;
    }

    // Basic URL validation
    try {
      new URL(newUrl);
    } catch (_) {
      showToast("Format URL tidak valid! Gunakan format lengkap (contoh: https://example.com)", "error");
      return;
    }

    setActionLoading(true);
    try {
      const response = await fetch("/api/targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: newUrl, name: newName })
      });

      if (response.ok) {
        setNewUrl("");
        setNewName("");
        showToast("Target monitoring berhasil ditambahkan!", "success");
        await fetchDashboardData(true);
      } else {
        const err = await response.json();
        showToast(err.error || "Gagal menambahkan target.", "error");
      }
    } catch (err) {
      showToast("Kesalahan jaringan.", "error");
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Delete Target URL
  const handleDeleteTarget = async (url: string) => {
    if (!window.confirm(`Apakah Anda yakin ingin menghapus target monitoring untuk ${url}?`)) {
      return;
    }

    setActionLoading(true);
    try {
      const response = await fetch("/api/targets", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });

      if (response.ok) {
        showToast("Target monitoring berhasil dihapus.", "success");
        await fetchDashboardData(true);
      } else {
        showToast("Gagal menghapus target.", "error");
      }
    } catch (err) {
      showToast("Kesalahan jaringan.", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const showToast = (text: string, type: "success" | "error") => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  // Filter logs for chart display (chronological order)
  const getChartDataForUrl = (url: string) => {
    if (!data) return [];
    return data.logs
      .filter(log => log.url === url)
      .slice(0, 15) // last 15 checks
      .map(log => ({
        time: new Date(log.checked_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
        latency: log.is_up ? log.response_time_ms : 0,
        status: log.is_up ? "Online" : "Offline"
      }))
      .reverse(); // oldest first for the chart flow
  };

  // Uptime bar blocks builder (green for up, red for down)
  const renderUptimeBar = (url: string) => {
    if (!data) return null;
    const targetLogs = data.logs.filter(log => log.url === url).slice(0, 30); // Last 30 checks
    
    // Fill up to 30 elements if there are fewer logs
    const blocks = [...targetLogs];
    while (blocks.length < 30) {
      blocks.push({ is_up: true, checked_at: "", url, response_time_ms: 0, status_code: 200, error_message: null });
    }
    
    return (
      <div className="flex items-center gap-[2px] sm:gap-1 w-full justify-between mt-2" id={`uptime-bar-${url}`}>
        {blocks.reverse().map((block, idx) => {
          let colorClass = "bg-slate-700/50"; // default placeholder
          let titleText = "Tidak ada data";
          
          if (block.checked_at) {
            colorClass = block.is_up ? "bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.4)]" : "bg-rose-500 shadow-[0_0_4px_rgba(244,63,94,0.4)]";
            titleText = `${block.is_up ? "Online" : "Offline"} | ${new Date(block.checked_at).toLocaleString("id-ID")} | ${block.is_up ? `${block.response_time_ms}ms` : block.error_message}`;
          }

          return (
            <div 
              key={idx} 
              className={`h-5 sm:h-7 flex-1 rounded-[1px] sm:rounded-[2px] transition-all hover:scale-y-125 hover:brightness-125 cursor-pointer ${colorClass}`}
              title={titleText}
            />
          );
        })}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500 selection:text-slate-900">
      
      {/* Toast Notification */}
      {message && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-xl border shadow-2xl transition-all animate-bounce ${
          message.type === "success" 
            ? "bg-emerald-950/90 text-emerald-300 border-emerald-800" 
            : "bg-rose-950/90 text-rose-300 border-rose-800"
        }`}>
          {message.type === "success" ? <CheckCircle className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
          <span className="text-sm font-medium">{message.text}</span>
        </div>
      )}

      {/* Hero Banner with Glowing Lights */}
      <div className="relative overflow-hidden border-b border-slate-900 bg-slate-900/10">
        <div className="absolute inset-y-0 right-0 w-1/3 bg-emerald-500/5 blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute top-10 left-10 w-48 h-48 bg-blue-500/5 blur-[100px] rounded-full pointer-events-none" />
        
        <div className="max-w-7xl mx-auto px-4 py-8 md:py-10">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            
            {/* Title Block */}
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="bg-gradient-to-tr from-emerald-600 to-emerald-400 p-2.5 sm:p-3.5 rounded-2xl shadow-[0_0_20px_rgba(16,185,129,0.3)] text-slate-950 shrink-0">
                <Activity className="w-6 h-6 sm:w-8 sm:h-8 animate-pulse" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2.5">
                  <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-slate-50 via-slate-200 to-slate-400 bg-clip-text text-transparent">
                    CyberGuard WebMonitor
                  </h1>
                  <span className="px-1.5 py-0.5 text-[9px] sm:text-[11px] font-semibold uppercase tracking-wider rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                    Pro 24/7
                  </span>
                </div>
                <p className="text-slate-400 text-xs sm:text-sm mt-1">
                  Sistem monitoring uptime, latency, dan integrasi alert Telegram & Supabase Database.
                </p>
              </div>
            </div>

            {/* Quick Stats / Action Panel */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
              <button 
                onClick={handleCheckNow}
                disabled={refreshing || (data?.system.is_checking)}
                className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 transition-all text-slate-950 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_4px_12px_rgba(16,185,129,0.2)] w-full sm:w-auto"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing || data?.system.is_checking ? "animate-spin" : ""}`} />
                {refreshing || data?.system.is_checking ? "Mengecek..." : "Periksa Sekarang"}
              </button>

              <button 
                onClick={handleTestTelegram}
                disabled={actionLoading}
                className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-slate-900 border border-slate-800 hover:bg-slate-800 active:bg-slate-900 transition-all text-slate-200 disabled:opacity-50 w-full sm:w-auto"
              >
                <Send className="w-4 h-4" />
                Uji Notif Telegram
              </button>
            </div>

          </div>
        </div>
      </div>

      {/* Main Container Layout */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        
        {/* Connection status rail bar */}
        <div className="grid grid-cols-1 md:flex md:flex-wrap md:items-center md:justify-between gap-4 p-4 rounded-xl bg-slate-900/40 border border-slate-900/60 backdrop-blur mb-8 text-xs text-slate-400">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
            <span className="flex items-center gap-1.5 font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block animate-ping" />
              Auto-Check: <strong className="text-emerald-400">Aktif (Tiap 1 Jam)</strong>
            </span>
            <span className="h-4 w-px bg-slate-800 hidden sm:inline" />
            <span className="flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-slate-500" />
              Sistem Operasional: <strong className="text-slate-200">24/7 Live</strong>
            </span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
            <span className="flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-slate-500" />
              Database Mode:{" "}
              {data ? (
                <strong className={`uppercase ${data.database === "supabase" ? "text-cyan-400" : "text-amber-400"}`}>
                  {data.database} {data.database === "local" ? "(Local Fallback)" : ""}
                </strong>
              ) : (
                <span className="animate-pulse">Loading...</span>
              )}
            </span>
            <span className="h-4 w-px bg-slate-800 hidden sm:inline" />
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              Cek Terakhir:{" "}
              <strong className="text-slate-200">
                {data?.system.last_check 
                  ? new Date(data.system.last_check).toLocaleString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) 
                  : "Menunggu..."}
              </strong>
            </span>
          </div>
        </div>

        {/* Tab Navigation Controls */}
        <div className="flex flex-col sm:flex-row border-b border-slate-900 mb-8 gap-1.5 sm:gap-2 pb-0.5" id="tab-navigation-container">
          <button
            id="tab-btn-dashboard"
            onClick={() => setActiveTab("dashboard")}
            className={`px-5 py-3 text-sm font-semibold transition-all border-l-2 sm:border-l-0 sm:border-b-2 flex items-center gap-2 shrink-0 w-full sm:w-auto rounded-r-md sm:rounded-none ${
              activeTab === "dashboard"
                ? "border-emerald-500 text-emerald-400 bg-emerald-500/5 sm:bg-transparent"
                : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/20 sm:hover:bg-transparent"
            }`}
          >
            <Activity className="w-4 h-4" />
            Dashboard Monitoring
          </button>
          <button
            id="tab-btn-targets"
            onClick={() => setActiveTab("targets")}
            className={`px-5 py-3 text-sm font-semibold transition-all border-l-2 sm:border-l-0 sm:border-b-2 flex items-center gap-2 shrink-0 w-full sm:w-auto rounded-r-md sm:rounded-none ${
              activeTab === "targets"
                ? "border-emerald-500 text-emerald-400 bg-emerald-500/5 sm:bg-transparent"
                : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/20 sm:hover:bg-transparent"
            }`}
          >
            <Settings className="w-4 h-4" />
            Target Pengukuran ({data?.targets.length || 0})
          </button>
          <button
            id="tab-btn-setup"
            onClick={() => setActiveTab("setup")}
            className={`px-5 py-3 text-sm font-semibold transition-all border-l-2 sm:border-l-0 sm:border-b-2 flex items-center gap-2 shrink-0 w-full sm:w-auto rounded-r-md sm:rounded-none ${
              activeTab === "setup"
                ? "border-emerald-500 text-emerald-400 bg-emerald-500/5 sm:bg-transparent"
                : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/20 sm:hover:bg-transparent"
            }`}
          >
            <Database className="w-4 h-4" />
            Integrasi & Supabase SQL Setup
          </button>
        </div>

        {/* Tab Content Display */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <RefreshCw className="w-10 h-10 animate-spin text-emerald-500" />
            <span className="text-slate-400 text-sm">Menghubungkan ke server monitoring...</span>
          </div>
        ) : (
          <>
            {/* TAB 1: DASHBOARD MONITORING */}
            {activeTab === "dashboard" && (
              <div className="space-y-8 animate-fadeIn">
                
                {/* Website Status Cards Section */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 lg:gap-8">
                  {data?.stats.map((stat) => (
                    <div 
                      key={stat.url} 
                      className="bg-slate-900/30 backdrop-blur rounded-2xl border border-slate-900 p-4 sm:p-6 flex flex-col justify-between hover:border-slate-800 transition-all duration-300 relative group"
                    >
                      <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 blur-[50px] rounded-full pointer-events-none group-hover:bg-emerald-500/10 transition-all" />
                      
                      {/* Top Row: Name and Alive status badge */}
                      <div>
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <h2 className="text-lg sm:text-xl font-bold text-slate-100">{stat.name}</h2>
                              <a 
                                href={stat.url} 
                                target="_blank" 
                                rel="noreferrer" 
                                className="text-slate-500 hover:text-emerald-400 transition-colors"
                                title="Buka website"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            </div>
                            <span className="text-slate-400 text-xs font-mono select-all mt-0.5 block break-all">{stat.url}</span>
                          </div>

                          {/* Alive Status Badge */}
                          {stat.is_up === null ? (
                            <span className="px-3 py-1 text-xs font-semibold rounded-full bg-slate-800 text-slate-400 shrink-0">
                              PENDING
                            </span>
                          ) : stat.is_up ? (
                            <span className="px-3 py-1 text-xs font-semibold rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center gap-1.5 shrink-0">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              ONLINE
                            </span>
                          ) : (
                            <span className="px-3 py-1 text-xs font-semibold rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center gap-1.5 animate-pulse shrink-0">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                              OFFLINE
                            </span>
                          )}
                        </div>

                        {/* Middle Row: Major stats indicators */}
                        <div className="grid grid-cols-3 gap-2 sm:gap-4 my-4 sm:my-6">
                          
                          {/* Stat: Uptime Percentage */}
                          <div className="bg-slate-950/40 border border-slate-900/60 rounded-xl p-2 sm:p-3 text-center">
                            <span className="text-[9px] sm:text-[11px] text-slate-500 block font-medium uppercase tracking-wider">Uptime</span>
                            <span className={`text-sm sm:text-base md:text-lg font-bold block mt-1 ${stat.uptime_percentage >= 99 ? "text-emerald-400" : stat.uptime_percentage >= 95 ? "text-cyan-400" : "text-rose-400"}`}>
                              {stat.uptime_percentage}%
                            </span>
                          </div>

                          {/* Stat: Avg Response Time */}
                          <div className="bg-slate-950/40 border border-slate-900/60 rounded-xl p-2 sm:p-3 text-center">
                            <span className="text-[9px] sm:text-[11px] text-slate-500 block font-medium uppercase tracking-wider">Avg Latency</span>
                            <span className="text-sm sm:text-base md:text-lg font-bold text-slate-200 block mt-1">
                              {stat.avg_response_time_ms > 0 ? `${stat.avg_response_time_ms}ms` : "N/A"}
                            </span>
                          </div>

                          {/* Stat: Current HTTP Code */}
                          <div className="bg-slate-950/40 border border-slate-900/60 rounded-xl p-2 sm:p-3 text-center">
                            <span className="text-[9px] sm:text-[11px] text-slate-500 block font-medium uppercase tracking-wider">Status Code</span>
                            <span className={`text-sm sm:text-base md:text-lg font-bold block mt-1 ${stat.status_code && stat.status_code >= 200 && stat.status_code < 400 ? "text-emerald-400" : "text-rose-400"}`}>
                              {stat.status_code || "N/A"}
                            </span>
                          </div>

                        </div>
                      </div>

                      {/* Bottom Row: visual uptime bar and details */}
                      <div className="space-y-4">
                        
                        {/* Interactive Uptime Bar representation */}
                        <div>
                          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                            <span>Uptime (30 Pemeriksaan Terakhir)</span>
                            <span className="text-emerald-500">{stat.uptime_percentage}% Terjaga</span>
                          </div>
                          {renderUptimeBar(stat.url)}
                        </div>

                        {/* Diagnostic detail string */}
                        <div className="flex flex-col xs:flex-row xs:items-center xs:justify-between gap-1 text-xs border-t border-slate-900/80 pt-3">
                          <span className="text-slate-500">Pengecekan Terakhir:</span>
                          <span className="text-slate-300 font-medium">
                            {stat.last_checked_at 
                              ? new Date(stat.last_checked_at).toLocaleString("id-ID")
                              : "Belum pernah"}
                          </span>
                        </div>

                        {/* Error info block if currently Down */}
                        {!stat.is_up && stat.error_message && (
                          <div className="mt-2 p-3 rounded-xl bg-rose-950/20 border border-rose-900/40 text-xs text-rose-300 flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                            <div>
                              <strong className="font-semibold block">Diagnosa Kegagalan:</strong>
                              <span className="font-mono mt-0.5 block break-all">{stat.error_message}</span>
                            </div>
                          </div>
                        )}

                        {/* Realtime Latency Trend chart mini */}
                        <div className="mt-4 pt-4 border-t border-slate-900/80">
                          <h3 className="text-xs text-slate-500 font-medium mb-3">Tren Latensi Pemeriksaan (ms)</h3>
                          <div className="relative h-28 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={getChartDataForUrl(stat.url)}>
                                <defs>
                                  <linearGradient id={`gradient-${stat.name}`} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                  </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#0f172a" vertical={false} />
                                <XAxis 
                                  dataKey="time" 
                                  stroke="#475569" 
                                  fontSize={10} 
                                  tickLine={false} 
                                  axisLine={false} 
                                />
                                <YAxis 
                                  stroke="#475569" 
                                  fontSize={10} 
                                  tickLine={false} 
                                  axisLine={false} 
                                  unit="ms" 
                                />
                                <Tooltip 
                                  contentStyle={{ 
                                    backgroundColor: "#020617", 
                                    borderColor: "#1e293b",
                                    borderRadius: "12px",
                                    color: "#f8fafc",
                                    fontSize: "11px"
                                  }} 
                                />
                                <Area 
                                  type="monotone" 
                                  dataKey="latency" 
                                  stroke="#10b981" 
                                  strokeWidth={2}
                                  fillOpacity={1} 
                                  fill={`url(#gradient-${stat.name})`} 
                                  name="Latency"
                                />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                        </div>

                      </div>

                    </div>
                  ))}
                </div>

                {/* TAB 1 TABLE: RECENT CHECKS LOG */}
                <div className="bg-slate-900/30 backdrop-blur rounded-2xl border border-slate-900 p-4 sm:p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-6">
                    <div>
                      <h3 className="text-lg font-bold text-slate-100">Riwayat Pengecekan Terbaru</h3>
                      <p className="text-xs text-slate-400 mt-1">Sistem menyimpan log real-time untuk audit kendala stabilitas.</p>
                    </div>
                    <span className="text-xs text-slate-400 font-mono self-start sm:self-auto">Total {data?.logs.length || 0} log disimpan</span>
                  </div>

                  <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
                    <table className="w-full min-w-[700px] text-left text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-slate-900 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                          <th className="py-3 px-4 whitespace-nowrap">Nama Website</th>
                          <th className="py-3 px-4 whitespace-nowrap">Waktu</th>
                          <th className="py-3 px-4 whitespace-nowrap">Status</th>
                          <th className="py-3 px-4 whitespace-nowrap">HTTP Code</th>
                          <th className="py-3 px-4 text-right whitespace-nowrap">Latensi</th>
                          <th className="py-3 px-4 whitespace-nowrap">Keterangan</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-900/40">
                        {data?.logs.slice(0, 15).map((log, index) => {
                          const targetName = data.targets.find(t => t.url === log.url)?.name || log.url;
                          return (
                            <tr key={index} className="hover:bg-slate-900/20 transition-colors">
                              <td className="py-3.5 px-4 font-semibold text-slate-200">
                                {targetName}
                                <span className="text-[10px] font-mono text-slate-500 font-normal block mt-0.5 break-all">{log.url}</span>
                              </td>
                              <td className="py-3.5 px-4 text-slate-300 font-mono text-xs whitespace-nowrap">
                                {new Date(log.checked_at).toLocaleString("id-ID")}
                              </td>
                              <td className="py-3.5 px-4">
                                {log.is_up ? (
                                  <span className="inline-flex items-center gap-1 text-emerald-400 text-xs font-bold bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full whitespace-nowrap">
                                    <span className="w-1 h-1 rounded-full bg-emerald-400" />
                                    Online
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-rose-400 text-xs font-bold bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-full whitespace-nowrap">
                                    <span className="w-1 h-1 rounded-full bg-rose-400" />
                                    Offline
                                  </span>
                                )}
                              </td>
                              <td className="py-3.5 px-4 font-mono font-bold text-xs">
                                {log.status_code || <span className="text-slate-500">—</span>}
                              </td>
                              <td className="py-3.5 px-4 text-right font-mono font-semibold text-slate-300 text-xs whitespace-nowrap">
                                {log.is_up ? `${log.response_time_ms}ms` : <span className="text-slate-500">—</span>}
                              </td>
                              <td className="py-3.5 px-4 text-slate-400 text-xs max-w-[200px] truncate" title={log.error_message || ""}>
                                {log.error_message || <span className="text-slate-500">—</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            )}

            {/* TAB 2: TARGET PENGUKURAN */}
            {activeTab === "targets" && (
              <div className="space-y-8 animate-fadeIn">
                
                {/* Form to add target */}
                <div className="bg-slate-900/30 border border-slate-900 rounded-2xl p-4 sm:p-6">
                  <h3 className="text-lg font-bold text-slate-100 mb-2">Tambah Target Website</h3>
                  <p className="text-xs text-slate-400 mb-6">Tambahkan website lain untuk dimonitor secara otomatis oleh robot penjaga uptime.</p>
                  
                  <form onSubmit={handleAddTarget} className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                    <div className="md:col-span-2 space-y-1.5">
                      <label className="text-xs font-semibold text-slate-400 block">Nama Website / Organisasi</label>
                      <input 
                        type="text" 
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="Contoh: FMC Comic Utama"
                        className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                      />
                    </div>
                    <div className="md:col-span-2 space-y-1.5">
                      <label className="text-xs font-semibold text-slate-400 block">URL Website (Lengkap dengan HTTPS)</label>
                      <input 
                        type="text" 
                        value={newUrl}
                        onChange={(e) => setNewUrl(e.target.value)}
                        placeholder="Contoh: https://fmccomic.my.id"
                        className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                      />
                    </div>
                    <div>
                      <button
                        type="submit"
                        disabled={actionLoading}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 transition-all text-slate-950 disabled:opacity-50 font-bold shadow-[0_4px_12px_rgba(16,185,129,0.2)]"
                      >
                        <Plus className="w-4 h-4" />
                        Tambah Target
                      </button>
                    </div>
                  </form>
                </div>

                {/* Target list */}
                <div className="bg-slate-900/30 border border-slate-900 rounded-2xl p-4 sm:p-6">
                  <h3 className="text-lg font-bold text-slate-100 mb-4">Daftar Pengukuran Aktif</h3>
                  
                  <div className="divide-y divide-slate-900/60">
                    {data?.targets.map((target) => (
                      <div key={target.url} className="py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <div className="bg-slate-950 p-2.5 border border-slate-900 rounded-xl text-slate-400 mt-0.5 shrink-0">
                            <Activity className="w-5 h-5 text-emerald-400" />
                          </div>
                          <div className="min-w-0">
                            <span className="font-bold text-slate-200 text-base block">{target.name}</span>
                            <span className="text-xs font-mono text-slate-400 mt-0.5 block break-all">{target.url}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 self-end sm:self-auto">
                          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 whitespace-nowrap">
                            Auto 24/7 Monitoring
                          </span>
                          
                          <button
                            onClick={() => handleDeleteTarget(target.url)}
                            disabled={actionLoading}
                            className="bg-rose-950/20 text-rose-400 border border-rose-900/40 hover:bg-rose-950/40 p-2.5 rounded-xl transition-all disabled:opacity-50 shrink-0"
                            title="Hapus Target"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                    {data?.targets.length === 0 && (
                      <div className="text-center py-10 text-slate-500 text-sm">
                        Belum ada target yang dikonfigurasi. Tambahkan target di atas!
                      </div>
                    )}
                  </div>
                </div>

              </div>
            )}

            {/* TAB 3: INTEGRASI & SUPABASE SETUP */}
            {activeTab === "setup" && (
              <div className="space-y-8 animate-fadeIn">
                
                {/* Telegram Bot configuration check */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
                  <div className="lg:col-span-2 bg-slate-900/30 border border-slate-900 rounded-2xl p-4 sm:p-6 space-y-6">
                    <div>
                      <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                        <ShieldCheck className="text-emerald-400 w-5 h-5 shrink-0" />
                        Status Integrasi Alerts & Notifikasi
                      </h3>
                      <p className="text-xs text-slate-400 mt-1">Konfigurasi notifikasi Telegram akan memberi tahu Anda secara instan jika ada downtime.</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      
                      {/* Tele Bot Card */}
                      <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-900 flex items-start gap-3">
                        <div className="bg-emerald-500/10 p-2.5 rounded-lg text-emerald-400 shrink-0">
                          <Send className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <span className="text-xs text-slate-500 font-semibold block uppercase">Telegram Bot Token</span>
                          <span className="text-xs font-mono font-bold text-slate-200 block mt-1 break-all">
                            8924930551:AAFX...G4j31U
                          </span>
                          <span className="text-[10px] text-emerald-400 mt-1 inline-block">✓ Terhubung</span>
                        </div>
                      </div>

                      {/* Tele ID Card */}
                      <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-900 flex items-start gap-3">
                        <div className="bg-emerald-500/10 p-2.5 rounded-lg text-emerald-400 shrink-0">
                          <Clock className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <span className="text-xs text-slate-500 font-semibold block uppercase">Telegram Chat ID</span>
                          <span className="text-xs font-mono font-bold text-slate-200 block mt-1 break-all">
                            8193547847 (Owner)
                          </span>
                          <span className="text-[10px] text-emerald-400 mt-1 inline-block">✓ Terhubung</span>
                        </div>
                      </div>

                    </div>

                    <div className="p-4 rounded-xl bg-slate-950/20 border border-slate-800 text-xs text-slate-300 space-y-4">
                      <div>
                        <h4 className="font-bold text-slate-200 mb-1">ℹ️ Bagaimana notifikasi dikirim?</h4>
                        <p>Sistem monitoring web di server terus berjalan di latar belakang setiap saat. Ketika status website berubah dari <strong className="text-emerald-400">Online</strong> menjadi <strong className="text-rose-400">Offline</strong>, Bot Telegram akan langsung mengirim pesan instan dengan diagnosa kegagalan (HTTP status code atau timeout). Bot juga akan mengabarkan jika website sudah pulih dan kembali normal!</p>
                      </div>
                      
                      <div className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300">
                        <strong className="font-bold text-amber-200 flex items-center gap-1.5 mb-1">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          Mengatasi Error 'Chat Not Found':
                        </strong>
                        <p className="leading-relaxed">
                          Supaya bot Telegram dapat mengirim pesan ke akun Anda, Anda <strong>wajib mengaktifkan bot tersebut terlebih dahulu</strong>. Silakan cari bot Anda di Telegram (menggunakan token bot ini), lalu klik tombol <strong>Start</strong> atau ketik <code>/start</code>. Setelah bot diaktifkan, klik kembali tombol <strong>"Uji Notif Telegram"</strong> di atas.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Supabase status sidebar */}
                  <div className="bg-slate-900/30 border border-slate-900 rounded-2xl p-4 sm:p-6 flex flex-col justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-slate-100 mb-2">Integrasi Supabase</h3>
                      <p className="text-xs text-slate-400 mb-4">Sistem ini siap menyimpan data uptime secara permanen di database Supabase Anda.</p>
                      
                      <div className="space-y-3 font-mono text-xs text-slate-300">
                        <div className="p-3.5 bg-slate-950 border border-slate-900 rounded-xl space-y-1">
                          <span className="text-slate-500 uppercase font-sans text-[10px] font-bold block">SUPABASE PROJECT ID</span>
                          <span className="text-cyan-400 break-all">avoswstxvdipekgazotn</span>
                        </div>
                        <div className="p-3.5 bg-slate-950 border border-slate-900 rounded-xl space-y-1">
                          <span className="text-slate-500 uppercase font-sans text-[10px] font-bold block">STATUS KONEKSI</span>
                          {data?.database === "supabase" ? (
                            <span className="text-emerald-400 block font-bold">● Supabase Tersambung</span>
                          ) : (
                            <div className="space-y-1">
                              <span className="text-amber-400 block font-bold">● Menggunakan Local Fallback</span>
                              <span className="text-[10px] text-slate-400 block leading-normal">
                                Supabase mengembalikan error <i>"permission denied"</i>. Pastikan Anda sudah menjalankan bagian <strong>GRANT ALL</strong> di SQL Editor Supabase Anda (ada di bagian bawah halaman ini).
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-6 pt-4 border-t border-slate-900 text-xs text-slate-400 leading-relaxed">
                      Sistem kami cerdas! Jika tabel database di Supabase belum dibuat, sistem otomatis mengalihkan penyimpanan ke file lokal (<code className="text-emerald-400">local_db</code>) agar visual dashboard tetap tampil interaktif dan tidak terjadi crash.
                    </div>
                  </div>
                </div>

                {/* SQL Editor setup copy code block */}
                <div className="bg-slate-900/30 border border-slate-900 rounded-2xl p-4 sm:p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                        <Terminal className="text-emerald-400 w-5 h-5 shrink-0" />
                        SQL Editor Setup (Supabase)
                      </h3>
                      <p className="text-xs text-slate-400 mt-1">Gunakan kode SQL di bawah ini di Dashboard Supabase untuk membuat struktur tabel yang sesuai.</p>
                    </div>

                    <button
                      onClick={() => copyToClipboard(sqlInstructions)}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-200 select-none self-start sm:self-auto shrink-0"
                    >
                      {copiedSql ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">Berhasil Disalin</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Salin Query SQL</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="bg-slate-950/80 border border-slate-900 rounded-xl p-4 sm:p-5 font-mono text-xs text-emerald-400 overflow-x-auto max-h-96 leading-relaxed select-all">
                    <pre className="whitespace-pre-wrap sm:whitespace-pre">{sqlInstructions || "Memuat instruksi SQL..."}</pre>
                  </div>
                </div>

              </div>
            )}
          </>
        )}

        {/* Footer Section */}
        <div className="border-t border-slate-900/60 mt-16 pt-8 text-center text-xs text-slate-500">
          <p>© 2026 CyberGuard WebMonitor. Semua data terenkripsi dan terlindungi.</p>
          <p className="mt-1">Dibuat menggunakan teknologi React, Node.js, Express, dan Supabase.</p>
        </div>

      </div>
    </div>
  );
}
