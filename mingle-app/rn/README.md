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
- `NEXT_PUBLIC_API_NAMESPACE` (iOS: `ios/v1.0.6`, Android: `android/v1.0.6`)
- `RN_CLIENT_VERSION` (optional, fallback: iOS `CFBundleShortVersionString`, Android `BuildConfig.MINGLE_CLIENT_VERSION`)
- `RN_CLIENT_BUILD` (optional, fallback: iOS `CFBundleVersion`, Android `BuildConfig.MINGLE_CLIENT_BUILD`)

The RN WebView forwards `apiNamespace` to the web layer as a query parameter.
If the value is missing or does not match the platform baseline, the app shows an error instead of loading the WebView.
`pnpm rn:ios` validates `NEXT_PUBLIC_API_NAMESPACE=ios/v1.0.6` before launch.
`pnpm rn:android` validates `NEXT_PUBLIC_API_NAMESPACE=android/v1.0.6` before launch.

On startup, the RN app calls the version-policy API and applies `force_update | recommend_update | none`.

- iOS: `/api/ios/v1.0.6/client/version-policy`
- Android: `/api/android/v1.0.6/client/version-policy`
- The request body includes `platform` (`ios` | `android`).

The iOS runtime URL prefers the following keys from `Info.plist`.

- `MingleWebAppBaseURL`
- `MingleDefaultWsURL`

When building for an iOS device, `scripts/devbox` generates and injects `rn/ios/devbox.runtime.xcconfig`
to override those values with the current worktree / ngrok URLs.
Regular builds that do not use devbox keep the default Xcode project values (production URLs).

Android runtime URLs and the namespace are injected through Gradle `BuildConfig` and `NativeRuntimeConfigModule`.

The native STT bridge forwards the selected languages and lets `mingle-stt`
choose the default provider through `STT_DEFAULT_MODEL`, unless a specific
`sttModel` override is supplied for debugging.

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
