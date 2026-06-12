"""Utility helpers shared across the POS Next backend."""
from __future__ import annotations
import json
import time
from pathlib import Path
from pos_next import __version__ as app_version

_BASE_DIR = Path(__file__).resolve().parent
_VERSION_FILE = _BASE_DIR / "public" / "pos" / "version.json"
_MANIFEST_FILE = _BASE_DIR / "public" / "pos" / "manifest.webmanifest"
_FALLBACK_VERSION: str | None = None


def _read_version_file() -> str | None:
	if not _VERSION_FILE.exists():
		return None
	try:
		data = json.loads(_VERSION_FILE.read_text(encoding="utf-8"))
	except (json.JSONDecodeError, OSError, ValueError):
		return None
	version = data.get("version") or data.get("buildVersion")
	return str(version) if version else None


def _manifest_mtime_version() -> str | None:
	if not _MANIFEST_FILE.exists():
		return None
	try:
		return str(int(_MANIFEST_FILE.stat().st_mtime))
	except OSError:
		return None


def get_build_version() -> str:
	version = _read_version_file()
	if version:
		return version
	mtime_version = _manifest_mtime_version()
	if mtime_version:
		return mtime_version
	global _FALLBACK_VERSION
	if _FALLBACK_VERSION is None:
		_FALLBACK_VERSION = f"{app_version}-{int(time.time())}"
	return _FALLBACK_VERSION


def get_app_version() -> str:
	return app_version


# =============================================================================
# HTTP Response Headers
# =============================================================================

def add_sw_headers(response):
	"""
	Inject Service-Worker-Allowed header for sw.js requests.

	The SW file lives at /assets/pos_next/pos/sw.js but needs to
	control scope '/' — browsers block this unless the server
	explicitly permits it via this header.
	"""
	import frappe

	path = frappe.request.path

	# Match any request that ends with /sw.js
	if path.endswith("/sw.js"):
		response.headers["Service-Worker-Allowed"] = "/"
		response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
		response.headers["Pragma"] = "no-cache"

	return response
