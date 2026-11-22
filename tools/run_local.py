"""Run the HospitalVoice app (../app) locally for testing: http://127.0.0.1:8000

  genie_voice_app_merge/.venv/bin/python tools/run_local.py

Signs in with the Databricks CLI profile "dais2026" (your account, not the app's service principal) and adds the
X-Forwarded-Email header that Databricks Apps normally provides, so the referral endpoints work. Local only.
Rebuild the Find Facility frontend first:  (cd app/frontend && npx vite build)
"""
import json, os, subprocess, sys

APP = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "app")
os.environ.setdefault("DATABRICKS_CONFIG_PROFILE", "dais2026")
email = json.loads(subprocess.check_output(["databricks", "-p", "dais2026", "current-user", "me", "-o", "json"]))["userName"]
sys.path.insert(0, APP)
os.chdir(APP)
from app import app  # noqa: E402


class AddUserHeader:
    def __init__(self, wsgi):
        self.wsgi = wsgi

    def __call__(self, environ, start_response):
        environ.setdefault("HTTP_X_FORWARDED_EMAIL", email)
        return self.wsgi(environ, start_response)


app.wsgi_app = AddUserHeader(app.wsgi_app)
if __name__ == "__main__":
    print(f"Local app for {email}: http://127.0.0.1:8000")
    app.run(host="127.0.0.1", port=8000, debug=False)
