import React, { useState } from "react";
import WhatsAppMonitor from "./WhatsAppMonitor";
import DashboardView from "./DashboardView";
import SetupView from "./SetupView";
import familyAvatar from "./assets/family_avatar.png";
import {
  CallsView,
  SmsView,
  PhotoView,
  EventsView,
  WifiView,
  KeywordView,
  GpsLocationsView,
  InstalledAppsView,
  LoggerView,
  GeoFencingView,
  BlockCallsView,
  BrowserHistoryView,
  BrowserBookmarkView,
  EmailView,
  ViberView,
  LiveControlView,
  TimelineView,
  ContactsView,
  VideoView,
  BlockWebsitesView,
  BlockAppsView,
  BlockWifiView,
  SocialMonitorView,
  SettingsView,
  DailyLogsView,
  RiskView,
  ScreenTimeView,
} from "./Views";
import LiveScreenshots from "./LiveScreenshots";
import {
  Home,
  Users,
  MessageSquare,
  Phone,
  Calendar,
  Image,
  Video,
  Wifi,
  Target,
  Key,
  AppWindow,
  MapPin,
  Map,
  Shield,
  ChevronDown,
  Smartphone,
  Clock,
  Bookmark,
  AtSign,
  Ban,
  Globe,
  Send,
  Flame,
  MessageCircle,
  Camera,
  MonitorPlay,
  Lock,
  Activity,
  LogOut,
  Settings,
  ShieldAlert,
  Menu,
  QrCode,
} from "lucide-react";

const NavItem = ({
  icon: Icon,
  label,
  badge,
  customColor,
  activeTab,
  setActiveTab,
}) => {
  const isActive = activeTab === label;
  return (
    <button
      onClick={() => setActiveTab(label)}
      className={`w-full flex items-center justify-between px-4 py-2.5 transition-colors ${
        isActive
          ? "bg-zinc-800/80 text-[#00a2ff] border-l-2 border-[#00a2ff] rounded-r-lg font-medium"
          : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 rounded-lg"
      }`}
    >
      <div className="flex items-center gap-4">
        <Icon
          className={`w-5 h-5 ${isActive ? "text-[#00a2ff]" : customColor || ""}`}
        />
        <span>{label}</span>
      </div>
      {badge && (
        <span className="bg-red-500 text-white text-[10px] w-4 h-4 flex items-center justify-center rounded-full font-bold">
          {badge}
        </span>
      )}
    </button>
  );
};

