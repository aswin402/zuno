#!/usr/bin/env python3
"""Patch the Tauri v2 generated Android project (`src-tauri/gen/android`) before Gradle builds:
1. AndroidManifest.xml: add INTERNET, READ_MEDIA_AUDIO, READ_EXTERNAL_STORAGE (<=API 32),
   WAKE_LOCK, REQUEST_INSTALL_PACKAGES, launcher icon attrs, usesCleartextTraffic,
   requestLegacyExternalStorage, and FileProvider paths for in-app APK updates.
2. App Icons: replace default Tauri launcher icons with Zuno's glossy obsidian + vector note
   adaptive icons (API 26+), Material You monochrome icon (API 33+), and multi-density legacy
   / round PNGs (`mipmap-mdpi` .. `mipmap-xxxhdpi`).
3. MainActivity.kt: native WindowInsetsCompat safe-area bridge, system bar theme sync,
   runtime audio permission, WebView mixed content/autoplay, and native HTTP + APK download,
   SHA-256 verification, and Package Installer launch bridge.
4. app/build.gradle.kts: ensure `minSdk >= 24` for Oboe/AAudio and Tauri v2.
"""

from __future__ import annotations

import pathlib
import re
import shutil
import sys

ROOT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "src-tauri/gen/android")
REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
MANIFEST_PATH = ROOT / "app" / "src" / "main" / "AndroidManifest.xml"
RES_DIR = ROOT / "app" / "src" / "main" / "res"
GRADLE_PATH = ROOT / "app" / "build.gradle.kts"


def ensure_file_provider_paths(res_dir: pathlib.Path, xml_name: str) -> None:
    xml_dir = res_dir / "xml"
    xml_dir.mkdir(parents=True, exist_ok=True)
    paths_file = xml_dir / f"{xml_name}.xml"

    cache_entry = '    <cache-path name="zuno_updates" path="updates/" />'
    ext_cache_entry = '    <external-cache-path name="zuno_ext_updates" path="updates/" />'

    if paths_file.is_file():
        content = paths_file.read_text(encoding="utf-8")
        additions = []
        if 'name="zuno_updates"' not in content:
            additions.append(cache_entry)
        if 'name="zuno_ext_updates"' not in content:
            additions.append(ext_cache_entry)
        if additions:
            if "</paths>" in content:
                content = content.replace("</paths>", "\n".join(additions) + "\n</paths>", 1)
            else:
                content = (
                    '<?xml version="1.0" encoding="utf-8"?>\n'
                    '<paths xmlns:android="http://schemas.android.com/apk/res/android">\n'
                    f"{cache_entry}\n"
                    f"{ext_cache_entry}\n"
                    "</paths>\n"
                )
            paths_file.write_text(content, encoding="utf-8")
            print(f"[patch-android] Updated FileProvider paths in {paths_file}")
    else:
        paths_file.write_text(
            '<?xml version="1.0" encoding="utf-8"?>\n'
            '<paths xmlns:android="http://schemas.android.com/apk/res/android">\n'
            f"{cache_entry}\n"
            f"{ext_cache_entry}\n"
            "</paths>\n",
            encoding="utf-8",
        )
        print(f"[patch-android] Created FileProvider paths at {paths_file}")


