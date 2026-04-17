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
- `MINGLE_API_FALLBACK_SITE_URL` (optional, default source for the Vercel web fallback)
- `MINGLE_STT_FALLBACK_WS_URL` (optional, default source for the legacy STT fallback)
- `MINGLE_LEGACY_SITE_URL` (optional override, default: current 1.0.11 production web deployment)
- `MINGLE_LEGACY_WS_URL` (optional override, default: current 1.0.11 production STT deployment)
- `NEXT_PUBLIC_API_NAMESPACE` (iOS: `ios/v1.1.2`, Android: `android/v1.1.2`)
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
`pnpm rn:ios` validates `NEXT_PUBLIC_API_NAMESPACE=ios/v1.1.2` before launch.
`pnpm rn:android` validates `NEXT_PUBLIC_API_NAMESPACE=android/v1.1.2` before launch.
For release-safe 1.1.2 builds, `NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_WS_URL` must not point to the legacy 1.0.11 production hosts.
If they still match `MINGLE_LEGACY_SITE_URL` / `MINGLE_LEGACY_WS_URL`, the app now fails closed at startup instead of silently using the old servers.
When the 1.1.2 primary Railway WebView or native STT target has a transport/startup failure, RN can retry the configured fallback target. HTTP policy fallback is limited to network failures and 5xx responses.

On startup, the RN app calls the version-policy API and applies `force_update | recommend_update | none`.

- iOS: `/api/ios/v1.1.2/client/version-policy`
- Android: `/api/android/v1.1.2/client/version-policy`
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

- `nativeTopInsetPx`
- `nativeBottomInsetPx`

`LivePhoneDemo` uses those values to add transcript-safe padding so chat rows are not hidden by the banner overlay.

For `scripts/devbox mobile --device-app-env dev`, devbox falls back to Google's official sample AdMob app IDs and banner unit IDs when the AdMob env vars are unset, so local release verification can proceed without production credentials.

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
