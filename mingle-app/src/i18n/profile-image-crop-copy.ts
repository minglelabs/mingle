import {
  DEFAULT_LOCALE,
  resolveLegalDocumentLocale,
  resolveSupportedLocaleTag,
  type LegalDocumentLocale,
} from '@/i18n/config'

export type ProfileImageCropCopy = {
  addPhoto: string
  changePhoto: string
  hint: string
  invalidFile: string
  loadError: string
}

const COPY_BY_LOCALE: Record<LegalDocumentLocale, ProfileImageCropCopy> = {
  ko: {
    addPhoto: '프로필 사진 추가', changePhoto: '사진 변경', hint: '사진을 드래그하고 두 손가락으로 확대·축소하세요.',
    invalidFile: 'JPG, PNG, WEBP 사진만 10MB 이하로 올릴 수 있습니다.', loadError: '사진을 표시하지 못했습니다. 다른 사진을 선택해 주세요.',
  },
  en: {
    addPhoto: 'Add profile photo', changePhoto: 'Change photo', hint: 'Drag the photo and pinch with two fingers to zoom.',
    invalidFile: 'Use a JPG, PNG, or WEBP image up to 10MB.', loadError: 'Could not display this photo. Please choose another one.',
  },
  ja: {
    addPhoto: 'プロフィール写真を追加', changePhoto: '写真を変更', hint: '写真をドラッグし、2本指で拡大・縮小してください。',
    invalidFile: 'JPG、PNG、WEBP形式で10MB以下の画像を使用してください。', loadError: '写真を表示できませんでした。別の写真を選択してください。',
  },
  'zh-CN': {
    addPhoto: '添加头像', changePhoto: '更换照片', hint: '拖动照片，并用双指缩放。',
    invalidFile: '请使用10MB以内的 JPG、PNG 或 WEBP 图片。', loadError: '无法显示照片，请选择其他照片。',
  },
  'zh-TW': {
    addPhoto: '新增個人檔案照片', changePhoto: '變更照片', hint: '拖曳照片，並用雙指縮放。',
    invalidFile: '請使用 10MB 以下的 JPG、PNG 或 WEBP 圖片。', loadError: '無法顯示照片，請選擇其他照片。',
  },
  fr: {
    addPhoto: 'Ajouter une photo de profil', changePhoto: 'Modifier la photo', hint: 'Faites glisser la photo et pincez pour zoomer.',
    invalidFile: 'Utilisez une image JPG, PNG ou WEBP de 10 Mo maximum.', loadError: 'Impossible d’afficher la photo. Choisissez-en une autre.',
  },
  de: {
    addPhoto: 'Profilfoto hinzufügen', changePhoto: 'Foto ändern', hint: 'Ziehen Sie das Foto und zoomen Sie mit zwei Fingern.',
    invalidFile: 'Verwenden Sie ein JPG-, PNG- oder WEBP-Bild bis 10 MB.', loadError: 'Foto konnte nicht angezeigt werden. Wählen Sie ein anderes.',
  },
  es: {
    addPhoto: 'Añadir foto de perfil', changePhoto: 'Cambiar foto', hint: 'Arrastra la foto y pellizca con dos dedos para ampliar.',
    invalidFile: 'Usa una imagen JPG, PNG o WEBP de hasta 10 MB.', loadError: 'No se pudo mostrar la foto. Elige otra.',
  },
  pt: {
    addPhoto: 'Adicionar foto de perfil', changePhoto: 'Alterar foto', hint: 'Arraste a foto e use dois dedos para ampliar.',
    invalidFile: 'Use uma imagem JPG, PNG ou WEBP de até 10 MB.', loadError: 'Não foi possível exibir a foto. Escolha outra.',
  },
  it: {
    addPhoto: 'Aggiungi foto del profilo', changePhoto: 'Cambia foto', hint: 'Trascina la foto e usa due dita per ingrandire.',
    invalidFile: 'Usa un’immagine JPG, PNG o WEBP fino a 10 MB.', loadError: 'Impossibile visualizzare la foto. Scegline un’altra.',
  },
  ru: {
    addPhoto: 'Добавить фото профиля', changePhoto: 'Изменить фото', hint: 'Перетаскивайте фото и масштабируйте двумя пальцами.',
    invalidFile: 'Используйте изображение JPG, PNG или WEBP размером до 10 МБ.', loadError: 'Не удалось показать фото. Выберите другое.',
  },
  ar: {
    addPhoto: 'إضافة صورة للملف الشخصي', changePhoto: 'تغيير الصورة', hint: 'اسحب الصورة وكبّرها أو صغّرها بإصبعين.',
    invalidFile: 'استخدم صورة JPG أو PNG أو WEBP بحجم يصل إلى 10 ميغابايت.', loadError: 'تعذر عرض الصورة. اختر صورة أخرى.',
  },
  hi: {
    addPhoto: 'प्रोफ़ाइल फ़ोटो जोड़ें', changePhoto: 'फ़ोटो बदलें', hint: 'फ़ोटो खींचें और दो उँगलियों से ज़ूम करें।',
    invalidFile: '10MB तक की JPG, PNG या WEBP इमेज इस्तेमाल करें।', loadError: 'फ़ोटो दिखाई नहीं जा सकी। दूसरी फ़ोटो चुनें।',
  },
  th: {
    addPhoto: 'เพิ่มรูปโปรไฟล์', changePhoto: 'เปลี่ยนรูป', hint: 'ลากรูปภาพและใช้สองนิ้วเพื่อซูม',
    invalidFile: 'ใช้รูป JPG, PNG หรือ WEBP ขนาดไม่เกิน 10MB', loadError: 'แสดงรูปภาพไม่ได้ โปรดลองเลือกรูปอื่น',
  },
  vi: {
    addPhoto: 'Thêm ảnh hồ sơ', changePhoto: 'Đổi ảnh', hint: 'Kéo ảnh và chụm hai ngón tay để thu phóng.',
    invalidFile: 'Dùng ảnh JPG, PNG hoặc WEBP tối đa 10 MB.', loadError: 'Không thể hiển thị ảnh. Hãy chọn ảnh khác.',
  },
}

export function resolveProfileImageCropCopy(rawLocale: string): ProfileImageCropCopy {
  const supportedLocale = resolveSupportedLocaleTag(rawLocale) ?? DEFAULT_LOCALE
  return COPY_BY_LOCALE[resolveLegalDocumentLocale(supportedLocale)]
}