def patch_manifest(path: pathlib.Path, res_dir: pathlib.Path) -> str:
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
        (
            "android.permission.REQUEST_INSTALL_PACKAGES",
            '<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />',
        ),
    ]

    missing_tags = [tag for name, tag in permissions if name not in xml]
    if missing_tags:
        insert_block = "\n    ".join(missing_tags) + "\n\n    "
        if "<application" in xml:
            xml = xml.replace("<application", insert_block + "<application", 1)
        else:
            raise RuntimeError("Could not find <application> tag in AndroidManifest.xml")

    def set_app_attr(src: str, attr: str, value: str) -> str:
        app_match = re.search(r"<application\b[^>]*>", src, re.DOTALL)
        if not app_match:
            return src
        tag = app_match.group(0)
        attr_re = re.compile(rf'({re.escape(attr)}\s*=\s*")[^"]*(")')
        if attr_re.search(tag):
            new_tag = attr_re.sub(rf"\g<1>{value}\2", tag, count=1)
        else:
            new_tag = tag[:-1] + f'\n        {attr}="{value}">'
        return src[: app_match.start()] + new_tag + src[app_match.end() :]

    xml = set_app_attr(xml, "android:icon", "@mipmap/ic_launcher")
    xml = set_app_attr(xml, "android:roundIcon", "@mipmap/ic_launcher_round")
    xml = set_app_attr(xml, "android:usesCleartextTraffic", "true")
    xml = set_app_attr(xml, "android:requestLegacyExternalStorage", "true")

    authority_template = "${applicationId}.fileprovider"
    paths_xml_name = "file_paths"

    fp_match = re.search(
        r'<provider\b[^>]*android:name="androidx\.core\.content\.FileProvider"[^>]*>.*?</provider>',
        xml,
        re.DOTALL,
    )
    if fp_match:
        fp_block = fp_match.group(0)
        auth_m = re.search(r'android:authorities="([^"]+)"', fp_block)
        if auth_m:
            authority_template = auth_m.group(1)
        res_m = re.search(r'android:resource="@xml/([A-Za-z0-9_]+)"', fp_block)
        if res_m:
            paths_xml_name = res_m.group(1)
    else:
        provider_block = (
            '\n        <provider\n'
            '            android:name="androidx.core.content.FileProvider"\n'
            '            android:authorities="${applicationId}.fileprovider"\n'
            '            android:exported="false"\n'
            '            android:grantUriPermissions="true">\n'
            '            <meta-data\n'
            '                android:name="android.support.FILE_PROVIDER_PATHS"\n'
            '                android:resource="@xml/file_paths" />\n'
            '        </provider>\n    '
        )
        if "</application>" in xml:
            xml = xml.replace("</application>", provider_block + "</application>", 1)

    ensure_file_provider_paths(res_dir, paths_xml_name)

    path.write_text(xml, encoding="utf-8")
    print(f"[patch-android] Patched {path} (fileProvider={authority_template}, xml=@xml/{paths_xml_name})")
    return authority_template


