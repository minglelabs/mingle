import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Linking,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Camera } from "react-native-camera-kit";
import {
  PERMISSIONS,
  RESULTS,
  request,
  type PermissionStatus,
} from "react-native-permissions";

export type NativeQrScannerRequest = {
  title?: string;
  instruction?: string;
  cancelLabel?: string;
  settingsLabel?: string;
};

type NativeQrScannerProps = {
  requestConfig: NativeQrScannerRequest;
  onClose: () => void;
  onRead: (value: string) => void;
};

function getCameraPermission() {
  return Platform.OS === "ios" ? PERMISSIONS.IOS.CAMERA : PERMISSIONS.ANDROID.CAMERA;
}

function getPermissionCopy(status: PermissionStatus | null, requestConfig: NativeQrScannerRequest) {
  const isKorean = (requestConfig.title ?? "").includes("QR") && (requestConfig.instruction ?? "").includes("프로필");
  if (status === RESULTS.BLOCKED || status === RESULTS.UNAVAILABLE) {
    return {
      title: isKorean ? "카메라 권한이 필요합니다" : "Camera access is required",
      description: isKorean
        ? "설정에서 Mingle의 카메라 접근을 허용해 주세요."
        : "Allow Mingle to use the camera in Settings.",
      action: requestConfig.settingsLabel ?? (isKorean ? "설정 열기" : "Open settings"),
    };
  }
  return {
    title: isKorean ? "카메라를 사용할 수 없습니다" : "Camera access is unavailable",
    description: isKorean ? "카메라 권한을 허용한 뒤 다시 시도해 주세요." : "Allow camera access and try again.",
    action: isKorean ? "다시 시도" : "Try again",
  };
}

export default function NativeQrScanner({
  requestConfig,
  onClose,
  onRead,
}: NativeQrScannerProps) {
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus | null>(null);
  const didReadRef = useRef(false);

  const requestCameraPermission = useCallback(() => {
    setPermissionStatus(null);
    didReadRef.current = false;
    void request(getCameraPermission()).then((status) => {
      setPermissionStatus(status);
    });
  }, []);

  useEffect(() => {
    requestCameraPermission();
  }, [requestCameraPermission]);

  const handleReadCode = useCallback((event: { nativeEvent?: { codeStringValue?: string | null } }) => {
    if (didReadRef.current) return;
    const value = event.nativeEvent?.codeStringValue?.trim() ?? "";
    if (!value) return;
    didReadRef.current = true;
    onRead(value);
  }, [onRead]);

  const hasPermission = permissionStatus === RESULTS.GRANTED;
  const permissionCopy = getPermissionCopy(permissionStatus, requestConfig);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      {hasPermission ? (
        <Camera
          style={StyleSheet.absoluteFill}
          scanBarcode
          showFrame
          frameColor="#ffffff"
          laserColor="#f3c35a"
          scanThrottleDelay={1200}
          onReadCode={handleReadCode}
        />
      ) : (
        <View style={styles.permissionBackground} />
      )}
      <View pointerEvents="box-none" style={styles.overlay}>
        <View style={styles.header}>
          <Pressable
            accessibilityLabel={requestConfig.cancelLabel ?? "Back"}
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [styles.closeButton, pressed ? styles.pressed : null]}
          >
            <Text style={styles.closeButtonText}>×</Text>
          </Pressable>
          <Text numberOfLines={1} style={styles.title}>{requestConfig.title ?? "Scan QR code"}</Text>
          <View style={styles.headerSpacer} />
        </View>

        {hasPermission ? (
          <View pointerEvents="none" style={styles.scanHintContainer}>
            <Text style={styles.instruction}>
              {requestConfig.instruction ?? "Place the QR code inside the frame."}
            </Text>
          </View>
        ) : permissionStatus ? (
          <View style={styles.permissionCard}>
            <Text style={styles.permissionTitle}>{permissionCopy.title}</Text>
            <Text style={styles.permissionDescription}>{permissionCopy.description}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={permissionStatus === RESULTS.BLOCKED || permissionStatus === RESULTS.UNAVAILABLE
                ? () => void Linking.openSettings()
                : requestCameraPermission}
              style={({ pressed }) => [styles.permissionButton, pressed ? styles.pressed : null]}
            >
              <Text style={styles.permissionButtonText}>{permissionCopy.action}</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000000",
    zIndex: 100,
  },
  permissionBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#101114",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 58,
    width: "100%",
  },
  closeButton: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  closeButtonText: {
    color: "#ffffff",
    fontSize: 34,
    fontWeight: "300",
    lineHeight: 38,
    marginTop: -3,
  },
  headerSpacer: {
    height: 44,
    width: 44,
  },
  title: {
    color: "#ffffff",
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    marginHorizontal: 12,
    textAlign: "center",
  },
  scanHintContainer: {
    alignItems: "center",
    flex: 1,
    justifyContent: "flex-end",
    paddingBottom: 118,
    paddingHorizontal: 30,
  },
  instruction: {
    backgroundColor: "rgba(0,0,0,0.58)",
    borderRadius: 18,
    color: "#ffffff",
    fontSize: 14,
    lineHeight: 20,
    overflow: "hidden",
    paddingHorizontal: 18,
    paddingVertical: 12,
    textAlign: "center",
  },
  permissionCard: {
    backgroundColor: "#ffffff",
    borderRadius: 28,
    marginHorizontal: 28,
    marginTop: 180,
    padding: 26,
    width: "85%",
  },
  permissionTitle: {
    color: "#111827",
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  permissionDescription: {
    color: "#6b7280",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 10,
    textAlign: "center",
  },
  permissionButton: {
    alignItems: "center",
    backgroundColor: "#111827",
    borderRadius: 16,
    marginTop: 20,
    paddingHorizontal: 18,
    paddingVertical: 13,
  },
  permissionButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
  pressed: {
    opacity: 0.72,
  },
});
