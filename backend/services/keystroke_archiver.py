import os
from datetime import datetime
from pathlib import Path

LOG_DIR = Path(__file__).parent.parent / "data" / "keystroke_logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)

def archive_keystroke(profile_id: str, app_name: str, text: str):
    """Gelen klavye verisini o günün dosyasına not olarak ekler."""
    today = datetime.now().strftime("%Y-%m-%d")
    filename = f"{profile_id}_{today}_gunluk_notlar.txt"
    filepath = LOG_DIR / filename
    
    timestamp = datetime.now().strftime("%H:%M:%S")
    log_entry = f"[{timestamp}] [{app_name}] {text}\n"
    
    # Dosyaya ekle (Append)
    with open(filepath, "a", encoding="utf-8") as f:
        f.write(log_entry)

def get_daily_log_list(profile_id: str):
    """Mevcut günlük not dosyalarının listesini döner."""
    files = sorted(LOG_DIR.glob(f"{profile_id}_*.txt"), reverse=True)
    return [{"filename": f.name, "date": f.name.split("_")[1]} for f in files]
