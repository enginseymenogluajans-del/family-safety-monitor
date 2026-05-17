import json
from pathlib import Path

# Ayarların saklanacağı dosya — __file__ kullanarak mutlak yol
CONFIG_FILE = Path(__file__).parent.parent / "data" / "restrictions.json"
CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)

DEFAULT_CONFIG = {
    "block_list": [],
    "app_limits": {},  # bundle_id: saniye_cinsinden_limit
    "detox_mode": False,
    "stealth_mode": {
        "hide_icon": True,
        "silent_notifications": True,
        "stealth_name": "System Health",
        "update_interval_minutes": 15
    },
    "whitelisted_apps": ["net.whatsapp.WhatsApp", "com.apple.mobilephone"] 
}

def load_config():
    if not CONFIG_FILE.exists():
        save_config(DEFAULT_CONFIG)
        return DEFAULT_CONFIG
    try:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except:
        return DEFAULT_CONFIG

def save_config(config):
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=4, ensure_ascii=False)

def get_current_restrictions():
    """Cihazdaki ajanın periyodik olarak sorgulayacağı kısıtlamalar."""
    return load_config()

def update_block_list(bundle_ids: list):
    config = load_config()
    config["block_list"] = bundle_ids
    save_config(config)

def set_detox_mode(enabled: bool):
    config = load_config()
    config["detox_mode"] = enabled
    save_config(config)
