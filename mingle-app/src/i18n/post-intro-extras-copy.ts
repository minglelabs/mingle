import { resolvePrimaryUiLocaleTag, type PrimaryUiLocale } from "@/i18n/mingle-locales";
import {
  POST_INTRO_ANIMALS,
  POST_INTRO_DRINKS,
  POST_INTRO_FOODS,
  POST_INTRO_INTERESTS,
  POST_INTRO_JOBS,
  POST_INTRO_PERSONALITIES,
  type PostIntroAnimal,
  type PostIntroDrink,
  type PostIntroFood,
  type PostIntroInterest,
  type PostIntroJob,
  type PostIntroPersonality,
} from "@/lib/post-category";

/** The rest of a self-introduction (owner, 2026-11-26; see @/lib/post-category PostIntroExtras). */
export type PostIntroExtrasCopy = {
  labels: { job: string; personality: string; foods: string; animals: string; drink: string; interests: string };
  /** After a label whose list takes several: "up to 3". */
  upTo: string;
  /** Over the optional part of the form. */
  optional: string;
  jobs: Record<PostIntroJob, string>;
  personality: Record<PostIntroPersonality, string>;
  foods: Record<PostIntroFood, string>;
  animals: Record<PostIntroAnimal, string>;
  drinks: Record<PostIntroDrink, string>;
  interests: Record<PostIntroInterest, string>;
};

// [job|personality|foods|animals|drink|interests labels, upTo, optional, then each list in @/lib/post-category order, "|"-separated]
type Row = [labels: string, upTo: string, optional: string, jobs: string, personality: string, foods: string, animals: string, drinks: string, interests: string];

