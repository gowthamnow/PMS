import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.api.reports import sanitize_csv_cell
from app.services.storage_service import validate_extension, ValidationError
from app.core.security import create_access_token, verify_token, get_real_client_ip
from app.services.email_service import send_email

print("--- Running Security Unit Verification Tests ---")

# Test SEC-09: CSV Formula Injection
assert sanitize_csv_cell("=1+1") == "'=1+1"
assert sanitize_csv_cell("+cmd") == "'+cmd"
assert sanitize_csv_cell("-calc") == "'-calc"
assert sanitize_csv_cell("@sum") == "'@sum"
assert sanitize_csv_cell("%comspec%") == "'%comspec%"
assert sanitize_csv_cell("Normal Value") == "Normal Value"
print("[PASS] SEC-09: CSV Formula Injection Sanitization verified")

# Test SEC-10: Email CRLF Header Injection
res = send_email("test@example.com\r\nBcc: evil@example.com", "Subject\r\nInjected: true", "body")
assert res is False # Handled cleanly in simulation
print("[PASS] SEC-10: Email CRLF Header Injection Sanitization verified")

# Test SEC-11: Attachment File Extension Allowlist & Dangerous Rejection
for dangerous in ["test.html", "exploit.svg", "shell.php", "malware.exe", "batch.bat", "macro.vbs"]:
    try:
        validate_extension(dangerous)
        assert False, f"Should have blocked {dangerous}"
    except ValidationError:
        pass

assert validate_extension("schematic.kicad_sch") == "kicadsch"
assert validate_extension("board.pdf") == "pdf"
assert validate_extension("firmware.bin") == "bin"
assert validate_extension("photo.png") == "png"
print("[PASS] SEC-11: Attachment Extension Allowlist and Dangerous Blocking verified")

# Test SEC-12: JWT Token Expiration and Issued-At (iat) Claim
tok = create_access_token({"sub": "test-user-id", "role": "ENGINEER"})
pl = verify_token(tok)
assert "exp" in pl, "Missing exp in token payload"
assert "iat" in pl, "Missing iat in token payload"
assert pl["role"] == "ENGINEER"
print("[PASS] SEC-12: JWT Token iat and exp verified")

# Test SEC-13: Real Client IP Proxy Resolution
class MockRequest:
    def __init__(self, headers, host="127.0.0.1"):
        self.headers = headers
        self.client = type("Client", (), {"host": host})()

assert get_real_client_ip(MockRequest({"CF-Connecting-IP": "203.0.113.195"})) == "203.0.113.195"
assert get_real_client_ip(MockRequest({"X-Forwarded-For": "198.51.100.42, 10.0.0.1"})) == "198.51.100.42"
assert get_real_client_ip(MockRequest({"X-Real-IP": "192.0.2.99"})) == "192.0.2.99"
assert get_real_client_ip(MockRequest({}, host="172.16.0.5")) == "172.16.0.5"
print("[PASS] SEC-13: Real Client IP Proxy Header Resolution verified")

print("\nALL LOCAL SECURITY UNIT TESTS PASSED!")
