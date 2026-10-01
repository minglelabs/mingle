This is the `mingle-app/rn` React Native workspace.

- Root scripts (from `/Users/nam/mingle/mingle-app`):
- `pnpm rn:install`
- `pnpm rn:pods`
- `pnpm rn:start`
- `pnpm rn:ios:env-check`
- `pnpm rn:ios`
- `pnpm rn:android:env-check`
- `pnpm rn:android`

The RN app requires the following environment variables.

- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_WS_URL`
- `NEXT_PUBLIC_API_NAMESPACE` (iOS: `ios/v2.1.0`, Android: `android/v2.1.0`)
- `RN_CLIENT_VERSION` (optional, fallback: iOS `CFBundleShortVersionString`, Android `BuildConfig.MINGLE_CLIENT_VERSION`)
- `RN_CLIENT_BUILD` (optional, fallback: iOS `CFBundleVersion`, Android `BuildConfig.MINGLE_CLIENT_BUILD`)
- `RN_AD_BANNER_POSITION` (optional: `top` | `bottom`, default: `bottom`)
- `RN_AD_BANNER_HEIGHT_PX` (optional, default: `50`)
- `RN_ADMOB_APP_ID_IOS` (optional override, defaults to the production app ID)
- `RN_ADMOB_APP_ID_ANDROID` (optional override, defaults to the production app ID)
- `RN_ADMOB_BANNER_UNIT_ID_IOS` (optional override, defaults to the production banner ad unit ID)
- `RN_ADMOB_BANNER_UNIT_ID_ANDROID` (optional override, defaults to the production banner ad unit ID)

The RN WebView forwards `apiNamespace` to the web layer as a query parameter.
If the value is missing or does not match the platform baseline, the app shows an error instead of loading the WebView.
`pnpm rn:ios` validates `NEXT_PUBLIC_API_NAMESPACE=ios/v2.1.0` before launch.
`pnpm rn:android` validates `NEXT_PUBLIC_API_NAMESPACE=android/v2.1.0` before launch.
For release-safe 2.1.0 builds, `NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_WS_URL` must not point to the legacy 1.0.11 production hosts.
If they still match `MINGLE_LEGACY_SITE_URL` / `MINGLE_LEGACY_WS_URL`, the app now fails closed at startup instead of silently using the old servers.
There is no fallback host: if the Railway WebView fails to load, the app shows the retry overlay for the same host.

On startup, the RN app calls the version-policy API and applies `force_update | recommend_update | none`.

- iOS: `/api/ios/v2.1.0/client/version-policy`
- Android: `/api/android/v2.1.0/client/version-policy`
- The request body includes `platform` (`ios` | `android`).
- The response can optionally override the banner ad unit ID via server env, while the built-in production IDs remain the fallback.

The iOS runtime URL prefers the following keys from `Info.plist`.

- `MingleWebAppBaseURL`
- `MingleDefaultWsURL`

When building for an iOS device, `scripts/devbox` generates and injects `rn/ios/devbox.runtime.xcconfig`
to override those values with the current worktree / ngrok URLs.
Regular builds that do not use devbox keep the default Xcode project values (production URLs).

Android runtime URLs, AdMob values, and the namespace are injected through Gradle `BuildConfig`, the app manifest, and `NativeRuntimeConfigModule`.

## Native Ad Banner Placement

RN can render a native ad banner overlay with a build-time/env option.

- `RN_AD_BANNER_POSITION=top`: render banner below the native top area.
- `RN_AD_BANNER_POSITION=bottom`: render banner above the native bottom area.

When banner is enabled, RN forwards these query params to web:

- `nativeListTopInsetPx`
- `nativeConversationBannerPosition`
- `nativeConversationTopInsetPx` or `nativeConversationBottomInsetPx`

The list and conversation room use separate inset params so the list CTA does not reserve conversation-only
bottom banner space. `LivePhoneDemo` uses the conversation values to add transcript-safe padding so chat rows are
not hidden by the banner overlay.

### Where the banner may appear

The banner is allow-listed: it is visible only on the conversation list and inside a chat room
(`/{locale}/conversations`). Every other route and every overlay layered over those two screens is banner-free
by default, so a new screen needs no banner code.

All `native_set_banner_zone` messages are sent from `src/lib/native-banner-zone.ts` (web) and the zone it posts is
the intersection of three gates: the route is `/{locale}/conversations`, the list/room requested `list`/`conversation`
(`requestNativeBannerZone`), and no overlay holds a suppression (`suppressNativeBanner`).

- New route: nothing to do. `NativeBannerRouteGuard` (root layout) re-syncs on every route change and the route gate hides it.
- New modal, sheet, viewer, or layered screen over the list/room: call `useNativeBannerSuppression(isOpen)`.
  `SlideSurface` (every role except `main`), `MessageMediaDialog` (the photo viewer), and the shared overlays already do.
- Do not post `native_set_banner_zone` directly; `native-banner-zone.wiring.test.ts` fails if anything else does.

The native shell mirrors the route gate with `resolveNativeBannerZoneForUrl` (`src/nativeBannerZone.ts`), which only
treats the exact `/{locale}/conversations` URL as list/room, so sub-routes such as `/conversations/new-group` hide the
banner the moment the URL changes.

For `scripts/devbox mobile --device-app-env dev` and `scripts/devbox up --profile device --device-app-env dev`,
devbox forces Google's official sample AdMob app IDs and banner unit IDs. This keeps local release verification
off production inventory even when vault or runtime env files contain production AdMob values.

## Earphone Mode Bridge (Audio Route)

The shell reports whether earphones are the current audio output so the web can gate automatic TTS.

- Native module `NativeAudioRouteModule` (iOS: in `ios/mingle/NativeSTTModule.swift`; Android:
  `NativeAudioRouteModule.kt` registered in `NativeRuntimeConfigPackage.kt`): `getAudioRoute()` plus the
  `audioRouteChanged` event. Read-only: it never changes the audio session, mode or routing, and needs no new
  permission. iOS observes route changes, media-services resets and `didBecomeActive`; Android uses its own
  `AudioDeviceCallback`, `ACTION_AUDIO_BECOMING_NOISY` and host resume, and polls every 250 ms while the host
  is resumed. Polling stops on pause, destroy or module invalidation. Pause immediately reports a disconnected,
  unknown route, and reads while paused fail closed; resume performs a fresh read. API 33+ reads
  `getAudioDevicesForAttributes(USAGE_MEDIA)` and polls output-selection and audio-mode changes that do not add
  or remove a device.
- Earphones = iOS `headphones`, `bluetoothA2DP`, `bluetoothHFP`, `bluetoothLE`, `usbAudio`; Android wired
  headset/headphones, Bluetooth A2DP/SCO, BLE headset, USB headset, hearing aid among the API 33+ media devices.
  Android API 29-32 has no media-route query and `getDevices(GET_DEVICES_OUTPUTS)` lists every connected output,
  so only outputs that carry media count there: wired headset/headphones, USB headset, hearing aid, and Bluetooth
  A2DP while `isBluetoothA2dpOn()`. API 29-32 cannot prove which connected output is selected for media, so
  `audioRoute` capability stays false there and automatic earphone-gated clips are unavailable. Bluetooth SCO
  (call audio, e.g. a headset with "Media audio" off) and BLE headset never count in the legacy diagnostic query,
  and nothing counts in `MODE_IN_CALL`/`MODE_IN_COMMUNICATION` (media follows the call route). Only port/device
  types are reported, never device names.
- `capabilities` (on `mingle:native-stt`) carries `audioRoute: true` when supported: on iOS with the module,
  and on Android API 33+ with the module.
- `App.tsx` relays readings (`src/nativeAudioRoute.ts`) as the window event `mingle:native-audio-route`, after
  assigning the same detail to `window.__MINGLE_LAST_NATIVE_AUDIO_ROUTE`: at every load end right after
  `capabilities`, on each `earphonesConnected`/`routeKind` change (debounced 250 ms, a disconnect immediately), and
  in reply to the web command `native_audio_route_request`.
- Android automatic clips request a fresh route immediately before HTML playback. The request and response carry
  an optional `requestId`; missing, malformed or failed replies do not authorize playback. Manual clips do not
  require this check. A refused autoplay attempt is retried through the queue with a new route query.
- `mingle:native-tts` gains `tts_started` (sent when iOS `NativeTTSModule.play` resolves). A `native_tts_play` with
  `stopOnEarphoneDisconnect: true` is stopped on iOS as soon as no earphone output is left (or is not started
  without one), reported as `tts_stopped` with `reason: 'earphones_disconnected'`.

This project was bootstrapped using [`@react-native-community/cli`](https://github.com/react-native-community/cli).

# Getting Started

> **Note**: Make sure you have completed the [Set Up Your Environment](https://reactnative.dev/docs/set-up-your-environment) guide before proceeding.

## Step 1: Start Metro

First, you will need to run **Metro**, the JavaScript build tool for React Native.

To start the Metro dev server, run the following command from the root of your React Native project:

```sh
# Using npm
npm start