const ROWS: Record<PrimaryUiLocale, Row> = {
  ko: ["직업|성격|좋아하는 음식|좋아하는 동물|술|요즘 관심사", "최대 {n}개", "더 알려주기 (선택)",
    "학생|회사원|프리랜서|자영업|전문직|공무원|크리에이터|서비스직|구직 중|기타",
    "외향적|내향적|다정한|유머러스|차분한|활발한|솔직한|계획적|즉흥적",
    "한식|일식|중식|양식|분식|디저트|매운 음식|고기|해산물|채식",
    "강아지|고양이|토끼|햄스터|새|물고기|파충류",
    "안 마셔요|가끔|자주|분위기 따라",
    "운동·다이어트|재테크|자기계발|연애|여행 계획|한국어 공부|맛집 탐방|새 취미|커리어|K-POP"],
  en: ["Job|Personality|Favourite food|Favourite animal|Drinking|Into lately", "up to {n}", "More about me (optional)",
    "Student|Office worker|Freelancer|Business owner|Professional|Public servant|Creator|Service job|Job hunting|Other",
    "Outgoing|Introverted|Warm|Funny|Calm|Lively|Honest|Planner|Spontaneous",
    "Korean|Japanese|Chinese|Western|Street food|Desserts|Spicy food|Meat|Seafood|Vegetarian",
    "Dogs|Cats|Rabbits|Hamsters|Birds|Fish|Reptiles",
    "Never|Sometimes|Often|Socially",
    "Fitness|Money & investing|Self-growth|Dating|Trip plans|Learning Korean|Food hunting|A new hobby|Career|K-pop"],
  ja: ["職業|性格|好きな食べ物|好きな動物|お酒|最近の関心事", "最大{n}個", "もっと紹介する（任意）",
    "学生|会社員|フリーランス|自営業|専門職|公務員|クリエイター|サービス業|求職中|その他",
    "外向的|内向的|優しい|ユーモアがある|落ち着いている|明るい|素直|計画派|即興派",
    "韓国料理|和食|中華|洋食|粉食|スイーツ|辛い料理|お肉|海鮮|ベジタリアン",
    "犬|猫|うさぎ|ハムスター|鳥|魚|爬虫類",
    "飲まない|たまに|よく飲む|雰囲気次第",
    "運動・ダイエット|資産運用|自己啓発|恋愛|旅行計画|韓国語の勉強|グルメ巡り|新しい趣味|キャリア|K-POP"],
  "zh-CN": ["职业|性格|喜欢的食物|喜欢的动物|喝酒|最近感兴趣", "最多 {n} 个", "更多介绍（选填）",
    "学生|上班族|自由职业|自己做生意|专业人士|公务员|创作者|服务业|求职中|其他",
    "外向|内向|温柔|幽默|沉稳|活泼|直率|计划型|随性",
    "韩餐|日料|中餐|西餐|小吃|甜点|辣的|肉类|海鲜|素食",
    "狗|猫|兔子|仓鼠|鸟|鱼|爬行动物",
    "不喝|偶尔|经常|看气氛",
    "健身减肥|理财|自我提升|恋爱|旅行计划|学韩语|探店美食|新爱好|职业发展|K-POP"],
  "zh-TW": ["職業|個性|喜歡的食物|喜歡的動物|喝酒|最近感興趣", "最多 {n} 個", "更多介紹（選填）",
    "學生|上班族|自由工作者|自己做生意|專業人士|公務員|創作者|服務業|求職中|其他",
    "外向|內向|溫柔|幽默|沉穩|活潑|直率|計畫型|隨性",
    "韓式|日式|中式|西式|小吃|甜點|辣的|肉類|海鮮|素食",
    "狗|貓|兔子|倉鼠|鳥|魚|爬蟲類",
    "不喝|偶爾|常喝|看氣氛",
    "健身減肥|理財|自我成長|戀愛|旅行計畫|學韓文|探店美食|新嗜好|職涯|K-POP"],
  fr: ["Métier|Personnalité|Plat préféré|Animal préféré|Alcool|En ce moment", "jusqu’à {n}", "Plus sur moi (facultatif)",
    "Étudiant·e|Employé·e de bureau|Freelance|Entrepreneur·e|Profession libérale|Fonctionnaire|Créateur·rice|Commerce & services|En recherche d’emploi|Autre",
    "Extraverti·e|Introverti·e|Chaleureux·se|Drôle|Calme|Pétillant·e|Franc·he|Organisé·e|Spontané·e",
    "Coréen|Japonais|Chinois|Occidental|Cuisine de rue|Pâtisseries|Épicé|Viande|Fruits de mer|Végétarien",
    "Chiens|Chats|Lapins|Hamsters|Oiseaux|Poissons|Reptiles",
    "Jamais|Parfois|Souvent|En soirée",
    "Sport|Finances|Développement perso|Amour|Projets de voyage|Apprendre le coréen|Bonnes adresses|Nouveau hobby|Carrière|K-pop"],
  de: ["Beruf|Persönlichkeit|Lieblingsessen|Lieblingstier|Alkohol|Gerade interessiert an", "bis zu {n}", "Mehr über mich (optional)",
    "Student·in|Büro|Freiberuflich|Selbstständig|Fachberuf|Öffentlicher Dienst|Creator|Dienstleistung|Auf Jobsuche|Anderes",
    "Extrovertiert|Introvertiert|Herzlich|Witzig|Ruhig|Lebhaft|Ehrlich|Planer·in|Spontan",
    "Koreanisch|Japanisch|Chinesisch|Westlich|Streetfood|Nachspeisen|Scharf|Fleisch|Meeresfrüchte|Vegetarisch",
    "Hunde|Katzen|Kaninchen|Hamster|Vögel|Fische|Reptilien",
    "Nie|Manchmal|Oft|Gesellig",
    "Fitness|Finanzen|Persönliche Entwicklung|Dating|Reisepläne|Koreanisch lernen|Essen entdecken|Neues Hobby|Karriere|K-Pop"],
  es: ["Trabajo|Personalidad|Comida favorita|Animal favorito|Alcohol|Últimamente me interesa", "hasta {n}", "Más sobre mí (opcional)",
    "Estudiante|Oficina|Freelance|Negocio propio|Profesional|Funcionario|Creador de contenido|Servicios|Buscando trabajo|Otro",
    "Extrovertido|Introvertido|Cariñoso|Gracioso|Tranquilo|Animado|Sincero|Planificador|Espontáneo",
    "Coreana|Japonesa|China|Occidental|Comida callejera|Postres|Picante|Carne|Mariscos|Vegetariana",
    "Perros|Gatos|Conejos|Hámsteres|Aves|Peces|Reptiles",
    "Nunca|A veces|A menudo|Socialmente",
    "Ejercicio|Finanzas|Crecimiento personal|Citas|Planes de viaje|Aprender coreano|Buscar comida rica|Un hobby nuevo|Carrera|K-pop"],
  pt: ["Profissão|Personalidade|Comida favorita|Animal favorito|Bebida|Interesse do momento", "até {n}", "Mais sobre mim (opcional)",
    "Estudante|Escritório|Freelancer|Negócio próprio|Profissional liberal|Servidor público|Criador de conteúdo|Serviços|Procurando emprego|Outro",
    "Extrovertido|Introvertido|Carinhoso|Engraçado|Calmo|Animado|Sincero|Planejador|Espontâneo",
    "Coreana|Japonesa|Chinesa|Ocidental|Comida de rua|Sobremesas|Apimentada|Carne|Frutos do mar|Vegetariana",
    "Cachorros|Gatos|Coelhos|Hamsters|Pássaros|Peixes|Répteis",
    "Não bebo|Às vezes|Com frequência|Socialmente",
    "Academia|Finanças|Desenvolvimento pessoal|Namoro|Planos de viagem|Estudar coreano|Caçar restaurantes|Novo hobby|Carreira|K-pop"],
  it: ["Lavoro|Carattere|Cibo preferito|Animale preferito|Alcol|In questo periodo", "fino a {n}", "Altro su di me (facoltativo)",
    "Studente|Impiegato|Freelance|Imprenditore|Libero professionista|Dipendente pubblico|Creator|Servizi|In cerca di lavoro|Altro",
    "Estroverso|Introverso|Affettuoso|Divertente|Calmo|Vivace|Sincero|Organizzato|Spontaneo",
    "Coreana|Giapponese|Cinese|Occidentale|Cibo di strada|Dolci|Piccante|Carne|Pesce|Vegetariana",
    "Cani|Gatti|Conigli|Criceti|Uccelli|Pesci|Rettili",
    "Mai|A volte|Spesso|In compagnia",
    "Fitness|Finanze|Crescita personale|Incontri|Progetti di viaggio|Studiare coreano|Scoprire locali|Nuovo hobby|Carriera|K-pop"],
  ru: ["Работа|Характер|Любимая еда|Любимое животное|Алкоголь|Сейчас увлекаюсь", "до {n}", "Ещё о себе (необязательно)",
    "Студент|Офис|Фриланс|Свой бизнес|Специалист|Госслужба|Блогер|Сфера услуг|Ищу работу|Другое",
    "Экстраверт|Интроверт|Добрый|С юмором|Спокойный|Энергичный|Прямой|Планирую всё|Спонтанный",
    "Корейская|Японская|Китайская|Европейская|Уличная еда|Десерты|Острое|Мясо|Морепродукты|Вегетарианская",
    "Собаки|Кошки|Кролики|Хомяки|Птицы|Рыбки|Рептилии",
    "Не пью|Иногда|Часто|За компанию",
    "Спорт|Финансы|Саморазвитие|Отношения|Планы на поездку|Учу корейский|Гастро-поиски|Новое хобби|Карьера|K-поп"],
  ar: ["العمل|الشخصية|الطعام المفضل|الحيوان المفضل|الكحول|مهتم مؤخرًا بـ", "حتى {n}", "المزيد عني (اختياري)",
    "طالب|موظف مكتب|عمل حر|صاحب عمل|مهني متخصص|موظف حكومي|صانع محتوى|قطاع الخدمات|أبحث عن عمل|أخرى",
    "اجتماعي|انطوائي|حنون|مرح|هادئ|نشيط|صريح|منظّم|عفوي",
    "كوري|ياباني|صيني|غربي|أكل الشارع|حلويات|حار|لحوم|مأكولات بحرية|نباتي",
    "كلاب|قطط|أرانب|هامستر|طيور|أسماك|زواحف",
    "لا أشرب|أحيانًا|كثيرًا|في المناسبات",
    "رياضة|المال والاستثمار|تطوير الذات|المواعدة|خطط السفر|تعلّم الكورية|اكتشاف المطاعم|هواية جديدة|المسار المهني|كي-بوب"],
  hi: ["काम|स्वभाव|पसंदीदा खाना|पसंदीदा जानवर|शराब|आजकल दिलचस्पी", "ज़्यादा से ज़्यादा {n}", "मेरे बारे में और (वैकल्पिक)",
    "छात्र|ऑफ़िस जॉब|फ़्रीलांसर|अपना बिज़नेस|प्रोफ़ेशनल|सरकारी नौकरी|क्रिएटर|सर्विस जॉब|नौकरी की तलाश|अन्य",
    "मिलनसार|अंतर्मुखी|स्नेही|मज़ाकिया|शांत|चुलबुला|सीधा-सच्चा|योजना बनाने वाला|बेफ़िक्र",
    "कोरियन|जापानी|चाइनीज़|वेस्टर्न|स्ट्रीट फ़ूड|मिठाई|तीखा|मांस|सी-फ़ूड|शाकाहारी",
    "कुत्ते|बिल्लियाँ|खरगोश|हैम्स्टर|पक्षी|मछली|सरीसृप",
    "नहीं पीता|कभी-कभी|अक्सर|दोस्तों के साथ",
    "फ़िटनेस|पैसा और निवेश|सेल्फ़-ग्रोथ|डेटिंग|ट्रिप प्लान|कोरियन सीखना|खाने की खोज|नया शौक़|करियर|के-पॉप"],
  th: ["อาชีพ|นิสัย|อาหารที่ชอบ|สัตว์ที่ชอบ|ดื่มเหล้า|ช่วงนี้สนใจ", "สูงสุด {n}", "เล่าเพิ่ม (ไม่บังคับ)",
    "นักเรียน|พนักงานออฟฟิศ|ฟรีแลนซ์|ธุรกิจส่วนตัว|อาชีพเฉพาะทาง|ข้าราชการ|ครีเอเตอร์|งานบริการ|กำลังหางาน|อื่น ๆ",
    "เปิดเผย|เก็บตัว|อบอุ่น|ตลก|ใจเย็น|ร่าเริง|ตรงไปตรงมา|ชอบวางแผน|ชิล ๆ ตามใจ",
    "อาหารเกาหลี|อาหารญี่ปุ่น|อาหารจีน|อาหารฝรั่ง|สตรีทฟู้ด|ของหวาน|อาหารเผ็ด|เนื้อสัตว์|ซีฟู้ด|มังสวิรัติ",
    "หมา|แมว|กระต่าย|แฮมสเตอร์|นก|ปลา|สัตว์เลื้อยคลาน",
    "ไม่ดื่ม|บางครั้ง|บ่อย|ตามบรรยากาศ",
    "ออกกำลังกาย|การเงิน|พัฒนาตัวเอง|ความรัก|วางแผนเที่ยว|เรียนภาษาเกาหลี|ตามหาร้านอร่อย|งานอดิเรกใหม่|การงาน|เคป๊อป"],
  vi: ["Nghề nghiệp|Tính cách|Món ăn yêu thích|Con vật yêu thích|Rượu bia|Dạo này quan tâm", "tối đa {n}", "Kể thêm (không bắt buộc)",
    "Sinh viên|Nhân viên văn phòng|Freelancer|Kinh doanh|Chuyên môn|Công chức|Nhà sáng tạo|Ngành dịch vụ|Đang tìm việc|Khác",
    "Hướng ngoại|Hướng nội|Ấm áp|Hài hước|Điềm tĩnh|Năng động|Thẳng thắn|Thích kế hoạch|Ngẫu hứng",
    "Món Hàn|Món Nhật|Món Trung|Món Âu|Đồ ăn đường phố|Tráng miệng|Đồ cay|Thịt|Hải sản|Chay",
    "Chó|Mèo|Thỏ|Chuột hamster|Chim|Cá|Bò sát",
    "Không uống|Thỉnh thoảng|Thường xuyên|Tùy cuộc vui",
    "Tập thể dục|Tài chính|Phát triển bản thân|Hẹn hò|Lên kế hoạch du lịch|Học tiếng Hàn|Săn quán ngon|Sở thích mới|Sự nghiệp|K-pop"],
};

function named<K extends string>(keys: readonly K[], joined: string): Record<K, string> {
  const names = joined.split("|");
  return Object.fromEntries(keys.map((key, index) => [key, names[index] ?? key])) as Record<K, string>;
}

export function resolvePostIntroExtrasCopy(rawLocale: string): PostIntroExtrasCopy {
  const locale = resolvePrimaryUiLocaleTag(rawLocale) ?? "en";
  const row = ROWS[locale] ?? ROWS.en;
  const [job, personality, foods, animals, drink, interests] = row[0].split("|");
  return {
    labels: { job, personality, foods, animals, drink, interests },
    upTo: row[1],
    optional: row[2],
    jobs: named(POST_INTRO_JOBS, row[3]),
    personality: named(POST_INTRO_PERSONALITIES, row[4]),
    foods: named(POST_INTRO_FOODS, row[5]),
    animals: named(POST_INTRO_ANIMALS, row[6]),
    drinks: named(POST_INTRO_DRINKS, row[7]),
    interests: named(POST_INTRO_INTERESTS, row[8]),
  };
}