def patch_icons(res_dir: pathlib.Path) -> None:
    src_android_icons = REPO_ROOT / "src-tauri" / "icons" / "android"
    svg_path = REPO_ROOT / "public" / "zuno-logo.svg"

    if not src_android_icons.is_dir():
        raise FileNotFoundError(f"Pre-rendered Android icons missing at {src_android_icons}")
    if not svg_path.is_file():
        raise FileNotFoundError(f"Zuno logo SVG missing at {svg_path}")

    svg_text = svg_path.read_text(encoding="utf-8")
    path_match = re.search(r'<path[^>]*d="([^"]+)"', svg_text)
    if not path_match:
        raise RuntimeError(f"Could not extract musical note path from {svg_path}")
    note_path_data = path_match.group(1)

    res_dir.mkdir(parents=True, exist_ok=True)

    # 1. Remove any stale default Tauri launcher vector/xml files so Zuno icons always take precedence
    for drawable_dir in res_dir.glob("drawable*"):
        if drawable_dir.is_dir():
            for stale in (
                list(drawable_dir.glob("ic_launcher_foreground.*"))
                + list(drawable_dir.glob("ic_launcher_background.*"))
                + list(drawable_dir.glob("ic_launcher_monochrome.*"))
            ):
                stale.unlink(missing_ok=True)

    for anydpi_dir in res_dir.glob("mipmap-anydpi*"):
        if anydpi_dir.is_dir():
            for stale in anydpi_dir.glob("ic_launcher*.xml"):
                stale.unlink(missing_ok=True)

    # 2. Copy crisp multi-density raster launcher PNGs (legacy, round, and fallback foreground)
    copied = 0
    for density_dir in sorted(src_android_icons.glob("mipmap-*")):
        if not density_dir.is_dir():
            continue
        target_dir = res_dir / density_dir.name
        target_dir.mkdir(parents=True, exist_ok=True)
        for png in sorted(density_dir.glob("*.png")):
            shutil.copy2(png, target_dir / png.name)
            copied += 1

    # 3. Update values/ic_launcher_background.xml color to obsidian dark (#09090B)
    values_dir = res_dir / "values"
    values_dir.mkdir(parents=True, exist_ok=True)
    (values_dir / "ic_launcher_background.xml").write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        "<resources>\n"
        '    <color name="ic_launcher_background">#09090B</color>\n'
        "</resources>\n",
        encoding="utf-8",
    )

    # 4. Write glossy obsidian adaptive background & crisp vector musical note foreground/monochrome
    drawable_dir = res_dir / "drawable"
    drawable_dir.mkdir(parents=True, exist_ok=True)

    (drawable_dir / "ic_launcher_background.xml").write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">\n'
        "    <gradient\n"
        '        android:type="linear"\n'
        '        android:angle="270"\n'
        '        android:startColor="#4A4A4F"\n'
        '        android:centerColor="#101012"\n'
        '        android:centerY="0.34"\n'
        '        android:endColor="#000000" />\n'
        "</shape>\n",
        encoding="utf-8",
    )

    vector_note_xml = (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<vector xmlns:android="http://schemas.android.com/apk/res/android"\n'
        '    android:width="108dp"\n'
        '    android:height="108dp"\n'
        '    android:viewportWidth="108"\n'
        '    android:viewportHeight="108">\n'
        "    <group\n"
        '        android:translateX="8.5"\n'
        '        android:translateY="11.44"\n'
        '        android:scaleX="0.1694"\n'
        '        android:scaleY="0.1694">\n'
        "        <path\n"
        '            android:fillColor="#FAFAFA"\n'
        f'            android:pathData="{note_path_data}" />\n'
        "    </group>\n"
        "</vector>\n"
    )
    (drawable_dir / "ic_launcher_foreground.xml").write_text(vector_note_xml, encoding="utf-8")
    (drawable_dir / "ic_launcher_monochrome.xml").write_text(vector_note_xml, encoding="utf-8")

    # 5. Write Android 8.0+ adaptive icon definitions (with Android 13+ monochrome support)
    anydpi_v26 = res_dir / "mipmap-anydpi-v26"
    anydpi_v26.mkdir(parents=True, exist_ok=True)
    adaptive_xml = (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
        '    <background android:drawable="@drawable/ic_launcher_background" />\n'
        '    <foreground android:drawable="@drawable/ic_launcher_foreground" />\n'
        '    <monochrome android:drawable="@drawable/ic_launcher_monochrome" />\n'
        "</adaptive-icon>\n"
    )
    (anydpi_v26 / "ic_launcher.xml").write_text(adaptive_xml, encoding="utf-8")
    (anydpi_v26 / "ic_launcher_round.xml").write_text(adaptive_xml, encoding="utf-8")

    print(f"[patch-android] Installed Zuno launcher & adaptive icons ({copied} PNGs + vector drawables)")


