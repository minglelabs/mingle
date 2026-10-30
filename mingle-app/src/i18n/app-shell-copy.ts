import { resolveLegalDocumentLocale, resolveSupportedLocaleTag, type LegalDocumentLocale } from './config'

/**
 * App-shell strings outside the shared dictionary: the start-up status label
 * and the native QR scanner's camera-permission screen (the web side sends
 * these to the app, which has no dictionary of its own). One record per
 * primary UI locale (15 total).
 */
export type AppShellCopy = {
  preparing: string
  cameraPermissionTitle: string
  cameraPermissionBody: string
  cameraUnavailableTitle: string
  cameraUnavailableBody: string
  retry: string
}

const copy: Record<LegalDocumentLocale, AppShellCopy> = {
  ko: {
    preparing: 'HashChat 준비 중',
    cameraPermissionTitle: '카메라 권한이 필요합니다',
    cameraPermissionBody: '설정에서 HashChat의 카메라 접근을 허용해 주세요.',
    cameraUnavailableTitle: '카메라를 사용할 수 없습니다',
    cameraUnavailableBody: '카메라 권한을 허용한 뒤 다시 시도해 주세요.',
    retry: '다시 시도',
  },
  en: {
    preparing: 'Preparing HashChat',
    cameraPermissionTitle: 'Camera access is required',
    cameraPermissionBody: 'Allow HashChat to use the camera in Settings.',
    cameraUnavailableTitle: 'Camera access is unavailable',
    cameraUnavailableBody: 'Allow camera access and try again.',
    retry: 'Try again',
  },
  ja: {
    preparing: 'HashChatを準備中',
    cameraPermissionTitle: 'カメラへのアクセスが必要です',
    cameraPermissionBody: '設定でHashChatのカメラへのアクセスを許可してください。',
    cameraUnavailableTitle: 'カメラを使用できません',
    cameraUnavailableBody: 'カメラへのアクセスを許可してから、もう一度お試しください。',
    retry: '再試行',
  },
  'zh-CN': {
    preparing: '正在准备 HashChat',
    cameraPermissionTitle: '需要相机权限',
    cameraPermissionBody: '请在设置中允许 HashChat 使用相机。',
    cameraUnavailableTitle: '无法使用相机',
    cameraUnavailableBody: '请允许相机权限后重试。',
    retry: '重试',
  },
  'zh-TW': {
    preparing: '正在準備 HashChat',
    cameraPermissionTitle: '需要相機權限',
    cameraPermissionBody: '請在設定中允許 HashChat 使用相機。',
    cameraUnavailableTitle: '無法使用相機',
    cameraUnavailableBody: '請允許相機權限後再試一次。',
    retry: '再試一次',
  },
  fr: {
    preparing: 'Préparation de HashChat',
    cameraPermissionTitle: 'Accès à la caméra requis',
    cameraPermissionBody: 'Autorisez HashChat à utiliser la caméra dans les Réglages.',
    cameraUnavailableTitle: 'Caméra indisponible',
    cameraUnavailableBody: 'Autorisez l’accès à la caméra, puis réessayez.',
    retry: 'Réessayer',
  },
  de: {
    preparing: 'HashChat wird vorbereitet',
    cameraPermissionTitle: 'Kamerazugriff erforderlich',
    cameraPermissionBody: 'Erlaube HashChat in den Einstellungen den Zugriff auf die Kamera.',
    cameraUnavailableTitle: 'Kamera nicht verfügbar',
    cameraUnavailableBody: 'Erlaube den Kamerazugriff und versuche es erneut.',
    retry: 'Erneut versuchen',
  },
  es: {
    preparing: 'Preparando HashChat',
    cameraPermissionTitle: 'Se necesita acceso a la cámara',
    cameraPermissionBody: 'Permite que HashChat use la cámara en Ajustes.',
    cameraUnavailableTitle: 'La cámara no está disponible',
    cameraUnavailableBody: 'Permite el acceso a la cámara e inténtalo de nuevo.',
    retry: 'Reintentar',
  },
  pt: {
    preparing: 'Preparando o HashChat',
    cameraPermissionTitle: 'É preciso acesso à câmera',
    cameraPermissionBody: 'Permita que o HashChat use a câmera nos Ajustes.',
    cameraUnavailableTitle: 'Câmera indisponível',
    cameraUnavailableBody: 'Permita o acesso à câmera e tente novamente.',
    retry: 'Tentar novamente',
  },
  it: {
    preparing: 'Preparazione di HashChat',
    cameraPermissionTitle: 'Serve l’accesso alla fotocamera',
    cameraPermissionBody: 'Consenti a HashChat di usare la fotocamera nelle Impostazioni.',
    cameraUnavailableTitle: 'Fotocamera non disponibile',
    cameraUnavailableBody: 'Consenti l’accesso alla fotocamera e riprova.',
    retry: 'Riprova',
  },
  ru: {
    preparing: 'Подготовка HashChat',
    cameraPermissionTitle: 'Нужен доступ к камере',
    cameraPermissionBody: 'Разрешите HashChat доступ к камере в Настройках.',
    cameraUnavailableTitle: 'Камера недоступна',
    cameraUnavailableBody: 'Разрешите доступ к камере и попробуйте снова.',
    retry: 'Повторить',
  },
  ar: {
    preparing: 'جارٍ تجهيز HashChat',
    cameraPermissionTitle: 'مطلوب إذن الكاميرا',
    cameraPermissionBody: 'اسمح لـ HashChat باستخدام الكاميرا من الإعدادات.',
    cameraUnavailableTitle: 'الكاميرا غير متاحة',
    cameraUnavailableBody: 'اسمح بالوصول إلى الكاميرا ثم حاول مرة أخرى.',
    retry: 'إعادة المحاولة',
  },
  hi: {
    preparing: 'HashChat तैयार हो रहा है',
    cameraPermissionTitle: 'कैमरा अनुमति ज़रूरी है',
    cameraPermissionBody: 'सेटिंग्स में HashChat को कैमरा इस्तेमाल करने की अनुमति दें।',
    cameraUnavailableTitle: 'कैमरा उपलब्ध नहीं है',
    cameraUnavailableBody: 'कैमरा अनुमति दें और फिर से कोशिश करें।',
    retry: 'फिर से कोशिश करें',
  },
  th: {
    preparing: 'กำลังเตรียม HashChat',
    cameraPermissionTitle: 'ต้องอนุญาตให้ใช้กล้อง',
    cameraPermissionBody: 'อนุญาตให้ HashChat ใช้กล้องในการตั้งค่า',
    cameraUnavailableTitle: 'ใช้กล้องไม่ได้',
    cameraUnavailableBody: 'อนุญาตให้ใช้กล้องแล้วลองอีกครั้ง',
    retry: 'ลองอีกครั้ง',
  },
  vi: {
    preparing: 'Đang chuẩn bị HashChat',
    cameraPermissionTitle: 'Cần quyền truy cập máy ảnh',
    cameraPermissionBody: 'Hãy cho phép HashChat dùng máy ảnh trong Cài đặt.',
    cameraUnavailableTitle: 'Không dùng được máy ảnh',
    cameraUnavailableBody: 'Hãy cho phép truy cập máy ảnh rồi thử lại.',
    retry: 'Thử lại',
  },
}

export function appShellCopy(locale: string): AppShellCopy {
  return copy[resolveLegalDocumentLocale(resolveSupportedLocaleTag(locale) || 'en')]
}
