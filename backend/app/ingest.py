"""Bounded intake without retaining the evidence payload in application memory."""
import hashlib
import zipfile
from pathlib import PurePath

from .config import settings


def hash_file(stream):
    stream.seek(0)
    digest = hashlib.sha256(); size = 0
    while chunk := stream.read(64 * 1024):
        size += len(chunk)
        if size > settings.max_upload_bytes:
            raise ValueError("Evidence must be 100 MB or smaller.")
        digest.update(chunk)
    stream.seek(0)
    if not size: raise ValueError("Empty evidence files are not accepted.")
    return digest.hexdigest(), size


def safe_filename(name):
    name = PurePath((name or "evidence.bin").replace("\\", "/")).name
    if name in (".",".."):return "evidence.bin"
    return "".join(c if c.isalnum() or c in "._- " else "_" for c in name)[:180] or "evidence.bin"


def validate_content(stream, mime):
    stream.seek(0); head = stream.read(8192); stream.seek(0)
    valid = False
    if mime == "application/pdf": valid = head.startswith(b"%PDF-")
    elif mime == "image/png": valid = head.startswith(b"\x89PNG\r\n\x1a\n")
    elif mime == "image/jpeg": valid = head.startswith(b"\xff\xd8\xff")
    elif mime in ("audio/wav", "audio/x-wav"): valid = head[:4] == b"RIFF" and head[8:12] == b"WAVE"
    elif mime == "audio/mpeg": valid = head.startswith(b"ID3") or (len(head) > 1 and head[0] == 255 and head[1] & 224 == 224)
    elif mime == "video/mp4": valid = head[4:8] == b"ftyp"
    elif mime in ("text/plain", "text/csv", "application/csv"):
        try:
            import codecs
            # A prefix can end inside a Hindi UTF-8 character; do not reject it.
            text = codecs.getincrementaldecoder("utf-8-sig")().decode(head,final=False); valid = "\x00" not in text
            if "csv" in mime: valid = valid and "," in text.splitlines()[0]
        except (UnicodeError, IndexError): pass
    elif mime.endswith("wordprocessingml.document"):
        try:
            with zipfile.ZipFile(stream) as archive:
                valid = "word/document.xml" in archive.namelist() and sum(info.file_size for info in archive.infolist()) <= settings.max_upload_bytes
        except zipfile.BadZipFile: pass
        finally: stream.seek(0)
    if not valid: raise ValueError("File content does not match its declared supported type.")
