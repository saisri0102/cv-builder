# backend/utils/otp_emailer.py
import random
from backend.utils.emailer import send_email

def generate_otp(length: int = 6) -> str:
    """Generate a numeric OTP of given length (default 6 digits)."""
    return "".join(str(random.randint(0, 9)) for _ in range(length))


def send_otp_email(to_email: str, otp: str, user_name: str = "User"):
    """
    Sends an OTP email using the send_email function.
    """
    subject = "Your TalentHireAI OTP Code"
    html_content = f"""
    <html>
    <body>
        <p>Hi {user_name},</p>
        <p>Your OTP code for TalentHireAI is:</p>
        <h2 style="color: #2E86C1;">{otp}</h2>
        <p>This code is valid for 10 minutes.</p>
        <p>If you did not request this, please ignore this email.</p>
    </body>
    </html>
    """

    send_email(to_email, subject, html_content)


# Example usage
if __name__ == "__main__":
    test_email = "harishsure45@gmail.com"
    otp = generate_otp()
    print(f"Generated OTP: {otp}")
    send_otp_email(test_email, otp)
