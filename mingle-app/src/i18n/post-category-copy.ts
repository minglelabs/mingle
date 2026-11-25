import { resolvePrimaryUiLocaleTag, type PrimaryUiLocale } from "@/i18n/mingle-locales";
import { POST_HOBBIES, type PostCategory, type PostHobby } from "@/lib/post-category";

/** The post categories of the write screen and the card (owner, 2026-11-25; see @/lib/post-category). */
export type PostCategoryCopy = {
  label: string;
  categories: Record<PostCategory, string>;
  /** Under the chips while "1 hour" is picked. */
  hourHint: string;
  /** Under the chips while "self-introduction" is picked. */
  introHint: string;
  hobbiesLabel: string;
  needHobby: string;
  needText: string;
  /** On the card of an hour post: "{n}" is whole minutes left. */
  minutesLeft: string;
  hobbies: Record<PostHobby, string>;
};

type Row = [
  label: string, free: string, hour: string, intro: string, hourHint: string, introHint: string,
  hobbiesLabel: string, needHobby: string, needText: string, minutesLeft: string, hobbies: string,
];

// The hobbies, in POST_HOBBIES order, separated by "|".
const ROWS: Record<PrimaryUiLocale, Row> = {
  ko: ["카테고리", "자유", "1시간", "자기소개", "1시간 뒤에 사라지는 글이에요.", "취미를 고르고 나를 소개해 보세요. 국적·나이·키는 프로필에서 가져와요.", "취미", "취미를 하나 이상 골라 주세요.", "자기소개를 조금 더 적어 주세요.", "{n}분 남음", "여행|음악|애니메이션|드라마·영화|게임|운동|요리|카페·맛집|사진|독서|패션|언어 공부"],
  en: ["Category", "Free", "1 hour", "About me", "This post disappears after an hour.", "Pick your hobbies and introduce yourself. Country, age and height come from your profile.", "Hobbies", "Pick at least one hobby.", "Write a little more about yourself.", "{n} min left", "Travel|Music|Anime|Dramas & films|Games|Sports|Cooking|Cafés & food|Photography|Reading|Fashion|Languages"],
  ja: ["カテゴリー", "自由", "1時間", "自己紹介", "1時間後に消える投稿です。", "趣味を選んで自己紹介しましょう。国・年齢・身長はプロフィールから入ります。", "趣味", "趣味を1つ以上選んでください。", "自己紹介をもう少し書いてください。", "残り{n}分", "旅行|音楽|アニメ|ドラマ・映画|ゲーム|運動|料理|カフェ・グルメ|写真|読書|ファッション|語学"],
  "zh-CN": ["分类", "自由", "1小时", "自我介绍", "这条帖子1小时后消失。", "选择爱好并介绍自己。国籍、年龄和身高取自个人资料。", "爱好", "请至少选择一个爱好。", "请再多写一点自我介绍。", "还剩{n}分钟", "旅行|音乐|动漫|电视剧·电影|游戏|运动|烹饪|咖啡·美食|摄影|阅读|时尚|语言学习"],
  "zh-TW": ["分類", "自由", "1小時", "自我介紹", "這則貼文1小時後消失。", "選擇興趣並介紹自己。國籍、年齡和身高取自個人檔案。", "興趣", "請至少選擇一個興趣。", "請再多寫一點自我介紹。", "還剩{n}分鐘", "旅行|音樂|動漫|戲劇·電影|遊戲|運動|料理|咖啡·美食|攝影|閱讀|時尚|語言學習"],
  fr: ["Catégorie", "Libre", "1 heure", "Présentation", "Cette publication disparaît au bout d’une heure.", "Choisissez vos loisirs et présentez-vous. Pays, âge et taille viennent de votre profil.", "Loisirs", "Choisissez au moins un loisir.", "Écrivez-en un peu plus sur vous.", "{n} min restantes", "Voyages|Musique|Dessins animés|Séries et films|Jeux|Sport|Cuisine|Cafés et restos|Photo|Lecture|Mode|Langues"],
  de: ["Kategorie", "Frei", "1 Stunde", "Über mich", "Dieser Beitrag verschwindet nach einer Stunde.", "Wähle deine Hobbys und stell dich vor. Land, Alter und Größe kommen aus deinem Profil.", "Hobbys", "Wähle mindestens ein Hobby.", "Schreib ein bisschen mehr über dich.", "Noch {n} Min.", "Reisen|Musik|Animes|Serien & Filme|Spiele|Sport|Kochen|Cafés & Essen|Fotografie|Lesen|Mode|Sprachen"],
  es: ["Categoría", "Libre", "1 hora", "Presentación", "Esta publicación desaparece al cabo de una hora.", "Elige tus aficiones y preséntate. País, edad y estatura salen de tu perfil.", "Aficiones", "Elige al menos una afición.", "Escribe un poco más sobre ti.", "Quedan {n} min", "Viajes|Música|Animes|Series y cine|Videojuegos|Deporte|Cocina|Cafés y comida|Fotografía|Lectura|Moda|Idiomas"],
  pt: ["Categoria", "Livre", "1 hora", "Apresentação", "Esta publicação some depois de uma hora.", "Escolha seus hobbies e se apresente. País, idade e altura vêm do seu perfil.", "Passatempos", "Escolha pelo menos um hobby.", "Escreva um pouco mais sobre você.", "Faltam {n} min", "Viagens|Música|Animes|Séries e filmes|Jogos|Esportes|Culinária|Cafés e comida|Fotografia|Leitura|Moda|Idiomas"],
  it: ["Categoria", "Libero", "1 ora", "Presentazione", "Questo post sparisce dopo un’ora.", "Scegli i tuoi hobby e presentati. Paese, età e altezza vengono dal tuo profilo.", "Hobby", "Scegli almeno un hobby.", "Scrivi qualcosa in più su di te.", "{n} min rimasti", "Viaggi|Musica|Cartoni e anime|Serie e film|Giochi|Sport|Cucina|Caffè e cibo|Fotografia|Lettura|Moda|Lingue"],
  ru: ["Категория", "Свободная", "1 час", "О себе", "Эта запись исчезнет через час.", "Выберите увлечения и расскажите о себе. Страна, возраст и рост берутся из профиля.", "Увлечения", "Выберите хотя бы одно увлечение.", "Напишите о себе чуть больше.", "Осталось {n} мин", "Путешествия|Музыка|Аниме|Сериалы и кино|Игры|Спорт|Кулинария|Кафе и еда|Фотография|Чтение|Мода|Языки"],
  ar: ["الفئة", "حر", "ساعة واحدة", "تعريف بنفسي", "يختفي هذا المنشور بعد ساعة.", "اختر هواياتك وعرّف بنفسك. البلد والعمر والطول من ملفك الشخصي.", "الهوايات", "اختر هواية واحدة على الأقل.", "اكتب قليلًا أكثر عن نفسك.", "بقي {n} دقيقة", "السفر|الموسيقى|الأنمي|الدراما والأفلام|الألعاب|الرياضة|الطبخ|المقاهي والطعام|التصوير|القراءة|الموضة|اللغات"],
  hi: ["श्रेणी", "मुक्त", "1 घंटा", "अपना परिचय", "यह पोस्ट एक घंटे बाद हट जाती है।", "अपने शौक चुनें और अपना परिचय दें। देश, उम्र और लंबाई प्रोफ़ाइल से आती है।", "शौक", "कम से कम एक शौक चुनें।", "अपने बारे में थोड़ा और लिखें।", "{n} मिनट बाकी", "यात्रा|संगीत|ऐनिमे|ड्रामा और फ़िल्में|गेम|खेल|खाना बनाना|कैफ़े और खाना|फ़ोटोग्राफ़ी|पढ़ना|फ़ैशन|भाषाएँ"],
  th: ["หมวดหมู่", "อิสระ", "1 ชั่วโมง", "แนะนำตัว", "โพสต์นี้จะหายไปหลัง 1 ชั่วโมง", "เลือกงานอดิเรกแล้วแนะนำตัว ประเทศ อายุ และส่วนสูงมาจากโปรไฟล์", "งานอดิเรก", "เลือกงานอดิเรกอย่างน้อยหนึ่งอย่าง", "เขียนเกี่ยวกับตัวคุณอีกนิด", "เหลือ {n} นาที", "ท่องเที่ยว|ดนตรี|อนิเมะ|ซีรีส์และหนัง|เกม|กีฬา|ทำอาหาร|คาเฟ่และของกิน|ถ่ายรูป|อ่านหนังสือ|แฟชั่น|ภาษา"],
  vi: ["Danh mục", "Tự do", "1 giờ", "Giới thiệu bản thân", "Bài đăng này biến mất sau một giờ.", "Chọn sở thích và giới thiệu bản thân. Quốc gia, tuổi và chiều cao lấy từ hồ sơ.", "Sở thích", "Hãy chọn ít nhất một sở thích.", "Hãy viết thêm một chút về bạn.", "Còn {n} phút", "Du lịch|Âm nhạc|Hoạt hình|Phim & phim bộ|Trò chơi|Thể thao|Nấu ăn|Cà phê & ẩm thực|Nhiếp ảnh|Đọc sách|Thời trang|Ngoại ngữ"],
};

function build(row: Row): PostCategoryCopy {
  const names = row[10].split("|");
  return {
    label: row[0],
    categories: { free: row[1], hour: row[2], intro: row[3] },
    hourHint: row[4],
    introHint: row[5],
    hobbiesLabel: row[6],
    needHobby: row[7],
    needText: row[8],
    minutesLeft: row[9],
    hobbies: Object.fromEntries(POST_HOBBIES.map((hobby, index) => [hobby, names[index] ?? hobby])) as Record<PostHobby, string>,
  };
}

export function resolvePostCategoryCopy(rawLocale: string): PostCategoryCopy {
  const locale = resolvePrimaryUiLocaleTag(rawLocale) ?? "en";
  return build(ROWS[locale] ?? ROWS.en);
}
