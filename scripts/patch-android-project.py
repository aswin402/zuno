#!/usr/bin/env python3
"""Patch the Tauri v2 generated Android project (`src-tauri/gen/android`) before Gradle builds:
1. AndroidManifest.xml: add INTERNET, READ_MEDIA_AUDIO, READ_EXTERNAL_STORAGE (<=API 32),
   WAKE_LOCK, REQUEST_INSTALL_PACKAGES, FOREGROUND_SERVICE, FOREGROUND_SERVICE_MEDIA_PLAYBACK,
   POST_NOTIFICATIONS, launcher icon attrs, usesCleartextTraffic, requestLegacyExternalStorage,
   FileProvider paths for in-app APK updates, and ZunoMediaService declaration.
2. App Icons: replace default Tauri launcher icons with Zuno's glossy obsidian + vector note
   adaptive icons (API 26+), Material You monochrome icon (API 33+), and multi-density legacy
   / round PNGs (`mipmap-mdpi` .. `mipmap-xxxhdpi`).
3. ZunoMediaService.kt: native Android MediaSession + Notification.MediaStyle foreground
   mediaPlayback service displaying Now Playing artwork, track metadata, interactive scrubber,
   and Previous / Play-Pause / Next controls in Android's top notification banner & lock screen.
4. MainActivity.kt: native WindowInsetsCompat safe-area bridge, system bar theme sync,
   native app WebView overscroll/zoom lock, runtime audio + notification permissions,
   native HTTP + APK download/verify/install bridge, and MediaSession action bridge.
5. app/build.gradle.kts: ensure `minSdk >= 24` for Oboe/AAudio and Tauri v2.
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
        (
            "android.permission.FOREGROUND_SERVICE",
            '<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />',
        ),
        (
            "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK",
            '<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />',
        ),
        (
            "android.permission.POST_NOTIFICATIONS",
            '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />',
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

    if "ZunoMediaService" not in xml and "</application>" in xml:
        service_block = (
            '\n        <service\n'
            '            android:name=".ZunoMediaService"\n'
            '            android:enabled="true"\n'
            '            android:exported="false"\n'
            '            android:foregroundServiceType="mediaPlayback" />\n    '
        )
        xml = xml.replace("</application>", service_block + "</application>", 1)

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

    # 3. Update values/ic_launcher_background.xml color to obsidian dark (#000000)
    values_dir = res_dir / "values"
    values_dir.mkdir(parents=True, exist_ok=True)
    (values_dir / "ic_launcher_background.xml").write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        "<resources>\n"
        '    <color name="ic_launcher_background">#000000</color>\n'
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


def write_media_service(activity_dir: pathlib.Path, package_name: str) -> None:
    service_path = activity_dir / "ZunoMediaService.kt"
    code = f"""package {package_name}

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.drawable.Icon
import android.media.MediaMetadata
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.os.Build
import android.os.IBinder
import android.util.Base64

class ZunoMediaService : Service() {{
  data class NowPlayingState(
    val title: String,
    val artist: String,
    val album: String,
    val isPlaying: Boolean,
    val isLive: Boolean,
    val positionMs: Long,
    val durationMs: Long,
    val artworkBase64: String,
  )

