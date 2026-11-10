package com.minglelabs.mingle.rn

import android.Manifest
import android.app.ActivityManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class MingleFirebaseMessagingService : FirebaseMessagingService() {

  override fun onNewToken(token: String) {
    NativePushNotificationModule.cacheToken(this, token)
  }

  override fun onMessageReceived(message: RemoteMessage) {
    // The sender unsent this message. In the background the system tray
    // rewrites the delivered notification itself (same tag); in the foreground
    // nothing is shown, so the stale one is removed here. FCM posts a tagged
    // notification under id 0.
    if (message.data["recalled"] == "1") {
      if (isAppInForeground()) {
        message.notification?.tag?.let { tag ->
          getSystemService(NotificationManager::class.java).cancel(tag, 0)
        }
      }
      return
    }
    if (Build.VERSION.SDK_INT >= 33 &&
      checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
    ) {
      return
    }
    // Same as iOS (AppDelegate willPresent): no notification while the app is
    // on screen. Background delivery never reaches this method because every
    // push carries a notification payload, which the system tray shows itself.
    if (isAppInForeground()) return

    val notification = message.notification
    val title = notification?.title?.takeIf { it.isNotBlank() } ?: message.data["title"] ?: "HashChat"
    val body = notification?.body?.takeIf { it.isNotBlank() }
      ?: message.data["body"]
      ?: "You have a new notification."
    val notificationId = message.data["notificationId"] ?: message.messageId ?: System.currentTimeMillis().toString()

    ensureNotificationChannel(this)
    val openIntent = Intent(this, MainActivity::class.java).apply {
      action = "MINGLE_NOTIFICATION_OPEN"
      flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
      putExtra("notificationId", notificationId)
      putExtra("type", message.data["type"] ?: "")
      putExtra("actorId", message.data["actorId"] ?: "")
      putExtra("url", message.data["url"] ?: "")
      putExtra("conversationId", message.data["conversationId"] ?: "")
    }
    val pendingIntent = PendingIntent.getActivity(
      this,
      notificationId.hashCode(),
      openIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val builder = if (Build.VERSION.SDK_INT >= 26) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      Notification.Builder(this)
    }
      .setSmallIcon(R.drawable.mingle_notification)
      .setContentTitle(title)
      .setContentText(body)
      .setStyle(Notification.BigTextStyle().bigText(body))
      .setPriority(Notification.PRIORITY_HIGH)
      .setAutoCancel(true)
      .setContentIntent(pendingIntent)

    getSystemService(NotificationManager::class.java).notify(notificationId.hashCode(), builder.build())
  }

  // IMPORTANCE_FOREGROUND means a visible activity; the STT foreground service
  // alone reports IMPORTANCE_FOREGROUND_SERVICE.
  private fun isAppInForeground(): Boolean {
    val state = ActivityManager.RunningAppProcessInfo()
    ActivityManager.getMyMemoryState(state)
    return state.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
  }

  companion object {
    const val CHANNEL_ID = "mingle_notifications"
    // Must match ANDROID_SILENT_CHANNEL_ID in server/push-notifications.ts.
    const val SILENT_CHANNEL_ID = "mingle_silent_updates"

    fun ensureNotificationChannel(context: Context) {
      if (Build.VERSION.SDK_INT < 26) return
      val manager = context.getSystemService(NotificationManager::class.java)
      if (manager.getNotificationChannel(CHANNEL_ID) == null) {
        manager.createNotificationChannel(
          NotificationChannel(
            CHANNEL_ID,
            "HashChat notifications",
            NotificationManager.IMPORTANCE_HIGH,
          ).apply {
            description = "Notifications from HashChat"
          },
        )
      }
      // For pushes that only rewrite a notification already shown (an unsent
      // message becomes "deleted message"): no sound, no heads-up.
      if (manager.getNotificationChannel(SILENT_CHANNEL_ID) == null) {
        manager.createNotificationChannel(
          NotificationChannel(
            SILENT_CHANNEL_ID,
            "HashChat silent updates",
            NotificationManager.IMPORTANCE_LOW,
          ).apply {
            description = "Updates to notifications already shown"
          },
        )
      }
    }
  }
}
