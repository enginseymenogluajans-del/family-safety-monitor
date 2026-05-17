import React, { useState, useEffect, useCallback } from "react";
import { apiFetch, BACKEND_URL } from "./api";
import {
  Cloud,
  HardDrive,
  MessageSquare,
  Activity,
  Eye,
  EyeOff,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  Folder,
  Shield,
  AlertCircle,
  AtSign,
} from "lucide-react";

const PROFILE_ID = "default";

// ── Shared Components ────────────────────────────────────────────────────────

function Card({ children, className = "" }) {
  return (
    <div
      className={`bg-zinc-900 border border-zinc-800 rounded-2xl p-6 ${className}`}
    >
      {children}
    </div>
  );
}

function SuccessBanner({ message }) {
  return (
    <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center gap-2 text-emerald-400">
      <CheckCircle className="w-5 h-5 shrink-0" />
      <span className="font-bold">{message}</span>
    </div>
  );
}

function ErrorBanner({ message }) {
  return (
    <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-2 text-red-400">
      <XCircle className="w-5 h-5 shrink-0" />
      <span className="text-sm">{message}</span>
    </div>
  );
}

// ── Part 1: iCloud Connect Form ───────────────────────────────────────────────

function ICloudStep() {
  const [appleId, setAppleId] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [show2fa, setShow2fa] = useState(false);
  const [code2fa, setCode2fa] = useState("");
  const [tfaLoading, setTfaLoading] = useState(false);
  const [tfaError, setTfaError] = useState("");

  const handleConnect = async (e) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const r = await apiFetch(`${BACKEND_URL}/api/auth/icloud`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile_id: PROFILE_ID,
          name: "iPhone",
          apple_id: appleId,
          password,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || "Bağlantı başarısız");
      setResult(data);
      if (data.requires_2fa) setShow2fa(true);
    } catch (err) {
      setResult({ error: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handle2fa = async (e) => {
    e.preventDefault();
    setTfaLoading(true);
    setTfaError("");
    try {
      const r = await apiFetch(`${BACKEND_URL}/api/auth/2fa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile_id: PROFILE_ID, code: code2fa }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || "2FA doğrulaması başarısız");
      setResult(data);
      setShow2fa(false);
    } catch (err) {
      setTfaError(err.message);
    } finally {
      setTfaLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-[#00a2ff]/10 rounded-xl flex items-center justify-center">
            <Cloud className="w-5 h-5 text-[#00a2ff]" />
          </div>
          <div>
            <h3 className="text-white font-bold text-lg">iCloud Bağlantısı</h3>
            <p className="text-zinc-500 text-sm">
              Apple ID ile iPhone'a uzaktan bağlanın
            </p>
          </div>
        </div>

        {result?.connected && (
          <SuccessBanner message="iCloud bağlantısı başarılı!" />
        )}
        {result?.error && <ErrorBanner message={result.error} />}

        <form onSubmit={handleConnect} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
              Apple ID
            </label>
            <input
              type="email"
              value={appleId}
              onChange={(e) => setAppleId(e.target.value)}
              placeholder="ornek@icloud.com"
              className="w-full bg-zinc-950 border border-zinc-800 focus:border-[#00a2ff] rounded-xl px-4 py-3 text-white focus:outline-none transition-colors"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
              Şifre
            </label>
            <div className="relative">
              <input
                type={showPwd ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-[#00a2ff] rounded-xl px-4 py-3 pr-12 text-white focus:outline-none transition-colors"
                required
              />
              <button
                type="button"
                onClick={() => setShowPwd(!showPwd)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                {showPwd ? (
                  <EyeOff className="w-5 h-5" />
                ) : (
                  <Eye className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || result?.connected}
            className="w-full bg-[#00a2ff] hover:bg-[#008de6] disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-all active:scale-95 shadow-lg shadow-[#00a2ff]/10"
          >
            {loading
              ? "Bağlanıyor..."
              : result?.connected
                ? "✓ Bağlı"
                : "Bağlan"}
          </button>
        </form>
      </Card>

      {/* 2FA Modal */}
      {show2fa && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-8 w-full max-w-sm shadow-2xl">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Shield className="w-8 h-8 text-amber-400" />
              </div>
              <h3 className="text-white font-bold text-xl">
                İki Faktörlü Doğrulama
              </h3>
              <p className="text-zinc-400 text-sm mt-2">
                iPhone veya iPad'inize gönderilen 6 haneli kodu girin
              </p>
            </div>

            <form onSubmit={handle2fa} className="space-y-4">
              <input
                type="text"
                value={code2fa}
                onChange={(e) =>
                  setCode2fa(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="000000"
                maxLength={6}
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-amber-400 rounded-xl px-4 py-4 text-center text-white text-2xl tracking-[0.5em] font-mono focus:outline-none transition-colors"
                autoFocus
              />
              {tfaError && (
                <p className="text-red-400 text-sm text-center">{tfaError}</p>
              )}
              <button
                type="submit"
                disabled={tfaLoading || code2fa.length < 6}
                className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-all active:scale-95"
              >
                {tfaLoading ? "Doğrulanıyor..." : "Doğrula"}
              </button>
              <button
                type="button"
                onClick={() => setShow2fa(false)}
                className="w-full text-zinc-600 text-sm hover:text-zinc-400 transition-colors py-1"
              >
                İptal
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Part 2: Local Backup Connector ────────────────────────────────────────────

function BackupStep() {
  const [backupPath, setBackupPath] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleConnect = async (e) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const r = await apiFetch(`${BACKEND_URL}/api/auth/local-backup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile_id: PROFILE_ID,
          backup_path: backupPath,
          passphrase: passphrase || null,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || "Backup bağlantısı başarısız");
      if (!data.connected)
        throw new Error(data.error || "Backup klasörü bulunamadı");
      setResult(data);
    } catch (err) {
      setResult({ error: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-purple-500/10 rounded-xl flex items-center justify-center">
          <HardDrive className="w-5 h-5 text-purple-400" />
        </div>
        <div>
          <h3 className="text-white font-bold text-lg">
            Yerel iTunes / Finder Backup
          </h3>
          <p className="text-zinc-500 text-sm">
            SMS, arama geçmişi ve yüklü uygulamalar
          </p>
        </div>
      </div>

      {result?.connected && (
        <SuccessBanner message="Backup bağlantısı başarılı!" />
      )}
      {result?.error && <ErrorBanner message={result.error} />}

      <form onSubmit={handleConnect} className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
            Backup Klasör Yolu
          </label>
          <div className="relative">
            <input
              type="text"
              value={backupPath}
              onChange={(e) => setBackupPath(e.target.value)}
              placeholder="Backup klasörünün tam yolunu girin..."
              className="w-full bg-zinc-950 border border-zinc-800 focus:border-purple-400 rounded-xl px-4 py-3 pr-12 text-white focus:outline-none transition-colors font-mono text-sm"
              required
            />
            <Folder className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-600 pointer-events-none" />
          </div>
          <div className="mt-2 space-y-1 bg-zinc-800/40 rounded-lg p-3">
            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-1">
              Varsayılan Konumlar
            </p>
            <p className="text-[11px] text-zinc-500 font-mono">
              Mac: ~/Library/Application Support/MobileSync/Backup/
            </p>
            <p className="text-[11px] text-zinc-500 font-mono">
              Windows: C:\Users\[ad]\AppData\Roaming\Apple
              Computer\MobileSync\Backup\
            </p>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
            Şifre{" "}
            <span className="text-zinc-600 normal-case font-normal">
              (yalnızca şifreli backup için)
            </span>
          </label>
          <div className="relative">
            <input
              type={showPass ? "text" : "password"}
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="Opsiyonel"
              className="w-full bg-zinc-950 border border-zinc-800 focus:border-purple-400 rounded-xl px-4 py-3 pr-12 text-white focus:outline-none transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowPass(!showPass)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              {showPass ? (
                <EyeOff className="w-5 h-5" />
              ) : (
                <Eye className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || result?.connected}
          className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-all active:scale-95 shadow-lg shadow-purple-500/10"
        >
          {loading
            ? "Bağlanıyor..."
            : result?.connected
              ? "✓ Backup Bağlı"
              : "Backup Bağla"}
        </button>
      </form>
    </Card>
  );
}

// ── Part 3: WhatsApp QR Panel ─────────────────────────────────────────────────

function WhatsAppQRStep() {
  const [qrData, setQrData] = useState(null);
  const [connected, setConnected] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const [agentDown, setAgentDown] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);

  const fetchQR = useCallback(async () => {
    try {
      const r = await apiFetch(`${BACKEND_URL}/api/whatsapp/qr`);
      const data = await r.json();
      setAgentDown(!!data.error);
      if (data.connected) {
        setConnected(true);
        setQrData(null);
        setWaiting(false);
      } else {
        setConnected(false);
        setQrData(data.qr_base64 || null);
        setWaiting(!data.qr_base64 && !data.error);
      }
      setLastRefresh(new Date());
    } catch {
      setAgentDown(true);
    }
  }, []);

  useEffect(() => {
    fetchQR();
    const id = setInterval(fetchQR, 30000);
    return () => clearInterval(id);
  }, [fetchQR]);

  return (
    <Card>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-white font-bold text-lg">
              WhatsApp Bağlantısı
            </h3>
            <p className="text-zinc-500 text-sm">
              QR kodu tarayarak canlı mesaj takibini başlatın
            </p>
          </div>
        </div>
        <button
          onClick={fetchQR}
          className="flex items-center gap-2 text-zinc-400 hover:text-zinc-200 text-xs font-bold border border-zinc-700 hover:border-zinc-600 px-3 py-1.5 rounded-lg transition-all"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Yenile
        </button>
      </div>

      {connected ? (
        <div className="flex flex-col items-center py-10">
          <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mb-4 ring-4 ring-emerald-500/20">
            <CheckCircle className="w-10 h-10 text-emerald-400" />
          </div>
          <p className="text-emerald-400 font-bold text-xl">WhatsApp Bağlı</p>
          <p className="text-zinc-500 text-sm mt-2">
            Mesajlar aktif olarak izleniyor
          </p>
        </div>
      ) : agentDown ? (
        <div className="flex flex-col items-center py-10">
          <AlertCircle className="w-12 h-12 text-red-400 mb-3" />
          <p className="text-red-400 font-bold text-lg">
            WhatsApp Agent Çalışmıyor
          </p>
          <div className="mt-4 bg-zinc-800/60 rounded-xl p-4 text-center">
            <p className="text-zinc-400 text-xs mb-2 font-bold uppercase tracking-wider">
              Terminalde çalıştırın:
            </p>
            <code className="text-[#00a2ff] text-sm font-mono">
              cd whatsapp-agent && node index.js
            </code>
          </div>
        </div>
      ) : qrData ? (
        <div className="flex flex-col items-center">
          <div className="bg-white p-3 rounded-2xl shadow-2xl mb-5">
            <img
              src={qrData}
              alt="WhatsApp QR Kodu"
              className="w-56 h-56 block"
            />
          </div>
          <p className="text-zinc-200 font-bold text-base">QR Kodu Tarayın</p>
          <p className="text-zinc-500 text-sm mt-1">
            WhatsApp → Bağlı Cihazlar → Cihaz Ekle
          </p>
          {lastRefresh && (
            <p className="text-zinc-600 text-xs mt-4">
              Son güncelleme: {lastRefresh.toLocaleTimeString("tr-TR")} · 30
              saniyede bir otomatik yenilenir
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center py-10">
          <div className="w-14 h-14 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin mb-4" />
          <p className="text-zinc-400 font-bold">QR Kodu Oluşturuluyor</p>
          <p className="text-zinc-600 text-sm mt-2">
            WhatsApp Agent başlatılıyor, lütfen bekleyin...
          </p>
        </div>
      )}
    </Card>
  );
}

// ── Part 4: Connection Status Panel ──────────────────────────────────────────

const SOURCE_CONFIG = [
  {
    key: "icloud",
    label: "iCloud",
    Icon: Cloud,
    color: "text-[#00a2ff]",
    bg: "bg-[#00a2ff]/10",
  },
  {
    key: "backup",
    label: "Yerel Backup",
    Icon: HardDrive,
    color: "text-purple-400",
    bg: "bg-purple-500/10",
  },
  {
    key: "gmail",
    label: "Gmail",
    Icon: AtSign,
    color: "text-red-400",
    bg: "bg-red-500/10",
  },
  {
    key: "whatsapp",
    label: "WhatsApp",
    Icon: MessageSquare,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
  },
];

function statusInfo(status) {
  if (status === "connected")
    return {
      label: "Bağlı",
      dot: "bg-emerald-400 animate-pulse",
      text: "text-emerald-400",
    };
  if (status === "needs_2fa")
    return {
      label: "2FA Gerekli",
      dot: "bg-amber-400",
      text: "text-amber-400",
    };
  if (status === "pending")
    return {
      label: "QR Bekleniyor",
      dot: "bg-amber-400",
      text: "text-amber-400",
    };
  return { label: "Bağlı Değil", dot: "bg-red-500", text: "text-red-400" };
}

function StatusStep() {
  const [connections, setConnections] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchConnections = useCallback(async () => {
    setError("");
    try {
      const r = await apiFetch(`${BACKEND_URL}/api/connections/${PROFILE_ID}`);
      if (!r.ok) throw new Error("Bağlantı durumu alınamadı");
      setConnections(await r.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConnections();
    const id = setInterval(fetchConnections, 10000);
    return () => clearInterval(id);
  }, [fetchConnections]);

  const connectedCount = connections
    ? Object.values(connections).filter((v) => v === "connected").length
    : 0;

  return (
    <Card>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#00a2ff]/10 rounded-xl flex items-center justify-center">
            <Activity className="w-5 h-5 text-[#00a2ff]" />
          </div>
          <div>
            <h3 className="text-white font-bold text-lg">Bağlantı Durumu</h3>
            <p className="text-zinc-500 text-sm">
              Tüm veri kaynakları — 10 saniyede bir güncellenir
            </p>
          </div>
        </div>
        <button
          onClick={() => {
            setLoading(true);
            fetchConnections();
          }}
          className="flex items-center gap-2 text-zinc-400 hover:text-zinc-200 text-xs font-bold border border-zinc-700 hover:border-zinc-600 px-3 py-1.5 rounded-lg transition-all"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Yenile
        </button>
      </div>

      {/* Summary pill */}
      {connections && !loading && (
        <div
          className={`mb-4 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 ${
            connectedCount === 4
              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
              : connectedCount === 0
                ? "bg-red-500/10 text-red-400 border border-red-500/20"
                : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
          }`}
        >
          {connectedCount === 4 ? (
            <CheckCircle className="w-4 h-4" />
          ) : (
            <Clock className="w-4 h-4" />
          )}
          {connectedCount}/4 kaynak bağlı
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <div className="w-10 h-10 border-4 border-zinc-700 border-t-[#00a2ff] rounded-full animate-spin" />
        </div>
      ) : error ? (
        <ErrorBanner message={error} />
      ) : connections ? (
        <div className="space-y-2">
          {SOURCE_CONFIG.map(({ key, label, Icon, color, bg }) => {
            const status = connections[key] || "disconnected";
            const info = statusInfo(status);
            return (
              <div
                key={key}
                className="flex items-center justify-between p-4 bg-zinc-800/50 hover:bg-zinc-800/80 rounded-xl border border-zinc-800 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-9 h-9 ${bg} rounded-lg flex items-center justify-center shrink-0`}
                  >
                    <Icon className={`w-4 h-4 ${color}`} />
                  </div>
                  <span className="text-zinc-200 font-medium text-sm">
                    {label}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${info.dot}`} />
                  <span className={`text-xs font-bold ${info.text}`}>
                    {info.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </Card>
  );
}

// ── Main SetupView ────────────────────────────────────────────────────────────

const STEPS = [
  { id: "icloud", label: "iCloud", Icon: Cloud },
  { id: "backup", label: "Yerel Backup", Icon: HardDrive },
  { id: "whatsapp", label: "WhatsApp QR", Icon: MessageSquare },
  { id: "status", label: "Bağlantı Durumu", Icon: Activity },
];

export default function SetupView() {
  const [activeStep, setActiveStep] = useState(0);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="h-14 bg-zinc-900/80 border-b border-zinc-800 flex items-center px-6 shrink-0">
        <h2 className="text-white font-bold text-lg tracking-tight">
          iPhone Bağlantı Kurulumu
        </h2>
        <span className="ml-3 text-[10px] bg-[#00a2ff]/10 text-[#00a2ff] border border-[#00a2ff]/20 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
          Onboarding
        </span>
      </div>

      {/* Step tabs */}
      <div className="flex items-center gap-1 px-6 py-3 bg-zinc-900/40 border-b border-zinc-800 shrink-0 overflow-x-auto">
        {STEPS.map((step, i) => {
          const isActive = activeStep === i;
          const { Icon } = step;
          return (
            <button
              key={step.id}
              onClick={() => setActiveStep(i)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${
                isActive
                  ? "bg-[#00a2ff]/10 text-[#00a2ff] border border-[#00a2ff]/30"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 border border-transparent"
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${
                  isActive
                    ? "bg-[#00a2ff] text-white"
                    : "bg-zinc-700 text-zinc-400"
                }`}
              >
                {i + 1}
              </span>
              <Icon className="w-4 h-4" />
              {step.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        <div className="max-w-xl mx-auto">
          {activeStep === 0 && <ICloudStep />}
          {activeStep === 1 && <BackupStep />}
          {activeStep === 2 && <WhatsAppQRStep />}
          {activeStep === 3 && <StatusStep />}

          {/* Next step hint */}
          {activeStep < STEPS.length - 1 && (
            <button
              onClick={() => setActiveStep(activeStep + 1)}
              className="mt-4 w-full text-zinc-600 hover:text-zinc-400 text-xs font-bold py-2 transition-colors"
            >
              Sonraki Adım: {STEPS[activeStep + 1].label} →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
