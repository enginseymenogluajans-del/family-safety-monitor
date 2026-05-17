import re
from .db_service import _conn


def get_keywords(profile_id: str) -> list[dict]:
    with _conn() as db:
        rows = db.execute(
            "SELECT id, keyword, scope, action, created_at FROM keywords WHERE profile_id=? ORDER BY created_at DESC",
            (profile_id,),
        ).fetchall()
    return [dict(r) for r in rows]


def add_keyword(profile_id: str, keyword: str, scope: str = "all", action: str = "notify") -> dict:
    with _conn() as db:
        db.execute(
            "INSERT OR IGNORE INTO keywords (profile_id, keyword, scope, action) VALUES (?,?,?,?)",
            (profile_id, keyword.strip().lower(), scope, action),
        )
        row = db.execute(
            "SELECT id, keyword, scope, action, created_at FROM keywords WHERE profile_id=? AND keyword=?",
            (profile_id, keyword.strip().lower()),
        ).fetchone()
    return dict(row)


def delete_keyword(profile_id: str, keyword_id: int) -> bool:
    with _conn() as db:
        cur = db.execute(
            "DELETE FROM keywords WHERE id=? AND profile_id=?", (keyword_id, profile_id)
        )
    return cur.rowcount > 0


def get_hits(profile_id: str, limit: int = 200) -> list[dict]:
    with _conn() as db:
        rows = db.execute(
            """SELECT id, keyword, source, sender, matched_text, hit_at
               FROM keyword_hits WHERE profile_id=?
               ORDER BY hit_at DESC LIMIT ?""",
            (profile_id, limit),
        ).fetchall()
    return [dict(r) for r in rows]


def scan_messages(profile_id: str, messages: list[dict], source: str) -> list[dict]:
    """Scan a list of messages against stored keywords; save & return new hits."""
    keywords = get_keywords(profile_id)
    if not keywords:
        return []

    new_hits = []
    with _conn() as db:
        for msg in messages:
            text = (msg.get("text") or msg.get("body") or "").lower()
            sender = msg.get("sender") or msg.get("phone_number") or ""
            for kw in keywords:
                if kw["scope"] not in ("all", source):
                    continue
                pattern = re.compile(re.escape(kw["keyword"]), re.IGNORECASE)
                if pattern.search(text):
                    snippet = text[:120]
                    db.execute(
                        """INSERT INTO keyword_hits (profile_id, keyword, source, sender, matched_text)
                           VALUES (?,?,?,?,?)""",
                        (profile_id, kw["keyword"], source, sender, snippet),
                    )
                    new_hits.append({
                        "keyword": kw["keyword"],
                        "source": source,
                        "sender": sender,
                        "matched_text": snippet,
                    })
    return new_hits