def patch_main_activity(root: pathlib.Path, authority_template: str) -> None:
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
    authority_kotlin = authority_template.replace("${applicationId}", "${packageName}")

    patched = f"""package {package_name}

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebSettings
import android.webkit.WebView
{edge_import}import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.ceil

class MainActivity : TauriActivity() {{
  private var zunoWebView: WebView? = null
  @Volatile private var insetTopCss: Int = 0
  @Volatile private var insetBottomCss: Int = 0
  @Volatile private var insetLeftCss: Int = 0
  @Volatile private var insetRightCss: Int = 0
  @Volatile private var lastDownloadedApkPath: String? = null
  private val apkDownloading = AtomicBoolean(false)

  inner class ZunoAndroidBridge {{
    @JavascriptInterface
    fun getInsetsJson(): String {{
      val top = if (insetTopCss > 0) insetTopCss else fallbackStatusBarCss()
      return "{{\\"top\\":" + top +
        ",\\"bottom\\":" + insetBottomCss +
        ",\\"left\\":" + insetLeftCss +
        ",\\"right\\":" + insetRightCss + "}}"
    }}

    @JavascriptInterface
    fun setSystemBarsLight(isLight: Boolean) {{
      runOnUiThread {{
        val controller = WindowInsetsControllerCompat(window, window.decorView)
        controller.isAppearanceLightStatusBars = isLight
        controller.isAppearanceLightNavigationBars = isLight
      }}
    }}

    @JavascriptInterface
    fun openExternalUrl(url: String): Boolean {{
      val trimmed = url.trim()
      if (!trimmed.startsWith("https://") && !trimmed.startsWith("http://")) {{
        return false
      }}
      return try {{
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(trimmed)).apply {{
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }}
        runOnUiThread {{
          try {{
            startActivity(intent)
          }} catch (_: Exception) {{
          }}
        }}
        true
      }} catch (_: Exception) {{
        false
      }}
    }}

    @JavascriptInterface
    fun fetchUrlAsync(reqId: String, url: String) {{
      Thread {{
        try {{
          val conn = openHttpWithRedirects(url, "application/vnd.github+json, application/json", 8_000, 12_000)
          try {{
            val code = conn.responseCode
            if (code !in 200..299) {{
              deliverFetchResult(reqId, false, "HTTP " + code)
              return@Thread
            }}
            val text = conn.inputStream.bufferedReader(Charsets.UTF_8).use {{ reader ->
              val buf = CharArray(8192)
              val sb = StringBuilder()
              var total = 0
              while (true) {{
                val n = reader.read(buf)
                if (n <= 0) break
                total += n
                if (total > 2_000_000) break
                sb.append(buf, 0, n)
              }}
              sb.toString()
            }}
            deliverFetchResult(reqId, true, text)
          }} finally {{
            conn.disconnect()
          }}
        }} catch (e: Exception) {{
          deliverFetchResult(reqId, false, e.message ?: "Network request failed")
        }}
      }}.apply {{
        isDaemon = true
        start()
      }}
    }}

    @JavascriptInterface
    fun downloadAndInstallApk(url: String, expectedSha256: String, expectedSize: Long, version: String) {{
      if (!apkDownloading.compareAndSet(false, true)) {{
        return
      }}
      val cleanVer = version.trim().removePrefix("v").replace(Regex("[^A-Za-z0-9._-]"), "")
      val safeVer = if (cleanVer.isNotEmpty()) cleanVer else "latest"

      Thread {{
        var partFile: File? = null
        try {{
          emitUpdateProgress("downloading", "Connecting to GitHub Releases…", 15, "")
          val updatesDir = File(cacheDir, "updates")
          if (!updatesDir.exists()) {{
            updatesDir.mkdirs()
          }}
          val finalFile = File(updatesDir, "zuno-v" + safeVer + ".apk")
          val tmpFile = File(updatesDir, "zuno-v" + safeVer + ".apk.part")
          partFile = tmpFile
          if (tmpFile.exists()) {{
            tmpFile.delete()
          }}

          val conn = openHttpWithRedirects(url, "*/*", 15_000, 60_000)
          try {{
            val code = conn.responseCode
            if (code !in 200..299) {{
              throw RuntimeException("Download failed (HTTP " + code + ")")
            }}
            val headerLen = conn.contentLengthLong
            val totalBytes = if (headerLen > 0L) headerLen else expectedSize
            val digest = MessageDigest.getInstance("SHA-256")
            var downloaded = 0L
            var lastEmitMs = 0L

            BufferedInputStream(conn.inputStream, 16_384).use {{ input ->
              FileOutputStream(tmpFile).use {{ output ->
                val buf = ByteArray(16_384)
                while (true) {{
                  val n = input.read(buf)
                  if (n <= 0) break
                  output.write(buf, 0, n)
                  digest.update(buf, 0, n)
                  downloaded += n.toLong()
                  val now = System.currentTimeMillis()
                  if (now - lastEmitMs >= 120L) {{
                    lastEmitMs = now
                    val pct = if (totalBytes > 0L) {{
                      (18 + ((downloaded * 66L) / totalBytes).toInt()).coerceIn(18, 84)
                    }} else {{
                      48
                    }}
                    val dlMb = String.format(java.util.Locale.US, "%.1f", downloaded / 1_048_576.0)
                    val msg = if (totalBytes > 0L) {{
                      val totMb = String.format(java.util.Locale.US, "%.1f", totalBytes / 1_048_576.0)
                      "Downloading Zuno v" + safeVer + " (" + dlMb + " / " + totMb + " MB)…"
                    }} else {{
                      "Downloading Zuno v" + safeVer + " (" + dlMb + " MB)…"
                    }}
                    emitUpdateProgress("downloading", msg, pct, "")
                  }}
                }}
                output.flush()
              }}
            }}

            if (downloaded <= 0L) {{
              throw RuntimeException("Downloaded APK is empty")
            }}

            emitUpdateProgress("verifying", "Verifying SHA-256 checksum…", 88, "")
            val actualSha = digest.digest().joinToString("") {{ b ->
              String.format(java.util.Locale.US, "%02x", b.toInt() and 0xff)
            }}
            val wantedSha = expectedSha256.trim().lowercase(java.util.Locale.US)
            if (wantedSha.isNotEmpty() && actualSha != wantedSha) {{
              tmpFile.delete()
              throw RuntimeException("SHA-256 checksum mismatch — download may be corrupted")
            }}
          }} finally {{
            conn.disconnect()
          }}

          // Clean older cached APKs before moving the verified APK into place
          updatesDir.listFiles()?.forEach {{ f ->
            if (f.name.endsWith(".apk") && f.absolutePath != finalFile.absolutePath) {{
              f.delete()
            }}
          }}
          if (finalFile.exists()) {{
            finalFile.delete()
          }}
          if (!tmpFile.renameTo(finalFile)) {{
            tmpFile.copyTo(finalFile, overwrite = true)
            tmpFile.delete()
          }}
          partFile = null
          lastDownloadedApkPath = finalFile.absolutePath

          emitUpdateProgress("installing", "Opening Android package installer…", 95, finalFile.absolutePath)
          val launched = launchApkInstaller(finalFile)
          if (!launched) {{
            throw RuntimeException("Could not open Android installer — use Download in Browser instead")
          }}
          emitUpdateProgress("done", "Android installer opened for Zuno v" + safeVer, 100, finalFile.absolutePath)
        }} catch (e: Exception) {{
          partFile?.delete()
          emitUpdateProgress("error", e.message ?: "Failed to download APK update", 0, "")
        }} finally {{
          apkDownloading.set(false)
        }}
      }}.apply {{
        isDaemon = true
        start()
      }}
    }}

    @JavascriptInterface
    fun reopenPendingApkInstaller(): Boolean {{
      val path = lastDownloadedApkPath ?: return false
      val file = File(path)
      if (!file.isFile) return false
      return launchApkInstaller(file)
    }}
  }}

  private fun openHttpWithRedirects(
    rawUrl: String,
    accept: String,
    connectTimeoutMs: Int,
    readTimeoutMs: Int,
  ): HttpURLConnection {{
    var currentUrl = URL(rawUrl)
    for (hop in 0 until 6) {{
      val conn = (currentUrl.openConnection() as HttpURLConnection).apply {{
        instanceFollowRedirects = false
        connectTimeout = connectTimeoutMs
        readTimeout = readTimeoutMs
        requestMethod = "GET"
        setRequestProperty("Accept", accept)
        setRequestProperty("User-Agent", "Zuno-Android")
      }}
      val code = conn.responseCode
      if (code in listOf(301, 302, 303, 307, 308)) {{
        val loc = conn.getHeaderField("Location")
        conn.disconnect()
        if (loc.isNullOrBlank()) {{
          throw RuntimeException("Redirect without Location header (HTTP " + code + ")")
        }}
        currentUrl = URL(currentUrl, loc)
        continue
      }}
      return conn
    }}
    throw RuntimeException("Too many HTTP redirects")
  }}

  private fun deliverFetchResult(reqId: String, ok: Boolean, payload: String) {{
    val wv = zunoWebView ?: return
    val js = (
      "window.__zunoAndroidFetchCb&&window.__zunoAndroidFetchCb(" +
        JSONObject.quote(reqId) + "," +
        (if (ok) "true" else "false") + "," +
        JSONObject.quote(payload) + ");"
    )
    wv.post {{ wv.evaluateJavascript(js, null) }}
  }}

  private fun emitUpdateProgress(stage: String, message: String, percent: Int, apkPath: String) {{
    val wv = zunoWebView ?: return
    val obj = JSONObject().apply {{
      put("stage", stage)
      put("message", message)
      put("percent", percent)
      if (apkPath.isNotEmpty()) put("apkPath", apkPath)
    }}
    val js = "window.__zunoAndroidUpdateProgress&&window.__zunoAndroidUpdateProgress(" + obj.toString() + ");"
    wv.post {{ wv.evaluateJavascript(js, null) }}
  }}

  private fun launchApkInstaller(apkFile: File): Boolean {{
    return try {{
      val authority = "{authority_kotlin}"
      val apkUri = FileProvider.getUriForFile(this, authority, apkFile)
      val intent = Intent(Intent.ACTION_VIEW).apply {{
        setDataAndType(apkUri, "application/vnd.android.package-archive")
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }}
      runOnUiThread {{
        try {{
          startActivity(intent)
        }} catch (_: Exception) {{
        }}
      }}
      true
    }} catch (_: Exception) {{
      false
    }}
  }}

  override fun onCreate(savedInstanceState: Bundle?) {{
{edge_call}    super.onCreate(savedInstanceState)
    insetTopCss = fallbackStatusBarCss()
    installWindowInsetsListener()
    requestAudioPermissionIfNeeded()
  }}

  private fun pxToCss(px: Int): Int {{
    val density = resources.displayMetrics.density
    if (density <= 0f) return px
    return ceil(px / density).toInt().coerceAtLeast(0)
  }}

  private fun fallbackStatusBarCss(): Int {{
    val resId = resources.getIdentifier("status_bar_height", "dimen", "android")
    if (resId > 0) {{
      val px = resources.getDimensionPixelSize(resId)
      if (px > 0) return pxToCss(px)
    }}
    return 32
  }}

  private fun updateFromInsets(insets: WindowInsetsCompat) {{
    val bars = insets.getInsets(
      WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout(),
    )
    val measuredTop = pxToCss(bars.top)
    insetTopCss = if (measuredTop > 0) measuredTop else fallbackStatusBarCss()
    insetBottomCss = pxToCss(bars.bottom)
    insetLeftCss = pxToCss(bars.left)
    insetRightCss = pxToCss(bars.right)
    pushInsetsToWebView()
  }}

  private fun pushInsetsToWebView() {{
    val wv = zunoWebView ?: return
    val top = if (insetTopCss > 0) insetTopCss else fallbackStatusBarCss()
    val bottom = insetBottomCss
    val left = insetLeftCss
    val right = insetRightCss
    val js = (
      "(function(){{" +
        "var r=document.documentElement.style;" +
        "r.setProperty('--zuno-inset-top','" + top + "px');" +
        "r.setProperty('--zuno-inset-bottom','" + bottom + "px');" +
        "r.setProperty('--zuno-inset-left','" + left + "px');" +
        "r.setProperty('--zuno-inset-right','" + right + "px');" +
      "}})();"
    )
    wv.post {{ wv.evaluateJavascript(js, null) }}
  }}

  private fun installWindowInsetsListener() {{
    ViewCompat.setOnApplyWindowInsetsListener(window.decorView) {{ view, insets ->
      updateFromInsets(insets)
      ViewCompat.onApplyWindowInsets(view, insets)
    }}
  }}

  override fun onWebViewCreate(webView: WebView) {{
    super.onWebViewCreate(webView)
    zunoWebView = webView
    webView.settings.mediaPlaybackRequiresUserGesture = false
    webView.settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
    webView.addJavascriptInterface(ZunoAndroidBridge(), "__ZUNO_ANDROID__")
    window.decorView.post {{
      ViewCompat.getRootWindowInsets(window.decorView)?.let {{ updateFromInsets(it) }}
      ViewCompat.requestApplyInsets(window.decorView)
      pushInsetsToWebView()
    }}
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
    authority_template = patch_manifest(MANIFEST_PATH, RES_DIR)
    patch_icons(RES_DIR)
    patch_main_activity(ROOT, authority_template)
    patch_gradle(GRADLE_PATH)


if __name__ == "__main__":
    main()
