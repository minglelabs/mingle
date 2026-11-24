import type { ReferenceAttributes, ReferencePersonAttributes } from '@/server/reference-library/classify'

const VALUE_KO: Record<string, string> = {
  photo: '사진', anime: '애니풍', illustration: '일러스트', screenshot: '스크린샷',
  single: '한 장', photo_booth: '인생네컷·포토부스', collage: '콜라주',
  selfie: '셀카', mirror_selfie: '거울 셀카', friend: '남이 찍어 줌', candid: '몰래·자연스럽게', timer: '타이머', group_crop: '단체사진 잘라냄', no_person: '사람 없음',
  extreme_closeup: '얼굴 꽉 참', closeup: '얼굴 클로즈업', shoulders: '어깨 위', chest: '가슴 위', waist: '허리 위', knees: '무릎 위', full: '전신', far: '멀리서',
  eye_level: '눈높이', high: '위에서', low: '아래에서', overhead: '바로 위에서', side: '옆에서', from_behind: '뒤에서',
  centered: '가운데', off_center: '한쪽으로', tilted: '기울어짐', cut_off: '잘림',
  vertical: '세로', horizontal: '가로', square: '정사각형',
  indoor: '실내', outdoor: '야외',
  morning: '아침', day: '낮', golden_hour: '해질녘', evening: '저녁', night: '밤', unknown: '모름',
  sunny: '맑고 해', clear: '맑음', cloudy: '구름', overcast: '흐림', rain: '비', snow: '눈', fog: '안개',
  spring: '봄', summer: '여름', autumn: '가을', winter: '겨울',
  daylight: '햇빛', window: '창가 빛', golden: '노을빛', fluorescent: '형광등', warm_lamp: '따뜻한 조명', neon: '네온', screen: '화면 빛', flash: '플래시', side_sun: '옆 햇살', backlit_shade: '역광 그늘',
  none: '없음', bw: '흑백', warm: '따뜻한 톤', cool: '차가운 톤', faded: '빛바램', vivid: '쨍함', film: '필름',
  new_phone: '최신 폰', old_phone: '오래된 폰', front_cam: '전면 카메라', camera: '카메라',
  sharp: '선명', slight_shake: '살짝 흔들림', motion_blur: '모션 블러', out_of_focus: '초점 나감',
  all_sharp: '전체 선명', subject_only: '인물만 선명(배경 흐림)', missed: '초점 빗나감',
  dark: '어두움', normal: '보통', bright: '밝음', blown_out: '하얗게 날아감',
  clean: '깨끗함', slight_noise: '노이즈 조금', heavy_noise: '노이즈 많음',
  female: '여', male: '남',
  teens: '10대', early_20s: '20대 초반', late_20s: '20대 후반', '30s': '30대', '40s': '40대', '50s_plus': '50대 이상',
  east_asian: '동아시아', southeast_asian: '동남아', south_asian: '남아시아', white: '백인', black: '흑인', latino: '라틴', middle_eastern: '중동', mixed: '혼혈',
  ordinary: '평범', pleasant: '호감형', striking: '미남미녀',
}

const SCENE_ROWS: Array<[keyof ReferenceAttributes, string]> = [
  ['style', '스타일'], ['layout', '구성'], ['shooter', '찍은 방식'], ['distance', '거리'], ['angle', '각도'], ['composition', '구도'],
  ['orientation', '방향'], ['setting', '장소'], ['place', '장소 설명'], ['timeOfDay', '시간'], ['weather', '날씨'], ['season', '계절'],
  ['lighting', '빛'], ['filter', '필터'], ['quality', '화질'],
  ['sharpness', '흔들림'], ['focus', '초점'], ['exposure', '노출'], ['grain', '노이즈'], ['mood', '분위기'], ['flaws', '흠'],
]

function ko(value: unknown): string {
  if (typeof value === 'boolean') return value ? '있음' : '없음'
  if (typeof value === 'number') return String(value)
  return typeof value === 'string' ? VALUE_KO[value] ?? value : ''
}

function personLine(person: ReferencePersonAttributes): string {
  return [
    person.gender, person.age, person.ancestry, person.attractiveness,
  ].filter(Boolean).map(ko).concat(person.faceVisible === false ? ['얼굴 안 보임'] : [])
    .concat([person.hair, person.outfit, person.expression, person.pose, person.gaze].filter((part): part is string => Boolean(part)))
    .join(' · ')
}

/** The AI's reading of a reference photo, axis by axis, in Korean. */
export function ReferenceAttributesView({ attributes }: { attributes: ReferenceAttributes }) {
  const rows = SCENE_ROWS.flatMap(([key, label]) => (attributes[key] !== undefined ? [[label, ko(attributes[key])] as const] : []))
  const counts = [
    attributes.peopleCount !== undefined ? `${attributes.peopleCount}명` : null,
    attributes.appearances !== undefined && attributes.appearances !== attributes.peopleCount ? `등장 ${attributes.appearances}번` : null,
    attributes.panels && attributes.panels > 1 ? `${attributes.panels}칸` : null,
    attributes.textOrInterface ? '글자·화면 UI 있음' : null,
  ].filter(Boolean)
  return (
    <div className="space-y-2 text-xs text-slate-600">
      {counts.length ? <p className="font-semibold text-slate-700">{counts.join(' · ')}</p> : null}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-slate-400">{label}</dt>
            <dd className="break-words">{value}</dd>
          </div>
        ))}
      </dl>
      {attributes.people?.length ? (
        <ol className="space-y-1">
          {attributes.people.map((person, index) => (
            <li key={index} className="break-words"><span className="font-semibold text-slate-700">{index + 1}번 사람</span> {personLine(person)}</li>
          ))}
        </ol>
      ) : null}
    </div>
  )
}
