# Native Push Notifications

Mingle notifications are still stored in `app_user_notifications` and shown by the existing notification panel. A native installation now registers one APNs or FCM token per installation, and the server sends a push after a notification is created.

## Server configuration

Set these variables in the Mingle app runtime environment. Keep private keys in Vault/Railway variables; do not commit them.

### Apple Push Notification service

```text
APNS_TEAM_ID
APNS_KEY_ID
APNS_BUNDLE_ID=com.minglelabs.mingle.rn
APNS_PRIVATE_KEY
APNS_ENVIRONMENT=production
```

`APNS_PRIVATE_KEY` accepts the contents of the Apple Developer `.p8` key. Escaped `\n` sequences are converted to newlines. Use `sandbox` only for development-signed iOS builds.

### Firebase Cloud Messaging HTTP v1

```text
FCM_PROJECT_ID
FCM_CLIENT_EMAIL
FCM_PRIVATE_KEY
```

The service account must have Firebase Cloud Messaging enabled for the project. The server creates a short-lived OAuth access token from these credentials and calls the FCM HTTP v1 endpoint.

## Android build configuration

The Android native shell reads Firebase client configuration from these build-time values:

```text
MINGLE_FIREBASE_PROJECT_ID
MINGLE_FIREBASE_APPLICATION_ID
MINGLE_FIREBASE_API_KEY
MINGLE_FIREBASE_MESSAGING_SENDER_ID
```

These values are client configuration, not server credentials. If they are not present, the app continues to run but does not register an FCM token.

## Release requirement

Push registration is native code, so the existing installed app cannot gain this behavior from a web deployment alone. Build and distribute a new native app build for both platforms.

The release remains version `2.0.0` and keeps the matching API namespaces:

```text
iOS     ios/v2.0.0  (build 74)
Android android/v2.0.0  (version code 72)
```

The iOS build includes the `aps-environment` entitlement. Android requests `POST_NOTIFICATIONS` on Android 13 and later and creates the `mingle_notifications` channel. Testing was intentionally not run for this change; verify the release on physical devices after provider credentials are configured.
