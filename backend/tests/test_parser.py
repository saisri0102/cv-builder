from fastapi import UploadFile
import io
from backend.utils.parser import extract_text

def test_extract_text_from_txt():
    content = "Python developer with AWS experience"
    file = UploadFile(filename="resume.txt", file=io.BytesIO(content.encode()))
    text = extract_text(file)
    assert "python" in text
    assert "aws" in text