const SectionHeader = ({
  title,
  sectionKey,
  expandedSections,
  toggleSection,
}) => (
  <div
    onClick={() => toggleSection(sectionKey)}
    className="flex justify-between items-center px-4 py-2 text-[11px] font-bold text-zinc-500 uppercase tracking-wider cursor-pointer hover:text-zinc-300"
  >
    {title}{" "}
    <ChevronDown
      className={`w-3 h-3 transition-transform ${expandedSections[sectionKey] ? "" : "-rotate-90"}`}
    />
  </div>
);

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen bg-zinc-950 flex flex-col items-center justify-center p-8 overflow-y-auto">
          <div className="bg-red-500/10 border border-red-500 rounded-xl p-6 max-w-4xl w-full">
            <h1 className="text-red-500 text-2xl font-bold mb-4 flex items-center gap-2">
              <ShieldAlert className="w-8 h-8" />
              Sistem Hatası (Runtime Crash)
            </h1>
            <p className="text-zinc-300 mb-4">
              React uygulamasında beklenmeyen bir hata oluştu. Lütfen aşağıdaki
              hata mesajını inceleyin:
            </p>
            <pre className="bg-black/50 text-red-400 p-4 rounded-lg overflow-x-auto text-sm font-mono whitespace-pre-wrap">
              {this.state.error && this.state.error.toString()}
            </pre>
            <pre className="bg-black/50 text-zinc-500 mt-4 p-4 rounded-lg overflow-x-auto text-xs font-mono whitespace-pre-wrap mt-4">
              {this.state.errorInfo?.componentStack}
            </pre>
            <button
              onClick={() => window.location.reload()}
              className="mt-6 bg-red-500 text-white px-6 py-2 rounded-lg font-bold"
            >
              Yeniden Başlat
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [error, setError] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(null);

  const correctPasscode = import.meta.env.VITE_PASSCODE || "1234";
  const masterRecoveryKey =
    import.meta.env.VITE_RECOVERY_KEY || "FS-MONITOR-99X-77Y";

  const isLocked = () => lockedUntil && Date.now() < lockedUntil;

  const handleLogin = (e) => {
    e.preventDefault();
    if (isLocked()) return;
    if (passcode === correctPasscode) {
      setIsAuthorized(true);
      setAttempts(0);
      setError(false);
    } else {
      const next = attempts + 1;
      setAttempts(next);
      if (next >= 5) setLockedUntil(Date.now() + 30_000);
      setError(true);
      setPasscode("");
    }
  };

  const handleRecovery = (e) => {
    e.preventDefault();
    if (recoveryCode.toUpperCase() === masterRecoveryKey) {
      setIsAuthorized(true);
      setShowRecovery(false);
      setAttempts(0);
      setError(false);
    } else {
      setError(true);
      setRecoveryCode("");
    }
  };

  const handleLogout = () => {
    setIsAuthorized(false);
    setPasscode("");
  };

  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [expandedSections, setExpandedSections] = useState({
    general: true,
    locations: true,
    social: true,
    internet: true,
    security: true,
    restricted: true,
    live: true,
  });

  const toggleSection = (section) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const navProps = {
    activeTab,
    setActiveTab: (tab) => {
      setActiveTab(tab);
      setSidebarOpen(false);
    },
  };
  const sectionProps = { expandedSections, toggleSection };

  const renderContent = () => {
    switch (activeTab) {
      case "Dashboard":
        return <DashboardView />;
      case "WhatsApp":
        return <WhatsAppMonitor />;
      case "Aramalar":
        return <CallsView />;
      case "SMS":
        return <SmsView />;
      case "Fotoğraflar":
        return <PhotoView />;
      case "Videolar":
        return <VideoView />;
      case "Rehber":
        return <ContactsView />;
      case "Etkinlikler":
        return <EventsView />;
      case "Wi-Fi Ağları":
        return <WifiView />;
      case "Kelime Takibi":
        return <KeywordView />;
      case "GPS Konumları":
        return <GpsLocationsView />;
      case "Yüklü Uygulamalar":
        return <InstalledAppsView />;
      case "Klavye Takibi":
        return <LoggerView />;
      case "Güvenli Bölge":
        return <GeoFencingView />;
      case "Aramaları Engelle":
        return <BlockCallsView />;
      case "Wi-Fi Engelle":
        return <BlockWifiView />;
      case "Web Sitelerini Engelle":
        return <BlockWebsitesView />;
      case "Uygulamaları Engelle":
        return <BlockAppsView />;
      case "Tarayıcı Geçmişi":
        return <BrowserHistoryView />;
      case "Yer İmleri":
        return <BrowserBookmarkView />;
      case "E-Posta":
        return <EmailView />;
      case "Canlı Kontrol":
        return <LiveControlView />;
      case "Zaman Çizelgesi":
        return <TimelineView />;
      case "Canlı Ekran":
        return (
          <LiveScreenshots
            profileId="default"
            backendUrl={import.meta.env.VITE_API_URL || "http://localhost:8000"}
          />
        );
      case "Günlük Notlar":
        return <DailyLogsView />;
      case "Ayarlar":
        return <SettingsView />;
      case "iPhone Kurulumu":
      case "WhatsApp Kurulum":
        return <SetupView />;
      case "Risk Raporu":
        return <RiskView />;
      case "Ekran Süresi":
        return <ScreenTimeView />;

      // Social Networks (using generic view)
      case "KiK":
      case "Telegram":
      case "LINE":
      case "Snapchat":
      case "Hangouts":
      case "Skype":
      case "Instagram Messages":
      case "Facebook Tracking":
      case "Tinder":
        return <SocialMonitorView networkName={activeTab} />;

      default:
        return (
          <div className="flex items-center justify-center h-full text-zinc-500 flex-col gap-4">
            <AppWindow className="w-12 h-12 opacity-50" />
            <p>This view ({activeTab}) is under construction.</p>
          </div>
        );
    }
  };

  if (!isAuthorized) {
    return (
      <div className="h-screen w-screen bg-zinc-950 flex items-center justify-center font-sans">
        <div className="w-80 p-8 bg-zinc-900 rounded-2xl border border-zinc-800 shadow-2xl flex flex-col items-center">
          <div className="w-16 h-16 bg-[#00a2ff]/10 rounded-full flex items-center justify-center mb-6">
            <Lock
              className={`w-8 h-8 ${showRecovery ? "text-emerald-500" : "text-[#00a2ff]"}`}
            />
          </div>

          <h2 className="text-xl font-bold text-white mb-2">
            {showRecovery ? "Kurtarma Modu" : "Güvenlik Girişi"}
          </h2>
          <p className="text-xs text-zinc-500 mb-8 text-center uppercase tracking-widest font-semibold">
            {showRecovery ? "Master Key Gerekli" : "Dashboard Erişimi"}
          </p>

          {!showRecovery ? (
            <form onSubmit={handleLogin} className="w-full space-y-4">
              <div className="relative">
                <input
                  type="password"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  placeholder="Geçiş Şifresi"
                  className={`w-full bg-zinc-950 border ${error ? "border-red-500" : "border-zinc-800"} rounded-xl px-4 py-3 text-center text-white text-lg tracking-[0.5em] focus:outline-none focus:border-[#00a2ff] transition-all`}
                  autoFocus
                />
                {error && (
                  <p className="text-[10px] text-red-500 mt-2 text-center font-bold">
                    Hatalı şifre!
                  </p>
                )}
              </div>
              {isLocked() && (
                <p className="text-[10px] text-orange-400 text-center font-bold">
                  Çok fazla deneme. 30 saniye bekleyin.
                </p>
              )}
              <button
                type="submit"
                disabled={isLocked()}
                className="w-full bg-[#00a2ff] hover:bg-[#008de6] disabled:opacity-40 text-white font-bold py-3 rounded-xl transition-all active:scale-95 shadow-lg shadow-[#00a2ff]/20"
              >
                Giriş Yap
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowRecovery(true);
                  setError(false);
                }}
                className="w-full text-zinc-600 text-[10px] font-bold uppercase hover:text-zinc-400 transition-colors"
              >
                Şifremi Unuttum?
              </button>
            </form>
          ) : (
            <form onSubmit={handleRecovery} className="w-full space-y-4">
              <div className="relative">
                <input
                  type="text"
                  value={recoveryCode}
                  onChange={(e) => setRecoveryCode(e.target.value)}
                  placeholder="FS-MONITOR-XXX-..."
                  className={`w-full bg-zinc-950 border ${error ? "border-red-500" : "border-zinc-800"} rounded-xl px-4 py-3 text-center text-white text-[11px] font-mono tracking-wider focus:outline-none focus:border-emerald-500 transition-all`}
                  autoFocus
                />
                {error && (
                  <p className="text-[10px] text-red-500 mt-2 text-center font-bold">
                    Geçersiz Master Key!
                  </p>
                )}
              </div>
              <button
                type="submit"
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl transition-all active:scale-95 shadow-lg shadow-emerald-500/20"
              >
                Sistemi Kurtar
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowRecovery(false);
                  setError(false);
                }}
                className="w-full text-zinc-600 text-[10px] font-bold uppercase hover:text-zinc-400 transition-colors"
              >
                Giriş Ekranına Dön
              </button>
            </form>
          )}

          <div className="mt-8 flex items-center gap-2 text-zinc-600 text-[10px] font-bold uppercase tracking-wider">
            <Shield className="w-3 h-3" />{" "}
            {showRecovery ? "Recovery Protocol" : "Secure Connection"}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-screen overflow-hidden bg-zinc-950 text-zinc-300 font-sans selection:bg-blue-500/30">
      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 z-30 bg-black/50"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        className={`absolute md:relative z-40 w-[280px] bg-zinc-900 border-r border-zinc-800 flex flex-col h-full shrink-0 overflow-y-auto custom-scrollbar transition-transform duration-200 ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}
      >
        <div className="h-14 bg-[#00a2ff] flex items-center justify-between px-4 text-white shrink-0">
          <div className="flex items-center gap-2 font-black text-xl tracking-tight">
            <img
              src={familyAvatar}
              alt="Logo"
              className="w-8 h-8 rounded-full border border-white/30"
            />{" "}
            Sessiz Muhafız
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-bold opacity-80 leading-none">
              AJAN
            </span>
            <span className="text-xs font-black">V2.4.6</span>
          </div>
        </div>

        <div className="p-4 bg-zinc-800/50 border-b border-zinc-800 flex items-center justify-between m-3 rounded-lg shrink-0">
          <div className="flex items-center gap-3">
            <Smartphone className="w-5 h-5 text-zinc-400" />
            <span className="text-zinc-200 text-sm font-medium">
              Sessiz Ajan Aktif
            </span>
          </div>
          <span className="text-[9px] bg-[#00a2ff] text-white px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
            Premium
          </span>
        </div>

        <div className="px-3 mb-2 shrink-0">
          <NavItem icon={Home} label="Dashboard" {...navProps} />
        </div>

        <div className="px-3 mb-2">
          <SectionHeader
            title="Canlı İzleme"
            sectionKey="live"
            {...sectionProps}
          />
          {expandedSections.live && (
            <nav className="space-y-0.5 text-sm mt-1">
              <NavItem
                icon={MonitorPlay}
                label="Canlı Kontrol"
                customColor="text-red-500"
                {...navProps}
              />
              <NavItem
                icon={Camera}
                label="Canlı Ekran"
                customColor="text-emerald-400"
                {...navProps}
              />
              <NavItem
                icon={Activity}
                label="Zaman Çizelgesi"
                customColor="text-purple-400"
                {...navProps}
              />
            </nav>
          )}
        </div>

        <div className="px-3 mb-2">
          <SectionHeader
            title="İstihbarat & Veri"
            sectionKey="general"
            {...sectionProps}
          />
          {expandedSections.general && (
            <nav className="space-y-0.5 text-sm mt-1">
              <NavItem icon={Users} label="Rehber" {...navProps} />
              <NavItem
                icon={MessageSquare}
                label="SMS"
                customColor="text-blue-400"
                {...navProps}
              />
              <NavItem icon={Phone} label="Aramalar" {...navProps} />
              <NavItem icon={Calendar} label="Etkinlikler" {...navProps} />
              <NavItem icon={Image} label="Fotoğraflar" {...navProps} />
              <NavItem icon={Video} label="Videolar" {...navProps} />
              <NavItem icon={Wifi} label="Wi-Fi Ağları" {...navProps} />
              <NavItem icon={Target} label="Kelime Takibi" {...navProps} />
              <NavItem
                icon={Key}
                label="Klavye Takibi"
                customColor="text-amber-500"
                {...navProps}
              />
              <NavItem
                icon={Clock}
                label="Günlük Notlar"
                customColor="text-[#00a2ff]"
                {...navProps}
              />
              <NavItem
                icon={AppWindow}
                label="Yüklü Uygulamalar"
                {...navProps}
              />
              <NavItem
                icon={Clock}
                label="Ekran Süresi"
                customColor="text-purple-400"
                {...navProps}
              />
            </nav>
          )}
        </div>

        <div className="px-3 mb-2">
          <SectionHeader
            title="Konumlar"
            sectionKey="locations"
            {...sectionProps}
          />
          {expandedSections.locations && (
            <nav className="space-y-0.5 text-sm mt-1">
              <NavItem icon={MapPin} label="GPS Konumları" {...navProps} />
              <NavItem icon={Map} label="Güvenli Bölge" {...navProps} />
            </nav>
          )}
        </div>

        <div className="px-3 mb-2">
          <SectionHeader
            title="Sosyal Ağlar"
            sectionKey="social"
            {...sectionProps}
          />
          {expandedSections.social && (
            <nav className="space-y-0.5 text-sm mt-1">
              <NavItem
                icon={MessageSquare}
                label="WhatsApp"
                customColor="text-emerald-500"
                {...navProps}
              />
              <NavItem
                icon={QrCode}
                label="WhatsApp Kurulum"
                customColor="text-zinc-500"
                {...navProps}
              />
            </nav>
          )}
        </div>

        <div className="px-3 mb-2">
          <SectionHeader
            title="İnternet Kullanımı"
            sectionKey="internet"
            {...sectionProps}
          />
          {expandedSections.internet && (
            <nav className="space-y-0.5 text-sm mt-1">
              <NavItem icon={Clock} label="Tarayıcı Geçmişi" {...navProps} />
              <NavItem icon={Bookmark} label="Yer İmleri" {...navProps} />
              <NavItem
                icon={AtSign}
                label="E-Posta"
                customColor="text-blue-400"
                {...navProps}
              />
            </nav>
          )}
        </div>

        <div className="px-3 mb-2">
          <SectionHeader
            title="Güvenlik"
            sectionKey="security"
            {...sectionProps}
          />
          {expandedSections.security && (
            <nav className="space-y-0.5 text-sm mt-1">
              <NavItem
                icon={ShieldAlert}
                label="Risk Raporu"
                customColor="text-red-400"
                {...navProps}
              />
            </nav>
          )}
        </div>

        <div className="px-3 mb-6">
          <SectionHeader
            title="Kısıtlamalar"
            sectionKey="restricted"
            {...sectionProps}
          />
          {expandedSections.restricted && (
            <nav className="space-y-0.5 text-sm mt-1">
              <NavItem
                icon={Ban}
                label="Aramaları Engelle"
                customColor="text-blue-400"
                {...navProps}
              />
              <NavItem
                icon={Wifi}
                label="Wi-Fi Engelle"
                customColor="text-blue-400"
                {...navProps}
              />
              <NavItem
                icon={Globe}
                label="Web Sitelerini Engelle"
                customColor="text-blue-400"
                {...navProps}
              />
              <NavItem
                icon={AppWindow}
                label="Uygulamaları Engelle"
                customColor="text-blue-400"
                {...navProps}
              />
            </nav>
          )}
        </div>

        <div className="mt-auto border-t border-zinc-800 shrink-0">
          <button
            onClick={() => setActiveTab("Ayarlar")}
            className={`w-full flex items-center gap-4 px-6 py-4 border-b border-zinc-800 transition-colors ${
              activeTab === "Ayarlar"
                ? "bg-zinc-800/80 text-[#00a2ff] border-l-2 border-[#00a2ff]"
                : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            }`}
          >
            <Settings className="w-5 h-5" />
            <span className="font-bold text-sm uppercase tracking-wider">
              Ayarlar
            </span>
          </button>
          <div className="p-4">
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 text-red-400 bg-red-500/5 hover:bg-red-500/10 border border-red-500/10 hover:border-red-500/20 rounded-xl transition-all group"
            >
              <LogOut className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
              <span className="font-bold text-xs uppercase tracking-widest">
                Sistemi Kapat
              </span>
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 bg-zinc-950 flex flex-col min-w-0 overflow-hidden">
        <div className="md:hidden flex items-center h-12 px-4 bg-zinc-900 border-b border-zinc-800 shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-zinc-400 hover:text-white transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="ml-3 text-sm font-bold text-zinc-200 truncate">
            {activeTab}
          </span>
        </div>
        <ErrorBoundary>{renderContent()}</ErrorBoundary>
      </main>
    </div>
  );
}

export default App;
