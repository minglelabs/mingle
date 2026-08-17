package com.minglelabs.mingle.rn

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
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
    if (Build.VERSION.SDK_INT >= 33 &&
      checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
    ) {
      return
    }

    val notification = message.notification
    val title = notification?.title?.takeIf { it.isNotBlank() } ?: message.data["title"] ?: "Mingle"
    val body = notification?.body?.takeIf { it.isNotBlank() }
      ?: message.data["body"]
      ?: "You have a new notification."
    val notificationId = message.data["notificationId"] ?: message.messageId ?: System.currentTimeMillis().toString()

    ensureNotificationChannel()
    val openIntent = Intent(this, MainActivity::class.java).apply {
      action = "MINGLE_NOTIFICATION_OPEN"
      flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
      putExtra("notificationId", notificationId)
      putExtra("type", message.data["type"] ?: "")
      putExtra("actorId", message.data["actorId"] ?: "")
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
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle(title)
      .setContentText(body)
      .setStyle(Notification.BigTextStyle().bigText(body))
      .setPriority(Notification.PRIORITY_HIGH)
      .setAutoCancel(true)
      .setContentIntent(pendingIntent)

    getSystemService(NotificationManager::class.java).notify(notificationId.hashCode(), builder.build())
  }

  private fun ensureNotificationChannel() {
    if (Build.VERSION.SDK_INT < 26) return
    val manager = getSystemService(NotificationManager::class.java)
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return
    manager.createNotificationChannel(
      NotificationChannel(
        CHANNEL_ID,
        "Mingle notifications",
        NotificationManager.IMPORTANCE_HIGH,
      ).apply {
        description = "Notifications from Mingle"
      },
    )
  }

  companion object {
    const val CHANNEL_ID = "mingle_notifications"
  }
}