  companion object {{
    const val CHANNEL_ID = "zuno_media_playback"
    const val NOTIF_ID = 4021
    const val ACTION_UPDATE = "dev.zuno.player.ACTION_MEDIA_UPDATE"
    const val ACTION_CLEAR = "dev.zuno.player.ACTION_MEDIA_CLEAR"
    const val ACTION_PREV = "dev.zuno.player.ACTION_MEDIA_PREV"
    const val ACTION_TOGGLE = "dev.zuno.player.ACTION_MEDIA_TOGGLE"
    const val ACTION_NEXT = "dev.zuno.player.ACTION_MEDIA_NEXT"
    const val ACTION_STOP = "dev.zuno.player.ACTION_MEDIA_STOP"

    @Volatile var currentState: NowPlayingState? = null
    @Volatile var actionListener: ((String, Double) -> Unit)? = null

    fun sync(context: Context, state: NowPlayingState) {{
      currentState = state
      val intent = Intent(context, ZunoMediaService::class.java).apply {{
        action = ACTION_UPDATE
      }}
      try {{
        if (state.isPlaying && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {{
          context.startForegroundService(intent)
        }} else {{
          context.startService(intent)
        }}
      }} catch (_: Exception) {{
        try {{
          context.startService(intent)
        }} catch (_: Exception) {{
        }}
      }}
    }}

    fun clear(context: Context) {{
      currentState = null
      val intent = Intent(context, ZunoMediaService::class.java).apply {{
        action = ACTION_CLEAR
      }}
      try {{
        context.startService(intent)
      }} catch (_: Exception) {{
      }}
    }}
  }}

  private var mediaSession: MediaSession? = null
  private var cachedArtworkKey: String = ""
  private var cachedArtworkBitmap: Bitmap? = null
  private var fallbackArtworkBitmap: Bitmap? = null

  override fun onCreate() {{
    super.onCreate()
    ensureNotificationChannel()
    mediaSession = MediaSession(this, "ZunoMediaSession").apply {{
      setCallback(object : MediaSession.Callback() {{
        override fun onPlay() {{
          actionListener?.invoke("play", -1.0)
        }}

        override fun onPause() {{
          actionListener?.invoke("pause", -1.0)
        }}

        override fun onSkipToNext() {{
          actionListener?.invoke("next", -1.0)
        }}

        override fun onSkipToPrevious() {{
          actionListener?.invoke("previous", -1.0)
        }}

        override fun onStop() {{
          actionListener?.invoke("stop", -1.0)
        }}

        override fun onSeekTo(pos: Long) {{
          actionListener?.invoke("seek", (pos.coerceAtLeast(0L)) / 1000.0)
        }}
      }})
      isActive = true
    }}
  }}

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {{
    when (intent?.action) {{
      ACTION_PREV -> {{
        actionListener?.invoke("previous", -1.0)
      }}
      ACTION_TOGGLE -> {{
        actionListener?.invoke("toggle", -1.0)
      }}
      ACTION_NEXT -> {{
        actionListener?.invoke("next", -1.0)
      }}
      ACTION_STOP -> {{
        actionListener?.invoke("stop", -1.0)
        stopAndRemoveNotification()
      }}
      ACTION_CLEAR -> {{
        stopAndRemoveNotification()
      }}
      else -> {{
        val state = currentState
        if (state == null) {{
          stopAndRemoveNotification()
        }} else {{
          renderMediaNotification(state)
        }}
      }}
    }}
    return START_NOT_STICKY
  }}

  override fun onTaskRemoved(rootIntent: Intent?) {{
    actionListener?.invoke("stop", -1.0)
    stopAndRemoveNotification()
    super.onTaskRemoved(rootIntent)
  }}

  override fun onDestroy() {{
    mediaSession?.isActive = false
    mediaSession?.release()
    mediaSession = null
    super.onDestroy()
  }}

  private fun ensureNotificationChannel() {{
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {{
      val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (nm.getNotificationChannel(CHANNEL_ID) == null) {{
        val channel = NotificationChannel(
          CHANNEL_ID,
          "Now Playing",
          NotificationManager.IMPORTANCE_LOW,
        ).apply {{
          description = "Playback controls for currently playing music and FM radio"
          setShowBadge(false)
          setSound(null, null)
          lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        }}
        nm.createNotificationChannel(channel)
      }}
    }}
  }}

  private fun decodeArtwork(base64Data: String): Bitmap? {{
    val cleaned = base64Data.trim()
    if (cleaned.isNotEmpty()) {{
      if (cleaned == cachedArtworkKey && cachedArtworkBitmap != null) {{
        return cachedArtworkBitmap
      }}
      try {{
        val rawPart = cleaned.substringAfter("base64,", cleaned)
        val bytes = Base64.decode(rawPart, Base64.DEFAULT)
        val bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
        if (bmp != null) {{
          cachedArtworkKey = cleaned
          cachedArtworkBitmap = bmp
          return bmp
        }}
      }} catch (_: Exception) {{
      }}
    }}
    if (fallbackArtworkBitmap == null) {{
      fallbackArtworkBitmap = try {{
        BitmapFactory.decodeResource(resources, R.mipmap.ic_launcher)
      }} catch (_: Exception) {{
        null
      }}
    }}
    return fallbackArtworkBitmap
  }}

  private fun actionPendingIntent(action: String, reqCode: Int): PendingIntent {{
    val intent = Intent(this, ZunoMediaService::class.java).apply {{
      this.action = action
    }}
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    return PendingIntent.getService(this, reqCode, intent, flags)
  }}

  @Suppress("DEPRECATION")
  private fun createNotificationBuilder(): Notification.Builder {{
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {{
      Notification.Builder(this, CHANNEL_ID)
    }} else {{
      Notification.Builder(this)
    }}
  }}

  private fun renderMediaNotification(state: NowPlayingState) {{
    val session = mediaSession ?: return
    val art = decodeArtwork(state.artworkBase64)

    val metaBuilder = MediaMetadata.Builder()
      .putString(MediaMetadata.METADATA_KEY_TITLE, state.title.ifBlank {{ "Zuno" }})
      .putString(MediaMetadata.METADATA_KEY_ARTIST, state.artist.ifBlank {{ "Zuno" }})
      .putString(MediaMetadata.METADATA_KEY_ALBUM, state.album.ifBlank {{ "Zuno" }})
    if (!state.isLive && state.durationMs > 0L) {{
      metaBuilder.putLong(MediaMetadata.METADATA_KEY_DURATION, state.durationMs)
    }}
    if (art != null) {{
      metaBuilder.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, art)
    }}
    session.setMetadata(metaBuilder.build())

    var supportedActions = (
      PlaybackState.ACTION_PLAY or
        PlaybackState.ACTION_PAUSE or
        PlaybackState.ACTION_PLAY_PAUSE or
        PlaybackState.ACTION_SKIP_TO_NEXT or
        PlaybackState.ACTION_SKIP_TO_PREVIOUS or
        PlaybackState.ACTION_STOP
      )
    if (!state.isLive && state.durationMs > 0L) {{
      supportedActions = supportedActions or PlaybackState.ACTION_SEEK_TO
    }}
    val pbState = PlaybackState.Builder()
      .setActions(supportedActions)
      .setState(
        if (state.isPlaying) PlaybackState.STATE_PLAYING else PlaybackState.STATE_PAUSED,
        if (state.isLive) PlaybackState.PLAYBACK_POSITION_UNKNOWN else state.positionMs.coerceAtLeast(0L),
        if (state.isPlaying) 1.0f else 0.0f,
      )
      .build()
    session.setPlaybackState(pbState)
    session.isActive = true

    val openIntent = Intent(this, MainActivity::class.java).apply {{
      flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }}
    val contentPi = PendingIntent.getActivity(
      this,
      0,
      openIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    val prevAction = Notification.Action.Builder(
      Icon.createWithResource(this, android.R.drawable.ic_media_previous),
      "Previous",
      actionPendingIntent(ACTION_PREV, 101),
    ).build()
    val toggleAction = Notification.Action.Builder(
      Icon.createWithResource(
        this,
        if (state.isPlaying) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play,
      ),
      if (state.isPlaying) "Pause" else "Play",
      actionPendingIntent(ACTION_TOGGLE, 102),
    ).build()
    val nextAction = Notification.Action.Builder(
      Icon.createWithResource(this, android.R.drawable.ic_media_next),
      "Next",
      actionPendingIntent(ACTION_NEXT, 103),
    ).build()

    val style = Notification.MediaStyle()
      .setMediaSession(session.sessionToken)
      .setShowActionsInCompactView(0, 1, 2)

    val builder = createNotificationBuilder()
      .setSmallIcon(R.drawable.ic_launcher_monochrome)
      .setContentTitle(state.title.ifBlank {{ "Zuno" }})
      .setContentText(state.artist.ifBlank {{ "Zuno" }})
      .setSubText(if (state.isLive) "FM Radio · Live" else if (state.album.isNotBlank()) state.album else null)
      .setContentIntent(contentPi)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setOnlyAlertOnce(true)
      .setOngoing(state.isPlaying)
      .setShowWhen(false)
      .addAction(prevAction)
      .addAction(toggleAction)
      .addAction(nextAction)
      .setStyle(style)

    if (art != null) {{
      builder.setLargeIcon(art)
    }}

    val notif = builder.build()
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    try {{
      if (state.isPlaying) {{
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {{
          startForeground(NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
        }} else {{
          startForeground(NOTIF_ID, notif)
        }}
      }} else {{
        stopForeground(STOP_FOREGROUND_DETACH)
        nm.notify(NOTIF_ID, notif)
      }}
    }} catch (_: Exception) {{
      try {{
        nm.notify(NOTIF_ID, notif)
      }} catch (_: Exception) {{
      }}
    }}
  }}

  private fun stopAndRemoveNotification() {{
    try {{
      stopForeground(STOP_FOREGROUND_REMOVE)
    }} catch (_: Exception) {{
    }}
    try {{
      val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      nm.cancel(NOTIF_ID)
    }} catch (_: Exception) {{
    }}
    mediaSession?.isActive = false
    stopSelf()
  }}
}}
"""
    service_path.write_text(code, encoding="utf-8")
    print(f"[patch-android] Wrote {service_path}")


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

    write_media_service(activity_path.parent, package_name)

    patched = f"""package {package_name}

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
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
    fun updateMediaNotification(jsonPayload: String) {{
      try {{
        val obj = JSONObject(jsonPayload)
        val state = ZunoMediaService.NowPlayingState(
          title = obj.optString("title", "Zuno"),
          artist = obj.optString("artist", ""),
          album = obj.optString("album", ""),
          isPlaying = obj.optBoolean("isPlaying", false),
          isLive = obj.optBoolean("isLive", false),
          positionMs = obj.optLong("positionMs", 0L),
          durationMs = obj.optLong("durationMs", 0L),
          artworkBase64 = obj.optString("artworkBase64", ""),
        )
        runOnUiThread {{
          ZunoMediaService.sync(applicationContext, state)
        }}
      }} catch (_: Exception) {{
      }}
    }}

