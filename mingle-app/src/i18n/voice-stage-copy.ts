import { resolveLegalDocumentLocale, resolveSupportedLocaleTag, type LegalDocumentLocale } from '@/i18n/config'

// The stage of an open room's voice talk (speakers on it, listeners below, a
// raised hand, the host moving people on and off), in the 15 primary UI languages.
export type VoiceStageCopy = {
  raiseHand: string
  lowerHand: string
  /** Heading of the row of people who only listen. */
  listeners: string
  /** The host's button on a listener. */
  toStage: string
  /** The host's button on a speaker. */
  offStage: string
  /** A speaker's own button. */
  stepDown: string
  stageFull: string
  /** Shown to someone the host just put on the stage. */
  onStageNow: string
  failed: string
}

const COPY: Record<LegalDocumentLocale, VoiceStageCopy> = {
  ko: { raiseHand: '손들기', lowerHand: '손 내리기', listeners: '듣는 사람', toStage: '무대로 올리기', offStage: '무대에서 내리기', stepDown: '무대에서 내려가기', stageFull: '무대가 다 찼어요', onStageNow: '무대에 올라왔어요. 이제 말할 수 있어요', failed: '하지 못했어요' },
  en: { raiseHand: 'Raise hand', lowerHand: 'Lower hand', listeners: 'Listening', toStage: 'Bring to the stage', offStage: 'Move off the stage', stepDown: 'Step off the stage', stageFull: 'The stage is full', onStageNow: 'You are on the stage. You can talk now', failed: 'That did not work' },
  ja: { raiseHand: '手を挙げる', lowerHand: '手を下ろす', listeners: '聞いている人', toStage: 'ステージに上げる', offStage: 'ステージから下ろす', stepDown: 'ステージを降りる', stageFull: 'ステージが満席です', onStageNow: 'ステージに上がりました。話せます', failed: 'できませんでした' },
  'zh-CN': { raiseHand: '举手', lowerHand: '放下手', listeners: '听众', toStage: '请上台', offStage: '请下台', stepDown: '下台', stageFull: '台上已满', onStageNow: '你已上台，现在可以发言', failed: '操作失败' },
  'zh-TW': { raiseHand: '舉手', lowerHand: '放下手', listeners: '聽眾', toStage: '請上台', offStage: '請下台', stepDown: '下台', stageFull: '台上已滿', onStageNow: '你已上台，現在可以發言', failed: '操作失敗' },
  fr: { raiseHand: 'Lever la main', lowerHand: 'Baisser la main', listeners: 'À l’écoute', toStage: 'Faire monter sur scène', offStage: 'Faire descendre de scène', stepDown: 'Descendre de scène', stageFull: 'La scène est pleine', onStageNow: 'Vous êtes sur scène. Vous pouvez parler', failed: 'Cela n’a pas fonctionné' },
  de: { raiseHand: 'Hand heben', lowerHand: 'Hand senken', listeners: 'Hören zu', toStage: 'Auf die Bühne holen', offStage: 'Von der Bühne nehmen', stepDown: 'Bühne verlassen', stageFull: 'Die Bühne ist voll', onStageNow: 'Du bist auf der Bühne. Du kannst jetzt sprechen', failed: 'Das hat nicht geklappt' },
  es: { raiseHand: 'Levantar la mano', lowerHand: 'Bajar la mano', listeners: 'Escuchando', toStage: 'Subir al escenario', offStage: 'Bajar del escenario', stepDown: 'Bajar del escenario', stageFull: 'El escenario está lleno', onStageNow: 'Estás en el escenario. Ya puedes hablar', failed: 'No se pudo hacer' },
  pt: { raiseHand: 'Levantar a mão', lowerHand: 'Baixar a mão', listeners: 'Ouvindo', toStage: 'Chamar ao palco', offStage: 'Tirar do palco', stepDown: 'Sair do palco', stageFull: 'O palco está cheio', onStageNow: 'Você está no palco. Já pode falar', failed: 'Não deu certo' },
  it: { raiseHand: 'Alza la mano', lowerHand: 'Abbassa la mano', listeners: 'In ascolto', toStage: 'Porta sul palco', offStage: 'Fai scendere dal palco', stepDown: 'Scendi dal palco', stageFull: 'Il palco è pieno', onStageNow: 'Sei sul palco. Ora puoi parlare', failed: 'Non è riuscito' },
  ru: { raiseHand: 'Поднять руку', lowerHand: 'Опустить руку', listeners: 'Слушают', toStage: 'Пригласить на сцену', offStage: 'Убрать со сцены', stepDown: 'Уйти со сцены', stageFull: 'На сцене нет мест', onStageNow: 'Вы на сцене. Можно говорить', failed: 'Не получилось' },
  ar: { raiseHand: 'رفع اليد', lowerHand: 'إنزال اليد', listeners: 'المستمعون', toStage: 'دعوة إلى المنصة', offStage: 'إنزال من المنصة', stepDown: 'النزول من المنصة', stageFull: 'المنصة ممتلئة', onStageNow: 'أنت على المنصة. يمكنك التحدث الآن', failed: 'لم ينجح ذلك' },
  hi: { raiseHand: 'हाथ उठाएँ', lowerHand: 'हाथ नीचे करें', listeners: 'सुन रहे हैं', toStage: 'मंच पर बुलाएँ', offStage: 'मंच से उतारें', stepDown: 'मंच से उतरें', stageFull: 'मंच भर गया है', onStageNow: 'आप मंच पर हैं। अब बोल सकते हैं', failed: 'यह नहीं हो सका' },
  th: { raiseHand: 'ยกมือ', lowerHand: 'เอามือลง', listeners: 'ผู้ฟัง', toStage: 'เชิญขึ้นเวที', offStage: 'ให้ลงจากเวที', stepDown: 'ลงจากเวที', stageFull: 'เวทีเต็มแล้ว', onStageNow: 'คุณอยู่บนเวทีแล้ว พูดได้เลย', failed: 'ทำไม่สำเร็จ' },
  vi: { raiseHand: 'Giơ tay', lowerHand: 'Hạ tay', listeners: 'Đang nghe', toStage: 'Mời lên sân khấu', offStage: 'Mời xuống sân khấu', stepDown: 'Rời sân khấu', stageFull: 'Sân khấu đã đầy', onStageNow: 'Bạn đã lên sân khấu. Giờ có thể nói', failed: 'Không thực hiện được' },
}

export function voiceStageCopy(locale: string): VoiceStageCopy {
  return COPY[resolveLegalDocumentLocale(resolveSupportedLocaleTag(locale) || 'en')] ?? COPY.en
}