# OR using Yarn
yarn start
```

## Step 2: Build and run your app

With Metro running, open a new terminal window/pane from the root of your React Native project, and use one of the following commands to build and run your Android or iOS app:

### Android

```sh
# Using npm
npm run android

# OR using Yarn
yarn android
```

### iOS

For iOS, remember to install CocoaPods dependencies (this only needs to be run on first clone or after updating native deps).

The first time you create a new project, run the Ruby bundler to install CocoaPods itself:

```sh
bundle install
```

Then, and every time you update your native dependencies, run:

```sh
bundle exec pod install
```

For more information, please visit [CocoaPods Getting Started guide](https://guides.cocoapods.org/using/getting-started.html).

```sh
# Using npm
npm run ios

# OR using Yarn
yarn ios
```

If everything is set up correctly, you should see your new app running in the Android Emulator, iOS Simulator, or your connected device.

This is one way to run your app — you can also build it directly from Android Studio or Xcode.

## Step 3: Modify your app

Now that you have successfully run the app, let's make changes!

Open `App.tsx` in your text editor of choice and make some changes. When you save, your app will automatically update and reflect these changes — this is powered by [Fast Refresh](https://reactnative.dev/docs/fast-refresh).

When you want to forcefully reload, for example to reset the state of your app, you can perform a full reload:

- **Android**: Press the <kbd>R</kbd> key twice or select **"Reload"** from the **Dev Menu**, accessed via <kbd>Ctrl</kbd> + <kbd>M</kbd> (Windows/Linux) or <kbd>Cmd ⌘</kbd> + <kbd>M</kbd> (macOS).
- **iOS**: Press <kbd>R</kbd> in iOS Simulator.

## Congratulations! :tada:

You've successfully run and modified your React Native App. :partying_face:

### Now what?

- If you want to add this new React Native code to an existing application, check out the [Integration guide](https://reactnative.dev/docs/integration-with-existing-apps).
- If you're curious to learn more about React Native, check out the [docs](https://reactnative.dev/docs/getting-started).

# Troubleshooting

If you're having issues getting the above steps to work, see the [Troubleshooting](https://reactnative.dev/docs/troubleshooting) page.

# Learn More

To learn more about React Native, take a look at the following resources:

- [React Native Website](https://reactnative.dev) - learn more about React Native.
- [Getting Started](https://reactnative.dev/docs/environment-setup) - an **overview** of React Native and how setup your environment.
- [Learn the Basics](https://reactnative.dev/docs/getting-started) - a **guided tour** of the React Native **basics**.
- [Blog](https://reactnative.dev/blog) - read the latest official React Native **Blog** posts.
- [`@facebook/react-native`](https://github.com/facebook/react-native) - the Open Source; GitHub **repository** for React Native.
