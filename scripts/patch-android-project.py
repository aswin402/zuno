#!/usr/bin/env python3
"""Patch the Tauri v2 generated Android project (`src-tauri/gen/android`) before Gradle builds:
1. AndroidManifest.xml: add INTERNET, READ_MEDIA_AUDIO, READ_EXTERNAL_STORAGE (<=API 32),
   WAKE_LOCK, usesCleartextTraffic (for HTTP Online FM streams), and requestLegacyExternalStorage.
2. MainActivity.kt: request runtime audio storage permission on launch, enable WebView mixed
   content & autoplay for Online FM streams, and emit `zuno:android-permission-granted` once
   granted so Zuno automatically links and rescans phone music folders.
3. app/build.gradle.kts: ensure `minSdk >= 24` for Oboe/AAudio and Tauri v2.
"""

from __future__ import annotations

import pathlib
import re
import sys

ROOT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "src-tauri/gen/android")
MANIFEST_PATH = ROOT / "app" / "src" / "main" / "AndroidManifest.xml"
GRADLE_PATH = ROOT / "app" / "build.gradle.kts"


def patch_manifest(path: pathlib.Path) -> None:
    if not path.is_file():
        raise FileNotFoundError(f"AndroidManifest.xml not found at {path}")

    xml = path.read_text(encoding="utf-8")

    permissions = [
        ("android.permission.INTERNET", '<uses-permission android:name="android.permission.INTERNET" />'),
        ("android.permission.READ_MEDIA_AUDIO", '<uses-permission android:name="android.permission.READ_MEDIA_AUDIO" />'),
        (
            "android.permission.READ_EXTERNAL_STORAGE",
            '<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />',
        ),
        ("android.permission.WAKE_LOCK", '<uses-permission android:name="android.permission.WAKE_LOCK" />'),
    ]

    missing_tags = [tag for name, tag in permissions if name not in xml]
    if missing_tags:
        insert_block = "\n    ".join(missing_tags) + "\n\n    "
        if "<application" in xml:
            xml = xml.replace("<application", insert_block + "<application", 1)
        else:
            raise RuntimeError("Could not find <application> tag in AndroidManifest.xml")

    def ensure_app_attr(src: str, attr: str, value: str) -> str:
        if f"{attr}=" in src:
            return src
        return re.sub(
            r"(<application\b[^>]*)(>)",
            rf'\1\n        {attr}="{value}"\2',
            src,
            count=1,
        )

    xml = ensure_app_attr(xml, "android:usesCleartextTraffic", "true")
    xml = ensure_app_attr(xml, "android:requestLegacyExternalStorage", "true")

    path.write_text(xml, encoding="utf-8")
    print(f"[patch-android] Patched {path}")


def patch_main_activity(root: pathlib.Path) -> None:
    candidates = list((root / "app" / "src" / "main").rglob("MainActivity.kt"))
    if not candidates:
        raise FileNotFoundError(f"MainActivity.kt not found under {root / 'app/src/main'}")

    activity_path = candidates[0]
    original = activity_path.read_text(encoding="utf-8")

    pkg_match = re.search(r"^\s*package\s+([A-Za-z0-9_.]+)", original, re.MULTILINE)
    package_name = pkg_match.group(1) if pkg_match else "dev.zuno.player"
    has_edge_to_edge = "enableEdgeToEdge" in original

    edge_import = "import androidx.activity.enableEdgeToEdge\n" if has_edge_to_edge else ""
    edge_call = "    enableEdgeToEdge()\n" if has_edge_to_edge else ""

    patched = f"""package {package_name}

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.webkit.WebSettings
import android.webkit.WebView
{edge_import}import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

class MainActivity : TauriActivity() {{
  private var zunoWebView: WebView? = null

  override fun onCreate(savedInstanceState: Bundle?) {{
{edge_call}    super.onCreate(savedInstanceState)
    requestAudioPermissionIfNeeded()
  }}

  override fun onWebViewCreate(webView: WebView) {{
    super.onWebViewCreate(webView)
    zunoWebView = webView
    webView.settings.mediaPlaybackRequiresUserGesture = false
    webView.settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
  }}

  private fun audioPermission(): String {{
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {{
      Manifest.permission.READ_MEDIA_AUDIO
    }} else {{
      Manifest.permission.READ_EXTERNAL_STORAGE
    }}
  }}

  private fun requestAudioPermissionIfNeeded() {{
    val perm = audioPermission()
    if (ContextCompat.checkSelfPermission(this, perm) != PackageManager.PERMISSION_GRANTED) {{
      ActivityCompat.requestPermissions(this, arrayOf(perm), 1001)
    }}
  }}

  override fun onRequestPermissionsResult(
    requestCode: Int,
    permissions: Array<out String>,
    grantResults: IntArray,
  ) {{
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    if (
      requestCode == 1001 &&
      grantResults.isNotEmpty() &&
      grantResults[0] == PackageManager.PERMISSION_GRANTED
    ) {{
      zunoWebView?.post {{
        zunoWebView?.evaluateJavascript(
          "window.dispatchEvent(new Event('zuno:android-permission-granted'));",
          null,
        )
      }}
    }}
  }}
}}
"""
    activity_path.write_text(patched, encoding="utf-8")
    print(f"[patch-android] Patched {activity_path} (package={package_name})")


def patch_gradle(path: pathlib.Path) -> None:
    if not path.is_file():
        print(f"[patch-android] Skipping missing {path}")
        return

    text = path.read_text(encoding="utf-8")
    # Ensure minSdk is at least 24 for Oboe/AAudio and Tauri v2
    def bump_min_sdk(m: re.Match[str]) -> str:
        val = int(m.group(2))
        return f"{m.group(1)}{max(val, 24)}"

    updated = re.sub(r"(minSdk\s*=\s*)(\d+)", bump_min_sdk, text)
    if updated != text:
        path.write_text(updated, encoding="utf-8")
        print(f"[patch-android] Updated minSdk in {path}")
    else:
        print(f"[patch-android] Verified {path}")


def main() -> None:
    patch_manifest(MANIFEST_PATH)
    patch_main_activity(ROOT)
    patch_gradle(GRADLE_PATH)


if __name__ == "__main__":
    main()
