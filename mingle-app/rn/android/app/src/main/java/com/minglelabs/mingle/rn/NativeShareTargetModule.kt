package com.minglelabs.mingle.rn

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Rect
import android.media.ExifInterface
import android.net.Uri
import android.util.Base64
import androidx.core.app.Person
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import java.util.concurrent.Executors
import kotlin.math.max
import kotlin.math.min

/**
 * Share-sheet integration (the Android counterpart of iOS's
 * NativeShareTargetModule + MingleShare extension).
 *
 * - Publishes a conversation as a sharing shortcut, which is what makes it
 *   appear as a direct-share target in the system share sheet (and in the
 *   launcher's long-press menu, where it opens the room).
 * - Hands the app what another app shared to it (ACTION_SEND): one image, or
 *   text / a link. The room's composer shows it; nothing is sent until the
 *   user taps send.
 */
class NativeShareTargetModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  private val executor = Executors.newSingleThreadExecutor()

  override fun getName(): String = "NativeShareTargetModule"

  override fun invalidate() {
    executor.shutdown()
    super.invalidate()
  }

  @ReactMethod
  fun donateConversation(conversationId: String, displayName: String, avatarUrl: String?, promise: Promise) {
    val id = conversationId.trim()
    val name = displayName.trim()
    if (id.isEmpty() || name.isEmpty()) {
      promise.resolve(false)
      return
    }
    executor.execute {
      try {
        val context = reactApplicationContext
        val icon = loadAvatar(avatarUrl)?.let { IconCompat.createWithAdaptiveBitmap(it) }
          ?: IconCompat.createWithResource(context, R.mipmap.ic_launcher)
        val person = Person.Builder().setName(name).setKey(id).setIcon(icon).build()
        // The same intent a message notification opens, so a tap on the
        // shortcut in the launcher lands in the room.
        val openIntent = Intent(context, MainActivity::class.java).apply {
          action = "MINGLE_NOTIFICATION_OPEN"
          flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
          putExtra("type", "conversation_message")
          putExtra("conversationId", id)
        }
        val shortcut = ShortcutInfoCompat.Builder(context, id)
          .setShortLabel(name)
          .setLongLived(true)
          .setCategories(setOf(SHARE_TARGET_CATEGORY))
          .setPerson(person)
          .setIcon(icon)
          .setIntent(openIntent)
          .build()
        // Pushing also reports a use, so recently opened rooms rank first, and
        // it drops the least used shortcut when the launcher's limit is reached.
        promise.resolve(ShortcutManagerCompat.pushDynamicShortcut(context, shortcut))
      } catch (_: Exception) {
        promise.resolve(false)
      }
    }
  }

  /** The user left or deleted the conversation: stop suggesting it. */
  @ReactMethod
  fun removeConversation(conversationId: String, promise: Promise) {
    val id = conversationId.trim()
    if (id.isEmpty()) {
      promise.resolve(false)
      return
    }
    try {
      ShortcutManagerCompat.removeLongLivedShortcuts(reactApplicationContext, listOf(id))
      promise.resolve(true)
    } catch (_: Exception) {
      promise.resolve(false)
    }
  }

  /** Sign-out: another account must not see this account's conversations. */
  @ReactMethod
  fun removeAllConversations(promise: Promise) {
    synchronized(pendingLock) { pendingShare = null }
    try {
      val context = reactApplicationContext
      val ids = ShortcutManagerCompat.getShortcuts(
        context,
        ShortcutManagerCompat.FLAG_MATCH_DYNAMIC or ShortcutManagerCompat.FLAG_MATCH_CACHED,
      ).map { it.id }
      if (ids.isNotEmpty()) ShortcutManagerCompat.removeLongLivedShortcuts(context, ids)
      ShortcutManagerCompat.removeAllDynamicShortcuts(context)
      promise.resolve(true)
    } catch (_: Exception) {
      promise.resolve(false)
    }
  }

  /**
   * Returns what was shared to the app last, or null. It is removed, so it is
   * delivered once. Same shape as the iOS module.
   */
  @ReactMethod
  fun consumePendingShare(promise: Promise) {
    val share = synchronized(pendingLock) {
      val current = pendingShare
      pendingShare = null
      current
    }
    if (share == null || System.currentTimeMillis() - share.receivedAtMs > SHARE_LIFETIME_MS) {
      promise.resolve(null)
      return
    }
    executor.execute {
      try {
        val imageBase64 = share.imageUri?.let { readImageAsJpegBase64(it) }
        val text = share.text?.trim()?.takeIf { it.isNotEmpty() }
        if (imageBase64 == null && text == null) {
          promise.resolve(null)
          return@execute
        }
        val payload = Arguments.createMap()
        payload.putString("id", UUID.randomUUID().toString())
        share.conversationId?.let { payload.putString("conversationId", it) }
        text?.let { payload.putString("text", it) }
        if (imageBase64 != null) {
          payload.putString("imageBase64", imageBase64)
          payload.putString("imageMimeType", "image/jpeg")
        }
        promise.resolve(payload)
      } catch (_: Exception) {
        promise.resolve(null)
      }
    }
  }

  private fun loadAvatar(rawUrl: String?): Bitmap? {
    val url = rawUrl?.trim().orEmpty()
    if (!url.startsWith("https://") && !url.startsWith("http://")) return null
    var connection: HttpURLConnection? = null
    return try {
      connection = (URL(url).openConnection() as HttpURLConnection).apply {
        connectTimeout = AVATAR_TIMEOUT_MS
        readTimeout = AVATAR_TIMEOUT_MS
      }
      if (connection.responseCode !in 200..299) return null
      if (connection.contentType?.startsWith("image/") != true) return null
      val bytes = connection.inputStream.use { stream ->
        val buffer = ByteArrayOutputStream()
        val chunk = ByteArray(16 * 1024)
        while (true) {
          val read = stream.read(chunk)
          if (read < 0) break
          buffer.write(chunk, 0, read)
          if (buffer.size() > MAX_AVATAR_BYTES) return null
        }
        buffer.toByteArray()
      }
      val source = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: return null
      buildAdaptiveAvatar(source)
    } catch (_: Exception) {
      null
    } finally {
      connection?.disconnect()
    }
  }

  /**
   * An adaptive icon is masked to its inner two thirds, so the photo is drawn
   * (center-cropped to a square) into that inner area and the rest is filled.
   */
  private fun buildAdaptiveAvatar(source: Bitmap): Bitmap {
    val canvasSize = ADAPTIVE_ICON_SIZE_PX
    val inner = canvasSize * 2 / 3
    val offset = (canvasSize - inner) / 2
    val side = min(source.width, source.height)
    val sourceRect = Rect(
      (source.width - side) / 2,
      (source.height - side) / 2,
      (source.width + side) / 2,
      (source.height + side) / 2,
    )
    val result = Bitmap.createBitmap(canvasSize, canvasSize, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(result)
    canvas.drawColor(Color.rgb(229, 231, 235))
    canvas.drawBitmap(
      source,
      sourceRect,
      Rect(offset, offset, offset + inner, offset + inner),
      Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG),
    )
    return result
  }

  /** Decodes at reduced size, applies the EXIF rotation, and re-encodes as JPEG. */
  private fun readImageAsJpegBase64(uri: Uri): String? {
    val resolver = reactApplicationContext.contentResolver
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    // A bounds-only decode returns no bitmap; only the stream can be missing.
    val boundsStream = resolver.openInputStream(uri) ?: return null
    boundsStream.use { BitmapFactory.decodeStream(it, null, bounds) }
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null

    var sampleSize = 1
    while (max(bounds.outWidth, bounds.outHeight) / (sampleSize * 2) >= MAX_IMAGE_PIXEL_SIZE) {
      sampleSize *= 2
    }
    val options = BitmapFactory.Options().apply { inSampleSize = sampleSize }
    var bitmap = resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, options) }
      ?: return null

    val longestSide = max(bitmap.width, bitmap.height)
    val scale = if (longestSide > MAX_IMAGE_PIXEL_SIZE) MAX_IMAGE_PIXEL_SIZE.toFloat() / longestSide else 1f
    val rotation = try {
      resolver.openInputStream(uri)?.use { stream ->
        when (ExifInterface(stream).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
          ExifInterface.ORIENTATION_ROTATE_90 -> 90f
          ExifInterface.ORIENTATION_ROTATE_180 -> 180f
          ExifInterface.ORIENTATION_ROTATE_270 -> 270f
          else -> 0f
        }
      } ?: 0f
    } catch (_: Exception) {
      0f
    }
    if (scale != 1f || rotation != 0f) {
      val matrix = Matrix().apply {
        postScale(scale, scale)
        postRotate(rotation)
      }
      bitmap = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
    }

    val output = ByteArrayOutputStream()
    // A transparent PNG (e.g. a sticker) gets a white background, not black.
    val opaque = Bitmap.createBitmap(bitmap.width, bitmap.height, Bitmap.Config.ARGB_8888)
    Canvas(opaque).apply {
      drawColor(Color.WHITE)
      drawBitmap(bitmap, 0f, 0f, null)
    }
    opaque.compress(Bitmap.CompressFormat.JPEG, IMAGE_JPEG_QUALITY, output)
    return Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP)
  }

  private class PendingShare(
    val conversationId: String?,
    val text: String?,
    val imageUri: Uri?,
    val receivedAtMs: Long,
  )

  companion object {
    /** Must match res/xml/shortcuts.xml. */
    private const val SHARE_TARGET_CATEGORY = "com.minglelabs.mingle.rn.category.SHARE_TARGET"
    private const val MAX_IMAGE_PIXEL_SIZE = 2_048
    private const val IMAGE_JPEG_QUALITY = 85
    private const val MAX_AVATAR_BYTES = 2 * 1024 * 1024
    private const val AVATAR_TIMEOUT_MS = 8_000
    private const val ADAPTIVE_ICON_SIZE_PX = 432
    /** A share older than this is dropped, not delivered: the user has moved on. */
    private const val SHARE_LIFETIME_MS = 10 * 60 * 1000L
    private val CONVERSATION_ID_PATTERN = Regex("^[A-Za-z0-9_-]{1,128}$")

    private val pendingLock = Any()
    private var pendingShare: PendingShare? = null

    /**
     * Remembers what an ACTION_SEND intent carries until JS asks for it (on
     * start and each time the app comes to the foreground). The image is read
     * later, off the main thread; the activity that received the intent holds
     * the read permission for its URI.
     */
    fun recordIncomingShare(intent: Intent?) {
      if (intent == null || intent.action != Intent.ACTION_SEND) return
      val type = intent.type.orEmpty()
      @Suppress("DEPRECATION")
      val stream = intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)
      val imageUri = if (type.startsWith("image/")) stream else null
      val text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()
      if (imageUri == null && text.isNullOrBlank()) return

      // Set when the user tapped one of the app's sharing shortcuts.
      val conversationId = intent.getStringExtra(Intent.EXTRA_SHORTCUT_ID)
        ?.trim()
        ?.takeIf { CONVERSATION_ID_PATTERN.matches(it) }

      synchronized(pendingLock) {
        pendingShare = PendingShare(conversationId, text, imageUri, System.currentTimeMillis())
      }
    }
  }
}
