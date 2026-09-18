package com.minglelabs.mingle.rn

import android.Manifest
import android.content.ContentValues
import android.content.pm.PackageManager
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class NativeQrImageModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "NativeQrImageModule"

  @ReactMethod
  fun savePng(dataUrl: String, fileName: String, promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q
      && reactApplicationContext.checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE)
        != PackageManager.PERMISSION_GRANTED
    ) {
      promise.reject("native_qr_photo_permission_required", "Storage permission is required.")
      return
    }

    var imageUri: android.net.Uri? = null
    try {
      val encodedImage = dataUrl.substringAfter("base64,", "")
      if (encodedImage.isBlank()) {
        promise.reject("native_qr_invalid_image", "Could not decode the QR image.")
        return
      }

      val imageBytes = Base64.decode(encodedImage, Base64.DEFAULT)
      if (imageBytes.isEmpty()) {
        promise.reject("native_qr_invalid_image", "Could not decode the QR image.")
        return
      }

      val displayName = normalizeFileName(fileName)
      val values = ContentValues().apply {
        put(MediaStore.Images.Media.DISPLAY_NAME, displayName)
        put(MediaStore.Images.Media.MIME_TYPE, "image/png")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
          put(
            MediaStore.Images.Media.RELATIVE_PATH,
            "${Environment.DIRECTORY_PICTURES}/Mingle",
          )
          put(MediaStore.Images.Media.IS_PENDING, 1)
        }
      }

      val resolver = reactApplicationContext.contentResolver
      imageUri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values)
      if (imageUri == null) {
        promise.reject("native_qr_photo_save_failed", "Could not create a gallery image.")
        return
      }

      resolver.openOutputStream(imageUri)?.use { outputStream ->
        outputStream.write(imageBytes)
        outputStream.flush()
      } ?: throw IllegalStateException("Could not open the gallery image.")

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        resolver.update(
          imageUri,
          ContentValues().apply { put(MediaStore.Images.Media.IS_PENDING, 0) },
          null,
          null,
        )
      }

      promise.resolve(true)
    } catch (error: Throwable) {
      imageUri?.let { reactApplicationContext.contentResolver.delete(it, null, null) }
      promise.reject(
        "native_qr_photo_save_failed",
        error.message ?: "Could not save the QR image.",
        error,
      )
    }
  }

  private fun normalizeFileName(rawFileName: String): String {
    val normalized = rawFileName
      .trim()
      .replace(Regex("[^A-Za-z0-9._-]"), "_")
      .ifBlank { "mingle-profile.png" }
    return if (normalized.endsWith(".png", ignoreCase = true)) normalized else "$normalized.png"
  }
}
