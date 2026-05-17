import os
import base64
from datetime import datetime, timezone
from typing import Optional
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

from .models import EmailItem

SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]

# Profil başına Gmail service nesnesi
_gmail_services: dict[str, object] = {}


def _token_path(profile_id: str, token_dir: str) -> str:
    return os.path.join(token_dir, f"gmail_token_{profile_id}.json")


def connect(profile_id: str, credentials_path: str, token_dir: str) -> bool:
    """
    OAuth 2.0 akışıyla Gmail'e bağlanır.
    İlk çalıştırmada tarayıcı açılır, sonraki çalıştırmalarda token kullanılır.
    """
    creds = None
    tok_path = _token_path(profile_id, token_dir)

    if os.path.exists(tok_path):
        creds = Credentials.from_authorized_user_file(tok_path, SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(credentials_path, SCOPES)
            creds = flow.run_local_server(port=0)

        with open(tok_path, "w") as f:
            f.write(creds.to_json())

    service = build("gmail", "v1", credentials=creds)
    _gmail_services[profile_id] = service
    return True


def is_connected(profile_id: str) -> bool:
    return profile_id in _gmail_services


def get_emails(profile_id: str, max_results: int = 20) -> list[EmailItem]:
    """Son e-postaları çeker."""
    service = _gmail_services.get(profile_id)
    if not service:
        return []

    emails = []
    try:
        result = service.users().messages().list(
            userId="me",
            maxResults=max_results,
            labelIds=["INBOX"]
        ).execute()

        messages = result.get("messages", [])

        for msg_ref in messages:
            msg = service.users().messages().get(
                userId="me",
                id=msg_ref["id"],
                format="metadata",
                metadataHeaders=["Subject", "From", "Date"]
            ).execute()

            headers = {h["name"]: h["value"] for h in msg.get("payload", {}).get("headers", [])}
            label_ids = msg.get("labelIds", [])

            date_str = headers.get("Date", "")
            parsed_date = _parse_email_date(date_str)

            emails.append(EmailItem(
                profile_id=profile_id,
                message_id=msg_ref["id"],
                subject=headers.get("Subject", "(Konu yok)"),
                sender=headers.get("From", "Bilinmeyen"),
                snippet=msg.get("snippet", ""),
                date=parsed_date,
                is_read="UNREAD" not in label_ids
            ))

    except Exception:
        pass

    return emails


def _parse_email_date(date_str: str) -> Optional[datetime]:
    from email.utils import parsedate_to_datetime
    try:
        return parsedate_to_datetime(date_str).replace(tzinfo=timezone.utc)
    except Exception:
        return None


def disconnect(profile_id: str) -> None:
    _gmail_services.pop(profile_id, None)
    tok_path = _token_path(profile_id, ".")
    if os.path.exists(tok_path):
        os.remove(tok_path)
