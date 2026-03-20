# mingle-ios

`mingle-ios` is a fully separate pure native iOS (SwiftUI) app from `mingle-app`.
It reuses the existing backend only (`mingle-app` TS + Prisma + API) without modifying the web or RN code.

## Included Features

- Realtime microphone capture built on AVAudioEngine
- WebSocket integration with `mingle-stt` (`audio_chunk`, `transcript`, `stop_recording_ack`)
- STT workflow parser written in Swift
- Final translation update via `/api/translate/finalize`
- Simple interpretation log UI

## Directory Layout

- `project.yml`: XcodeGen spec
- `Config/*.xcconfig`: default API / WS URL settings
- `MingleIOS/`: app source
- `MingleIOSTests/`: parser unit tests
- `scripts/`: CLI build and install scripts

## Quick Start

```bash
cd mingle-ios
./scripts/build-ios.sh
```

## Install and Run on a Connected Device

```bash
cd mingle-ios
./scripts/list-ios-devices.sh
./scripts/install-ios-device.sh
# Or target a specific device
./scripts/install-ios-device.sh <COREDEVICE_ID>
```

Set the code signing team when needed:

```bash
DEVELOPMENT_TEAM=YOUR_TEAM_ID ./scripts/install-ios-device.sh <DEVICE_ID>
```

If you hit a bundle ID conflict (for example, provisioning creation fails), you can override the local bundle ID:

```bash
APP_BUNDLE_ID=com.<your_name>.mingleios DEVELOPMENT_TEAM=YOUR_TEAM_ID ./scripts/install-ios-device.sh <DEVICE_ID>
```

## Install and Run on the iOS Simulator

```bash
cd mingle-ios
./scripts/install-ios-simulator.sh
# Or target a specific simulator
SIMULATOR_NAME="iPhone 16 Pro" ./scripts/install-ios-simulator.sh
# Or pass the simulator UDID directly
./scripts/install-ios-simulator.sh <SIMULATOR_UDID>
```

Requirements before installing on a physical device:

1. Sign in with your Apple ID in Xcode > Settings > Accounts.
2. Connect and unlock the iPhone, then allow "Trust This Computer".
3. Make sure development provisioning profiles can be created automatically.

## Change Backend URLs

You can change the following values directly in the in-app `Backend` section:

- API Base URL (for example, `http://<mac-ip>:3000`)
- WS URL (for example, `ws://<mac-ip>:3001`)
- Languages (for example, `en,ko,ja`)

The app stores these inputs in `UserDefaults`.