    @JavascriptInterface
    fun clearMediaNotification() {{
      runOnUiThread {{
        ZunoMediaService.clear(applicationContext)
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

  private fun dispatchMediaAction(action: String, seekSecs: Double) {{
    val wv = zunoWebView ?: return
    val obj = JSONObject().apply {{
      put("action", action)
      if (seekSecs >= 0.0) put("seekSecs", seekSecs)
    }}
    val js = "window.dispatchEvent(new CustomEvent('zuno:android-media-action',{{detail:" + obj.toString() + "}}));"
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
    requestStartupPermissionsIfNeeded()
  }}

  override fun onDestroy() {{
    if (isFinishing) {{
      ZunoMediaService.actionListener = null
      ZunoMediaService.clear(applicationContext)
    }}
    super.onDestroy()
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
    webView.overScrollMode = View.OVER_SCROLL_NEVER
    webView.isHorizontalScrollBarEnabled = false
    webView.settings.setSupportZoom(false)
    webView.settings.builtInZoomControls = false
    webView.settings.displayZoomControls = false
    webView.settings.useWideViewPort = false
    webView.settings.loadWithOverviewMode = false
    webView.settings.mediaPlaybackRequiresUserGesture = false
    webView.settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
    webView.addJavascriptInterface(ZunoAndroidBridge(), "__ZUNO_ANDROID__")
    ZunoMediaService.actionListener = {{ action, seekSecs ->
      dispatchMediaAction(action, seekSecs)
    }}
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

  private fun requestStartupPermissionsIfNeeded() {{
    val missing = mutableListOf<String>()
    val audioPerm = audioPermission()
    if (ContextCompat.checkSelfPermission(this, audioPerm) != PackageManager.PERMISSION_GRANTED) {{
      missing.add(audioPerm)
    }}
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {{
      val notifPerm = Manifest.permission.POST_NOTIFICATIONS
      if (ContextCompat.checkSelfPermission(this, notifPerm) != PackageManager.PERMISSION_GRANTED) {{
        missing.add(notifPerm)
      }}
    }}
    if (missing.isNotEmpty()) {{
      ActivityCompat.requestPermissions(this, missing.toTypedArray(), 1001)
    }}
  }}

  override fun onRequestPermissionsResult(
    requestCode: Int,
    permissions: Array<out String>,
    grantResults: IntArray,
  ) {{
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    if (requestCode == 1001) {{
      val audioPerm = audioPermission()
      val audioIdx = permissions.indexOf(audioPerm)
      if (
        audioIdx >= 0 &&
        audioIdx < grantResults.size &&
        grantResults[audioIdx] == PackageManager.PERMISSION_GRANTED
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
