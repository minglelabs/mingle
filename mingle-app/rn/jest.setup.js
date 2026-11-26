global.__DEV__ = false;
global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('react-native', () => {
  const React = require('react');

  const createNativeComponent = (displayName) => {
    const Component = ({ children, ...props }) => React.createElement(displayName, props, children);
    Component.displayName = displayName;
    return Component;
  };

  class NativeEventEmitter {
    addListener() {
      return { remove: jest.fn() };
    }
  }

  class AnimatedValue {
    constructor(value) {
      this.value = value;
    }
  }

  return {
    Alert: { alert: jest.fn() },
    Animated: {
      Value: AnimatedValue,
      View: createNativeComponent('Animated.View'),
      timing: jest.fn(() => ({ start: (callback) => callback?.({ finished: true }) })),
    },
    Appearance: {
      getColorScheme: jest.fn(() => 'light'),
    },
    AppState: {
      currentState: 'active',
      addEventListener: jest.fn(() => ({ remove: jest.fn() })),
    },
    BackHandler: {
      addEventListener: jest.fn(() => ({ remove: jest.fn() })),
    },
    Image: createNativeComponent('Image'),
    Linking: {
      addEventListener: jest.fn(() => ({ remove: jest.fn() })),
      getInitialURL: jest.fn(async () => null),
      openSettings: jest.fn(async () => undefined),
      openURL: jest.fn(async () => true),
    },
    NativeEventEmitter,
    NativeModules: {
      NativeRuntimeConfigModule: { runtimeConfig: {} },
      NativeSTTModule: {
        runtimeConfig: {},
        start: jest.fn(async () => ({ sampleRate: 16000 })),
        stop: jest.fn(async () => undefined),
        setAec: jest.fn(async () => ({ ok: true })),
        getMicrophonePermissionStatus: jest.fn(async () => ({ permission: 'granted', platform: 'ios' })),
      },
      NativeTTSModule: {
        play: jest.fn(async () => ({ ok: true })),
        stop: jest.fn(async () => ({ ok: true })),
      },
      NativeAuthModule: {
        startSession: jest.fn(async () => ({
          provider: 'apple',
          callbackUrl: '/',
          bridgeToken: 'bridge_token',
        })),
      },
      SettingsManager: { settings: { AppleLocale: 'en_US', AppleLanguages: ['en-US'] } },
      I18nManager: { localeIdentifier: 'en_US' },
    },
    Platform: {
      OS: 'ios',
      Version: '17.0',
      select: (spec) => spec.ios ?? spec.default ?? Object.values(spec)[0],
    },
    Pressable: createNativeComponent('Pressable'),
    StatusBar: createNativeComponent('StatusBar'),
    StyleSheet: {
      create: (styles) => styles,
      flatten: (style) => style,
      hairlineWidth: 1,
      absoluteFillObject: {
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
      },
    },
    Text: createNativeComponent('Text'),
    useWindowDimensions: () => ({
      width: 390,
      height: 844,
      scale: 3,
      fontScale: 1,
    }),
    View: createNativeComponent('View'),
  };
});

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  return {
    SafeAreaProvider: ({ children }) => React.createElement(React.Fragment, null, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
  };
});

jest.mock('react-native-webview', () => {
  const React = require('react');
  const WebView = React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({
      goBack: jest.fn(),
      injectJavaScript: jest.fn(),
      reload: jest.fn(),
      stopLoading: jest.fn(),
    }));
    return React.createElement('WebView', props, props.children);
  });

  return { WebView };
});

jest.mock('react-native-camera-kit', () => {
  const React = require('react');
  const Camera = ({ children, ...props }) => React.createElement('Camera', props, children);
  return { Camera };
});

jest.mock('react-native-permissions', () => ({
  PERMISSIONS: {
    IOS: { CAMERA: 'ios.permission.CAMERA', PHOTO_LIBRARY: 'ios.permission.PHOTO_LIBRARY' },
    ANDROID: {
      CAMERA: 'android.permission.CAMERA',
      READ_MEDIA_IMAGES: 'android.permission.READ_MEDIA_IMAGES',
      READ_MEDIA_VISUAL_USER_SELECTED: 'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
      READ_EXTERNAL_STORAGE: 'android.permission.READ_EXTERNAL_STORAGE',
    },
  },
  RESULTS: {
    GRANTED: 'granted',
    DENIED: 'denied',
    BLOCKED: 'blocked',
    LIMITED: 'limited',
    UNAVAILABLE: 'unavailable',
  },
  check: jest.fn(async () => 'granted'),
  request: jest.fn(async () => 'granted'),
  openSettings: jest.fn(async () => undefined),
  openPhotoPicker: jest.fn(async () => undefined),
}));

// The write screen's gallery (src/photoGallery).
jest.mock('@react-native-camera-roll/camera-roll', () => ({
  CameraRoll: {
    getPhotos: jest.fn(async () => ({ edges: [], page_info: { has_next_page: false } })),
    getPhotoThumbnail: jest.fn(async () => ({ thumbnailBase64: '' })),
  },
}));

jest.mock('@react-native-community/image-editor', () => ({
  __esModule: true,
  default: { cropImage: jest.fn(async () => ({ uri: '', base64: '' })) },
}));

jest.mock('react-native-google-mobile-ads', () => {
  const React = require('react');
  const BannerAd = ({ children, ...props }) => React.createElement('BannerAd', props, children);

  return {
    __esModule: true,
    default: () => ({
      initialize: jest.fn(async () => undefined),
    }),
    BannerAd,
    BannerAdSize: {
      BANNER: 'BANNER',
      ADAPTIVE_BANNER: 'ADAPTIVE_BANNER',
      LARGE_ANCHORED_ADAPTIVE_BANNER: 'LARGE_ANCHORED_ADAPTIVE_BANNER',
    },
  };
});
