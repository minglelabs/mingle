package com.minglelabs.mingle.rn

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.provider.ContactsContract
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.PermissionAwareActivity
import com.facebook.react.modules.core.PermissionListener
import java.util.concurrent.Executors

/**
 * Reads the address book for the contact-sync screen (invite friends by text
 * message). Contacts go to the web page only; this module sends nothing.
 */
class NativeContactsModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  private val executor = Executors.newSingleThreadExecutor()
  private val prefs by lazy {
    reactApplicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
  }
  private var pendingPermissionPromise: Promise? = null

  override fun getName(): String = "NativeContactsModule"

  override fun invalidate() {
    pendingPermissionPromise = null
    executor.shutdown()
    super.invalidate()
  }

  @ReactMethod
  fun checkPermission(promise: Promise) {
    promise.resolve(permissionPayload())
  }

  @ReactMethod
  fun requestPermission(promise: Promise) {
    if (hasPermission()) {
      promise.resolve(permissionPayload())
      return
    }
    val activity = reactApplicationContext.currentActivity as? PermissionAwareActivity
    if (activity == null) {
      promise.resolve(permissionPayload("unavailable"))
      return
    }
    pendingPermissionPromise = promise
    prefs.edit().putBoolean(PERMISSION_REQUESTED_KEY, true).apply()
    try {
      activity.requestPermissions(
        arrayOf(Manifest.permission.READ_CONTACTS),
        REQUEST_CONTACTS_PERMISSION,
        permissionListener,
      )
    } catch (_: Throwable) {
      pendingPermissionPromise = null
      promise.resolve(permissionPayload("unavailable"))
    }
  }

  @ReactMethod
  fun getContacts(promise: Promise) {
    if (!hasPermission()) {
      promise.reject("contacts_permission", "Contacts permission is not granted")
      return
    }
    executor.execute {
      try {
        promise.resolve(readContacts())
      } catch (error: Throwable) {
        promise.reject("contacts_failed", error.message ?: "Could not read contacts", error)
      }
    }
  }

  private fun readContacts() = Arguments.createArray().apply {
    // One row per phone number: group the rows of one contact together.
    val names = LinkedHashMap<String, String>()
    val phones = HashMap<String, MutableList<String>>()
    reactApplicationContext.contentResolver.query(
      ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
      arrayOf(
        ContactsContract.CommonDataKinds.Phone.CONTACT_ID,
        ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
        ContactsContract.CommonDataKinds.Phone.NUMBER,
      ),
      null,
      null,
      null,
    )?.use { cursor ->
      val idIndex = cursor.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Phone.CONTACT_ID)
      val nameIndex = cursor.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME)
      val numberIndex = cursor.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Phone.NUMBER)
      while (cursor.moveToNext()) {
        val id = cursor.getString(idIndex) ?: continue
        val number = cursor.getString(numberIndex)?.trim().orEmpty()
        if (number.isEmpty()) continue
        names.getOrPut(id) { cursor.getString(nameIndex)?.trim().orEmpty() }
        phones.getOrPut(id) { mutableListOf() }.add(number)
      }
    }
    for ((id, name) in names) {
      pushMap(Arguments.createMap().apply {
        putString("id", id)
        putString("name", name)
        putArray("phones", Arguments.createArray().apply {
          phones[id].orEmpty().forEach(::pushString)
        })
      })
    }
  }

  private val permissionListener = PermissionListener { requestCode, _, _ ->
    if (requestCode != REQUEST_CONTACTS_PERMISSION) return@PermissionListener false
    val pending = pendingPermissionPromise
    pendingPermissionPromise = null
    pending?.resolve(permissionPayload())
    true
  }

  private fun hasPermission(): Boolean =
    ContextCompat.checkSelfPermission(
      reactApplicationContext,
      Manifest.permission.READ_CONTACTS,
    ) == PackageManager.PERMISSION_GRANTED

  private fun permissionStatus(): String {
    if (hasPermission()) return "granted"
    if (!prefs.getBoolean(PERMISSION_REQUESTED_KEY, false)) return "not_determined"
    val activity = reactApplicationContext.currentActivity ?: return "denied"
    // Asked before and Android will not show the prompt again: only Settings can change it.
    return if (ActivityCompat.shouldShowRequestPermissionRationale(activity, Manifest.permission.READ_CONTACTS)) {
      "denied"
    } else {
      "blocked"
    }
  }

  private fun permissionPayload(statusOverride: String? = null): WritableMap = Arguments.createMap().apply {
    putString("permission", statusOverride ?: permissionStatus())
    putString("platform", "android")
  }

  companion object {
    private const val PREFS_NAME = "mingle_contacts"
    private const val PERMISSION_REQUESTED_KEY = "contacts_permission_requested"
    private const val REQUEST_CONTACTS_PERMISSION = 48213
  }
}
