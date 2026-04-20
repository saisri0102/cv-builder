import os
import smtplib
import ssl
from email.message import EmailMessage
from time import sleep

# Read environment variables
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", 587))
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")  # must match .env
SMTP_FROM_NAME = os.getenv("SMTP_FROM_NAME", "TalentHireAI Support")
ENV = os.getenv("ENV", "dev").lower()


def _smtp_ready() -> bool:
    """Check if all SMTP config is available."""
    missing = [var for var, val in [
        ("SMTP_HOST", SMTP_HOST),
        ("SMTP_PORT", SMTP_PORT),
        ("SMTP_USER", SMTP_USER),
        ("SMTP_PASSWORD", SMTP_PASSWORD)
    ] if not val]
    if missing:
        print(f"⚠ Missing SMTP config: {missing}")
        return False
    return True


def send_email(to_email: str, subject: str, html: str, retries: int = 2):
    """
    Sends an email using Gmail SMTP.
    In dev mode, prints instead of sending if SMTP is not configured.
    """
    if not _smtp_ready():
        if ENV in {"dev", "local"}:
            print("⚠ SMTP not configured; dev mode: skipping actual send.")
            print(f"To: {to_email}\nSubject: {subject}\n--- HTML ---\n{html}\n")
            return
        raise ValueError("❌ Missing SMTP configuration")

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f"{SMTP_FROM_NAME} <{SMTP_USER}>"
    msg["To"] = to_email
    msg.set_content("This email requires an HTML-capable client.")
    msg.add_alternative(html, subtype="html")

    for attempt in range(retries + 1):
        try:
            context = ssl.create_default_context()
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
                server.ehlo()
                server.starttls(context=context)
                server.ehlo()
                server.login(SMTP_USER, SMTP_PASSWORD)
                server.send_message(msg)
                print(f"✅ Email sent to {to_email}")
                return
        except Exception as e:
            print(f"❌ Attempt {attempt + 1} failed: {e}")
            if attempt < retries:
                sleep(2)  # small delay before retry
            else:
                raise RuntimeError(f"Failed to send email after {retries+1} attempts") from e
