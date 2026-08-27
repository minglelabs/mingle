-- Idempotently repairs Royce's signup welcome room, message, translations,
-- and unread cursor for completed signup accounts created after the affected
-- deployment. Anonymous tracking records are intentionally excluded. Native
-- OAuth bridge accounts may not have an auth_accounts or password row, so the
-- registered-user check also accepts non-anonymous external user IDs/emails.
--
-- Review royce-welcome-diagnostic.sql first. This script does not send
-- WebSocket or push notifications; clients will see repaired data on their
-- next hydration. Adjust signup_cutoff before another repair window.
DO $$
DECLARE
  v_translation_catalog jsonb;
  v_royce_user_id CONSTANT text := 'cmsrqesom0000mx1hn62ce6r9';
  v_signup_cutoff CONSTANT timestamptz := TIMESTAMPTZ '2026-08-27 15:07:00+09';
  v_welcome_client_message_id CONSTANT text := 'mingle-welcome-royce-v1';
  v_welcome_source_text CONSTANT text := 'Welcome! My name is Royce. I''m developer of Mingle. If you have any feedback or questions, feel free to message me anytime on Mingle. The cat in the photo is Somi, my cat.';
  v_candidate record;
  v_room record;
  v_royce_user record;
  v_message_id text;
  v_channel_id text;
  v_session_key text;
  v_sequence_number integer;
  v_selected_languages text[];
  v_royce_selected_languages text[];
  v_translation_languages text[];
  v_display_language text;
  v_royce_display_language text;
  v_source_exists boolean;
  v_needs_repair boolean;
  v_raw_language text;
  v_translated_text text;
BEGIN
  WITH translation_catalog(language, text) AS (
    VALUES
    ('ko', '환영합니다! 제 이름은 Royce입니다. 저는 Mingle의 개발자입니다. 의견이나 질문이 있으면 언제든지 Mingle에서 편하게 메시지를 보내 주세요. 사진 속 고양이는 제 고양이 Somi입니다.'),
    ('ja', 'ようこそ！私の名前はRoyceです。Mingleの開発者です。ご意見やご質問があれば、いつでもMingleで気軽にメッセージを送ってください。写真の猫はSomi、私の猫です。'),
    ('zh-CN', '欢迎！我叫 Royce，是 Mingle 的开发者。如果你有任何反馈或问题，欢迎随时在 Mingle 上给我发消息。照片里的猫是 Somi，我的猫。'),
    ('zh-TW', '歡迎！我叫 Royce，是 Mingle 的開發者。如果你有任何回饋或問題，歡迎隨時在 Mingle 上傳訊息給我。照片裡的貓是 Somi，我的貓。'),
    ('fr', 'Bienvenue ! Je m''appelle Royce. Je suis le développeur de Mingle. Si vous avez des commentaires ou des questions, n''hésitez pas à m''envoyer un message à tout moment sur Mingle. Le chat sur la photo s''appelle Somi, c''est mon chat.'),
    ('de', 'Willkommen! Ich heiße Royce. Ich bin der Entwickler von Mingle. Wenn du Feedback oder Fragen hast, kannst du mir jederzeit gerne auf Mingle schreiben. Die Katze auf dem Foto ist Somi, meine Katze.'),
    ('es', '¡Bienvenido! Me llamo Royce. Soy el desarrollador de Mingle. Si tienes comentarios o preguntas, no dudes en escribirme en cualquier momento por Mingle. El gato de la foto es Somi, mi gato.'),
    ('pt', 'Boas-vindas! Meu nome é Royce. Sou o desenvolvedor do Mingle. Se você tiver algum comentário ou pergunta, sinta-se à vontade para me enviar uma mensagem a qualquer momento pelo Mingle. O gato da foto é o Somi, meu gato.'),
    ('it', 'Benvenuto! Mi chiamo Royce. Sono lo sviluppatore di Mingle. Se hai feedback o domande, non esitare a scrivermi in qualsiasi momento su Mingle. Il gatto nella foto è Somi, il mio gatto.'),
    ('ru', 'Добро пожаловать! Меня зовут Ройс. Я разработчик Mingle. Если у вас есть отзывы или вопросы, не стесняйтесь написать мне в Mingle в любое время. На фото Соми — моя кошка.'),
    ('ar', 'مرحبًا! اسمي رويس. أنا مطوّر Mingle. إذا كانت لديك أي ملاحظات أو أسئلة، فلا تتردد في مراسلتي في أي وقت عبر Mingle. القطة في الصورة هي سومي، قطتي.'),
    ('af', 'Welkom! My naam is Royce. Ek is die ontwikkelaar van Mingle. As jy enige terugvoer of vrae het, stuur gerus enige tyd vir my ’n boodskap op Mingle. Die kat op die foto is Somi, my kat.'),
    ('sq', 'Mirë se erdhe! Quhem Royce. Jam zhvilluesi i Mingle. Nëse ke ndonjë koment ose pyetje, mos ngurro të më dërgosh mesazh në Mingle kurdo. Macja në foto është Somi, macja ime.'),
    ('az', 'Xoş gəlmisiniz! Mənim adım Royce-dur. Mən Mingle-ın tərtibatçısıyam. Hər hansı rəyiniz və ya sualınız varsa, istənilən vaxt Mingle-da mənə yazmaqdan çəkinməyin. Şəkildəki pişik mənim pişiyim Somidir.'),
    ('eu', 'Ongi etorri! Royce dut izena. Mingle-ren garatzailea naiz. Edozein iruzkin edo galdera baduzu, lasai bidali mezu bat noiznahi Mingle-n. Argazkiko katua Somi da, nire katua.'),
    ('be', 'Вітаю! Мяне завуць Ройс. Я распрацоўшчык Mingle. Калі ў вас ёсць водгукі ці пытанні, не саромейцеся напісаць мне ў Mingle у любы час. Котка на фота — Сомі, мая котка.'),
    ('bn', 'স্বাগতম! আমার নাম রয়েস। আমি Mingle-এর ডেভেলপার। আপনার কোনো মতামত বা প্রশ্ন থাকলে, Mingle-এ যেকোনো সময় আমাকে বার্তা পাঠাতে দ্বিধা করবেন না। ছবির বিড়ালটি সোমি, আমার বিড়াল।'),
    ('bs', 'Dobro došli! Zovem se Royce. Ja sam programer Mingle-a. Ako imate povratne informacije ili pitanja, slobodno mi se javite porukom na Mingle-u u bilo kojem trenutku. Mačka na fotografiji je Somi, moja mačka.'),
    ('bg', 'Добре дошли! Казвам се Ройс. Аз съм разработчикът на Mingle. Ако имате отзиви или въпроси, не се колебайте да ми пишете по всяко време в Mingle. Котката на снимката е Соми, моята котка.'),
    ('ca', 'Hola! Em dic Royce. Soc el desenvolupador de Mingle. Si tens algun comentari o pregunta, no dubtis a escriure''m en qualsevol moment a Mingle. El gat de la foto és Somi, el meu gat.'),
    ('hr', 'Dobro došli! Zovem se Royce. Ja sam programer Minglea. Ako imate povratne informacije ili pitanja, slobodno mi se javite porukom na Mingleu u bilo kojem trenutku. Mačka na fotografiji je Somi, moja mačka.'),
    ('cs', 'Vítejte! Jmenuji se Royce. Jsem vývojář Mingle. Pokud máte jakékoli připomínky nebo dotazy, kdykoli mi můžete napsat na Mingle. Kočka na fotografii je Somi, moje kočka.'),
    ('da', 'Velkommen! Jeg hedder Royce. Jeg er udvikleren bag Mingle. Hvis du har feedback eller spørgsmål, er du altid velkommen til at skrive til mig på Mingle. Katten på billedet er Somi, min kat.'),
    ('nl', 'Welkom! Mijn naam is Royce. Ik ben de ontwikkelaar van Mingle. Als je feedback of vragen hebt, stuur me dan gerust op elk moment een berichtje via Mingle. De kat op de foto is Somi, mijn kat.'),
    ('et', 'Tere tulemast! Minu nimi on Royce. Olen Mingle''i arendaja. Kui sul on tagasisidet või küsimusi, kirjuta mulle julgelt igal ajal Mingle''is. Pildil olev kass on Somi, minu kass.'),
    ('fi', 'Tervetuloa! Nimeni on Royce. Olen Minglen kehittäjä. Jos sinulla on palautetta tai kysymyksiä, lähetä minulle rohkeasti viesti Minglessä milloin tahansa. Kuvassa oleva kissa on Somi, minun kissani.'),
    ('gl', 'Benvido! Chámome Royce. Son o desenvolvedor de Mingle. Se tes algún comentario ou pregunta, non dubides en enviarme unha mensaxe en calquera momento en Mingle. O gato da foto é Somi, o meu gato.'),
    ('el', 'Καλώς ήρθες! Με λένε Royce. Είμαι ο δημιουργός του Mingle. Αν έχεις σχόλια ή ερωτήσεις, μη διστάσεις να μου στείλεις μήνυμα στο Mingle οποιαδήποτε στιγμή. Η γάτα στη φωτογραφία είναι η Somi, η γάτα μου.'),
    ('gu', 'સ્વાગત છે! મારું નામ રોયસ છે. હું Mingleનો ડેવલપર છું. જો તમારી પાસે કોઈ પ્રતિસાદ અથવા પ્રશ્નો હોય, તો Mingle પર કોઈપણ સમયે મને સંદેશ મોકલવામાં સંકોચ ન કરશો. ફોટામાં દેખાતી બિલાડી સોમી છે, મારી બિલાડી.'),
    ('he', 'ברוכים הבאים! שמי רויס. אני המפתח של Mingle. אם יש לכם משוב או שאלות, אתם מוזמנים לשלוח לי הודעה ב-Mingle בכל עת. החתולה שבתמונה היא סומי, החתולה שלי.'),
    ('hi', 'स्वागत है! मेरा नाम रॉयस है। मैं Mingle का डेवलपर हूँ। अगर आपके पास कोई प्रतिक्रिया या सवाल है, तो बेझिझक Mingle पर कभी भी मुझे संदेश भेजें। तस्वीर में जो बिल्ली है, वह सोमी है, मेरी बिल्ली।'),
    ('hu', 'Üdvözöllek! Royce vagyok. Én fejlesztem a Minglet. Ha van visszajelzésed vagy kérdésed, bármikor nyugodtan írj nekem a Minglen. A képen látható macska Somi, az én macskám.'),
    ('id', 'Selamat datang! Nama saya Royce. Saya adalah pengembang Mingle. Jika Anda memiliki masukan atau pertanyaan, jangan ragu untuk mengirimi saya pesan kapan saja di Mingle. Kucing di foto itu adalah Somi, kucing saya.'),
    ('kn', 'ಸ್ವಾಗತ! ನನ್ನ ಹೆಸರು ರಾಯ್ಸ್. ನಾನು Mingle ನ ಡೆವಲಪರ್. ನಿಮ್ಮಲ್ಲಿ ಯಾವುದೇ ಪ್ರತಿಕ್ರಿಯೆ ಅಥವಾ ಪ್ರಶ್ನೆಗಳಿದ್ದರೆ, Mingle ನಲ್ಲಿ ಯಾವಾಗ ಬೇಕಾದರೂ ನನಗೆ ಸಂದೇಶ ಕಳುಹಿಸಲು ಹಿಂಜರಿಯಬೇಡಿ. ಫೋಟೋದಲ್ಲಿರುವ ಬೆಕ್ಕು Somi, ನನ್ನ ಬೆಕ್ಕು.'),
    ('kk', 'Қош келдіңіз! Менің атым Ройс. Мен Mingle әзірлеушісімін. Пікіріңіз немесе сұрағыңыз болса, кез келген уақытта Mingle арқылы маған хабарлама жазудан тартынбаңыз. Суреттегі мысық — менің мысығым Соми.'),
    ('th', 'ยินดีต้อนรับ! ผมชื่อ Royce และเป็นผู้พัฒนา Mingle หากคุณมีข้อเสนอแนะหรือคำถาม โปรดส่งข้อความหาผมได้ทุกเมื่อบน Mingle แมวในรูปคือ Somi แมวของผม'),
    ('lv', 'Laipni lūdzam! Mani sauc Royce. Es esmu Mingle izstrādātājs. Ja jums ir atsauksmes vai jautājumi, droši rakstiet man jebkurā laikā Mingle. Fotoattēlā redzamais kaķis ir Somi, mans kaķis.'),
    ('lt', 'Sveiki! Mano vardas Royce. Esu „Mingle“ kūrėjas. Jei turite atsiliepimų ar klausimų, drąsiai parašykite man bet kada per „Mingle“. Nuotraukoje esanti katė yra Somi, mano katė.'),
    ('mk', 'Добредојдовте! Јас сум Ројс. Јас сум развивачот на Mingle. Ако имате повратни информации или прашања, слободно испратете ми порака во Mingle во секое време. Мачката на фотографијата е Соми, мојата мачка.'),
    ('ms', 'Selamat datang! Nama saya Royce. Saya ialah pembangun Mingle. Jika anda mempunyai sebarang maklum balas atau soalan, jangan teragak-agak untuk menghantar mesej kepada saya pada bila-bila masa di Mingle. Kucing dalam gambar itu ialah Somi, kucing saya.'),
    ('ml', 'സ്വാഗതം! എന്റെ പേര് റോയ്‌സ്. ഞാൻ Mingle-ന്റെ ഡെവലപ്പറാണ്. നിങ്ങൾക്ക് എന്തെങ്കിലും അഭിപ്രായങ്ങളോ ചോദ്യങ്ങളോ ഉണ്ടെങ്കിൽ, എപ്പോൾ വേണമെങ്കിലും Mingle-ൽ എനിക്ക് സന്ദേശം അയയ്ക്കാൻ മടിക്കേണ്ടതില്ല. ചിത്രത്തിലുള്ള പൂച്ച Somi, എന്റെ പൂച്ചയാണ്.'),
    ('mr', 'स्वागत आहे! माझे नाव रॉयस आहे. मी Mingleचा डेव्हलपर आहे. तुमच्याकडे काही अभिप्राय किंवा प्रश्न असल्यास, Mingle वर कधीही मला संदेश पाठवायला अजिबात संकोच करू नका. फोटोतील मांजर Somi आहे, माझे मांजर.'),
    ('no', 'Velkommen! Jeg heter Royce. Jeg er utvikleren av Mingle. Hvis du har tilbakemeldinger eller spørsmål, må du gjerne sende meg en melding på Mingle når som helst. Katten på bildet er Somi, katten min.'),
    ('fa', 'خوش آمدید! نام من رویس است. من توسعه‌دهندهٔ Mingle هستم. اگر بازخورد یا سؤالی دارید، هر زمان خواستید در Mingle برایم پیام بفرستید. گربهٔ داخل عکس سومی است، گربهٔ من.'),
    ('pl', 'Witaj! Mam na imię Royce. Jestem twórcą Mingle. Jeśli masz uwagi lub pytania, śmiało napisz do mnie w dowolnym momencie na Mingle. Kot na zdjęciu to Somi, mój kot.'),
    ('pa', 'ਜੀ ਆਇਆਂ ਨੂੰ! ਮੇਰਾ ਨਾਮ ਰੌਇਸ ਹੈ। ਮੈਂ Mingle ਦਾ ਡਿਵੈਲਪਰ ਹਾਂ। ਜੇ ਤੁਹਾਡੇ ਕੋਲ ਕੋਈ ਸੁਝਾਅ ਜਾਂ ਸਵਾਲ ਹਨ, ਤਾਂ Mingle ''ਤੇ ਕਿਸੇ ਵੀ ਸਮੇਂ ਮੈਨੂੰ ਸੁਨੇਹਾ ਭੇਜਣ ਤੋਂ ਨਾ ਝਿਜਕੋ। ਤਸਵੀਰ ਵਿੱਚ ਬਿੱਲੀ Somi ਹੈ, ਮੇਰੀ ਬਿੱਲੀ।'),
    ('ro', 'Bun venit! Mă numesc Royce. Sunt dezvoltatorul Mingle. Dacă ai feedback sau întrebări, nu ezita să-mi trimiți un mesaj oricând pe Mingle. Pisica din fotografie este Somi, pisica mea.'),
    ('sr', 'Dobro došli! Zovem se Royce. Ja sam programer Mingle-a. Ako imate povratne informacije ili pitanja, slobodno mi pošaljite poruku na Mingle-u u bilo kom trenutku. Mačka na fotografiji je Somi, moja mačka.'),
    ('sk', 'Vitajte! Volám sa Royce. Som vývojárom Mingle. Ak máte pripomienky alebo otázky, pokojne mi kedykoľvek napíšte na Mingle. Mačka na fotografii je Somi, moja mačka.'),
    ('sl', 'Dobrodošli! Ime mi je Royce. Sem razvijalec Mingle. Če imate kakršne koli povratne informacije ali vprašanja, mi lahko kadar koli pišete na Mingle. Mačka na fotografiji je Somi, moja mačka.'),
    ('sw', 'Karibu! Jina langu ni Royce. Mimi ndiye msanidi wa Mingle. Ikiwa una maoni au maswali yoyote, jisikie huru kunitumia ujumbe wakati wowote kwenye Mingle. Paka aliye kwenye picha ni Somi, paka wangu.'),
    ('sv', 'Välkommen! Jag heter Royce. Jag är utvecklaren bakom Mingle. Om du har feedback eller frågor får du gärna skicka ett meddelande till mig när som helst på Mingle. Katten på bilden är Somi, min katt.'),
    ('tl', 'Maligayang pagdating! Royce ang pangalan ko. Ako ang developer ng Mingle. Kung mayroon kang feedback o mga tanong, huwag mag-atubiling magpadala sa akin ng mensahe anumang oras sa Mingle. Si Somi ang pusang nasa larawan, ang pusa ko.'),
    ('ta', 'வரவேற்கிறேன்! என் பெயர் ராய்ஸ். நான் Mingle-ன் டெவலப்பர். உங்களிடம் கருத்துகள் அல்லது கேள்விகள் இருந்தால், எப்போது வேண்டுமானாலும் Mingle-ல் எனக்கு செய்தி அனுப்பத் தயங்க வேண்டாம். படத்தில் இருப்பது Somi, என் பூனை.'),
    ('te', 'స్వాగతం! నా పేరు రాయిస్. నేను Mingle డెవలపర్‌ను. మీకు ఏవైనా అభిప్రాయాలు లేదా ప్రశ్నలు ఉంటే, ఎప్పుడైనా Mingleలో నాకు సందేశం పంపడానికి సంకోచించకండి. ఫోటోలో ఉన్న పిల్లి Somi, నా పిల్లి.'),
    ('tr', 'Hoş geldin! Benim adım Royce. Mingle''ın geliştiricisiyim. Geri bildirimin veya soruların varsa, Mingle üzerinden istediğin zaman bana mesaj göndermekten çekinme. Fotoğraftaki kedi Somi, benim kedim.'),
    ('uk', 'Ласкаво просимо! Мене звати Ройс. Я розробник Mingle. Якщо у вас є відгуки чи запитання, не соромтеся будь-коли написати мені в Mingle. На фото Сомі — моя кішка.'),
    ('ur', 'خوش آمدید! میرا نام روئس ہے۔ میں Mingle کا ڈویلپر ہوں۔ اگر آپ کے پاس کوئی رائے یا سوال ہو تو بلا جھجھک کسی بھی وقت Mingle پر مجھے پیغام بھیجیں۔ تصویر میں موجود بلی سومِی ہے، میری بلی۔'),
    ('vi', 'Chào mừng bạn! Tôi tên là Royce. Tôi là nhà phát triển của Mingle. Nếu bạn có bất kỳ phản hồi hoặc câu hỏi nào, hãy cứ nhắn tin cho tôi bất cứ lúc nào trên Mingle. Chú mèo trong ảnh là Somi, mèo của tôi.'),
    ('cy', 'Croeso! Royce yw fy enw i. Fi yw datblygwr Mingle. Os oes gennych unrhyw adborth neu gwestiynau, mae croeso i chi anfon neges ataf unrhyw bryd ar Mingle. Somi yw’r gath yn y llun, fy nghath i.')
  )
  SELECT jsonb_object_agg(language, text)
  INTO v_translation_catalog
  FROM translation_catalog;

  -- The catalog is kept in this anonymous block's memory instead of a
  -- temporary table, so SQL consoles that use a new session per statement
  -- cannot lose it between queries.
  SELECT
    u.default_conversation_languages,
    u.default_display_language
  INTO v_royce_user
  FROM app.app_users AS u
  WHERE u.id = v_royce_user_id
    AND u.is_active
    AND u.is_deleted IS NOT TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Royce account % is missing or inactive', v_royce_user_id;
  END IF;

  v_royce_selected_languages := COALESCE(
    NULLIF(v_royce_user.default_conversation_languages, ARRAY[]::text[]),
    ARRAY['en', 'ko', 'ja']::text[]
  );
  v_royce_display_language := CASE
    WHEN lower(btrim(COALESCE(v_royce_user.default_display_language, ''))) = 'zh'
      THEN 'zh-CN'
    ELSE NULLIF(btrim(COALESCE(v_royce_user.default_display_language, '')), '')
  END;

  FOR v_candidate IN
    SELECT
      u.id,
      u.name,
      u.default_conversation_languages,
      u.default_display_language
    FROM app.app_users AS u
    WHERE u.id <> v_royce_user_id
      AND u.created_at >= v_signup_cutoff
      AND u.is_active
      AND u.is_deleted IS NOT TRUE
      AND (
        u.password_hash IS NOT NULL
        OR u.email IS NOT NULL
        OR (
          u.external_user_id IS NOT NULL
          AND u.external_user_id !~* '^anon_'
        )
        OR EXISTS (
          SELECT 1
          FROM app.auth_accounts AS account
          WHERE account.user_id = u.id
        )
      )
    ORDER BY u.created_at, u.id
  LOOP
    PERFORM pg_advisory_xact_lock(
      hashtextextended('mingle:royce-welcome:' || v_candidate.id, 0)
    );

    IF EXISTS (
      SELECT 1
      FROM app.app_user_blocks AS b
      WHERE (b.blocker_id = v_candidate.id AND b.blocked_id = v_royce_user_id)
         OR (b.blocker_id = v_royce_user_id AND b.blocked_id = v_candidate.id)
    ) THEN
      RAISE NOTICE 'Skipped blocked signup account % (%)', v_candidate.id, v_candidate.name;
      CONTINUE;
    END IF;

    v_selected_languages := v_candidate.default_conversation_languages;
    IF v_selected_languages IS NULL OR cardinality(v_selected_languages) = 0 THEN
      v_selected_languages := ARRAY['en', 'ko', 'ja']::text[];
    END IF;

    -- Normalize the legacy zh code and discard values outside the supported
    -- hard-coded translation catalog while preserving the user's order.
    v_selected_languages := ARRAY(
      WITH translation_catalog AS (
        SELECT key AS language, value AS text
        FROM jsonb_each_text(v_translation_catalog)
      )
      SELECT normalized
      FROM (
        SELECT DISTINCT ON (normalized) normalized, ordinal
        FROM (
          SELECT
            CASE
              WHEN lower(btrim(raw_value)) = 'zh' THEN 'zh-CN'
              ELSE btrim(raw_value)
            END AS normalized,
            ordinal
          FROM unnest(v_selected_languages) WITH ORDINALITY AS raw(raw_value, ordinal)
        ) AS normalized_values
        WHERE normalized = 'en'
           OR EXISTS (
             SELECT 1
             FROM translation_catalog AS t
             WHERE t.language = normalized
           )
        ORDER BY normalized, ordinal
      ) AS deduplicated
      ORDER BY ordinal
    );
    IF v_selected_languages IS NULL OR cardinality(v_selected_languages) = 0 THEN
      v_selected_languages := ARRAY['en', 'ko', 'ja']::text[];
    END IF;

    v_translation_languages := ARRAY(
      WITH translation_catalog AS (
        SELECT key AS language, value AS text
        FROM jsonb_each_text(v_translation_catalog)
      )
      SELECT t.language
      FROM translation_catalog AS t
      WHERE t.language = ANY(v_selected_languages)
      ORDER BY array_position(v_selected_languages, t.language)
    );
    v_display_language := CASE
      WHEN lower(btrim(COALESCE(v_candidate.default_display_language, ''))) = 'zh'
        THEN 'zh-CN'
      ELSE NULLIF(btrim(COALESCE(v_candidate.default_display_language, '')), '')
    END;
    IF v_display_language IS NULL OR NOT (v_display_language = ANY(v_selected_languages)) THEN
      v_display_language := NULL;
    END IF;

    -- Match the application's exact direct-room rule: either two active
    -- members and no pending invitees, or one owner plus the other pending.
    WITH channel_state AS (
      SELECT
        c.id AS channel_id,
        c.owner_user_id,
        c.session_key,
        c.status,
        c.paused_at,
        c.created_at,
        COALESCE(c.pending_invitee_user_ids, ARRAY[]::text[]) AS pending_invitee_user_ids,
        COALESCE(
          ARRAY_AGG(m.user_id ORDER BY m.user_id) FILTER (WHERE m.left_at IS NULL),
          ARRAY[]::text[]
        ) AS active_member_ids
      FROM app.app_conversation_channels AS c
      LEFT JOIN app.app_conversation_channel_members AS m
        ON m.channel_id = c.id
      WHERE c.is_deleted IS NOT TRUE
      GROUP BY
        c.id,
        c.owner_user_id,
        c.session_key,
        c.status,
        c.paused_at,
        c.created_at,
        c.pending_invitee_user_ids
    )
    SELECT
      cs.channel_id,
      cs.owner_user_id,
      cs.session_key,
      cs.status,
      cs.paused_at,
      cs.created_at,
      cs.pending_invitee_user_ids,
      cs.active_member_ids
    INTO v_room
    FROM channel_state AS cs
    WHERE (
      CARDINALITY(cs.active_member_ids) = 2
      AND cs.active_member_ids @> ARRAY[v_candidate.id, v_royce_user_id]::text[]
      AND CARDINALITY(cs.pending_invitee_user_ids) = 0
    ) OR (
      CARDINALITY(cs.active_member_ids) = 1
      AND CARDINALITY(cs.pending_invitee_user_ids) = 1
      AND (
        (
          cs.owner_user_id = v_candidate.id
          AND cs.active_member_ids @> ARRAY[v_candidate.id]::text[]
          AND cs.pending_invitee_user_ids @> ARRAY[v_royce_user_id]::text[]
        ) OR (
          cs.owner_user_id = v_royce_user_id
          AND cs.active_member_ids @> ARRAY[v_royce_user_id]::text[]
          AND cs.pending_invitee_user_ids @> ARRAY[v_candidate.id]::text[]
        )
      )
    )
    ORDER BY EXISTS (
      SELECT 1
      FROM app.app_messages AS existing_welcome
      WHERE existing_welcome.session_key = cs.session_key
        AND existing_welcome.user_id = v_royce_user_id
        AND existing_welcome.client_message_id = v_welcome_client_message_id
        AND existing_welcome.is_deleted IS NOT TRUE
    ) DESC, cs.created_at DESC, cs.channel_id DESC
    LIMIT 1;

    IF FOUND THEN
      v_channel_id := v_room.channel_id;
      v_session_key := v_room.session_key;
    ELSE
      -- Keep a deterministic key so a rerun cannot create another room for
      -- the same account. The advisory lock prevents sequence races here.
      v_channel_id := 'royce-welcome-repair-channel-' || md5(v_candidate.id);
      v_session_key := 'royce-welcome-repair-session-' || md5(v_candidate.id);

      SELECT COALESCE(MAX(c.sequence_number), 0) + 1
      INTO v_sequence_number
      FROM app.app_conversation_channels AS c
      WHERE c.owner_user_id = v_candidate.id;

      SELECT
        c.id AS channel_id,
        c.owner_user_id,
        c.session_key,
        c.status,
        c.paused_at,
        c.created_at,
        COALESCE(c.pending_invitee_user_ids, ARRAY[]::text[]) AS pending_invitee_user_ids,
        ARRAY[]::text[] AS active_member_ids
      INTO v_room
      FROM app.app_conversation_channels AS c
      WHERE c.session_key = v_session_key;

      IF NOT FOUND THEN
        LOOP
          INSERT INTO app.app_conversation_channels (
            id,
            owner_user_id,
            sequence_number,
            title,
            is_deleted,
            status,
            session_key,
            selected_languages,
            speech_languages,
            translation_languages_linked,
            default_display_language,
            paused_at,
            pending_invitee_user_ids,
            created_at,
            updated_at
          )
          VALUES (
            v_channel_id,
            v_candidate.id,
            v_sequence_number,
            'Conversation ' || v_sequence_number,
            false,
            'paused',
            v_session_key,
            v_selected_languages,
            v_selected_languages,
            true,
            NULL,
            now(),
            ARRAY[v_royce_user_id]::text[],
            now(),
            now()
          )
          ON CONFLICT (owner_user_id, sequence_number) DO NOTHING;

          SELECT
            c.id AS channel_id,
            c.owner_user_id,
            c.session_key,
            c.status,
            c.paused_at,
            c.created_at,
            COALESCE(c.pending_invitee_user_ids, ARRAY[]::text[]) AS pending_invitee_user_ids,
            ARRAY[]::text[] AS active_member_ids
          INTO v_room
          FROM app.app_conversation_channels AS c
          WHERE c.session_key = v_session_key;

          EXIT WHEN FOUND;
          v_sequence_number := v_sequence_number + 1;
        END LOOP;
      END IF;
      v_channel_id := v_room.channel_id;
      v_session_key := v_room.session_key;
    END IF;

    -- Reuse existing member preferences. Only pending invitees are inserted
    -- or revived, matching materializePendingConversationInvitees behavior.
    IF v_room.pending_invitee_user_ids @> ARRAY[v_candidate.id]::text[] THEN
      INSERT INTO app.app_conversation_channel_members (
        id,
        channel_id,
        user_id,
        role,
        display_language,
        selected_languages,
        status,
        paused_at,
        last_read_at,
        left_at,
        joined_at
      )
      VALUES (
        'royce-welcome-repair-member-' || md5(v_channel_id || ':' || v_candidate.id),
        v_channel_id,
        v_candidate.id,
        CASE WHEN v_room.owner_user_id = v_candidate.id THEN 'owner' ELSE 'member' END,
        v_display_language,
        v_selected_languages,
        v_room.status,
        v_room.paused_at,
        NULL,
        NULL,
        now()
      )
      ON CONFLICT (channel_id, user_id) DO UPDATE
        SET left_at = NULL;
    ELSE
      INSERT INTO app.app_conversation_channel_members (
        id,
        channel_id,
        user_id,
        role,
        display_language,
        selected_languages,
        status,
        paused_at,
        last_read_at,
        left_at,
        joined_at
      )
      VALUES (
        'royce-welcome-repair-member-' || md5(v_channel_id || ':' || v_candidate.id),
        v_channel_id,
        v_candidate.id,
        CASE WHEN v_room.owner_user_id = v_candidate.id THEN 'owner' ELSE 'member' END,
        v_display_language,
        v_selected_languages,
        v_room.status,
        v_room.paused_at,
        NULL,
        NULL,
        now()
      )
      ON CONFLICT (channel_id, user_id) DO NOTHING;
    END IF;

    IF v_room.pending_invitee_user_ids @> ARRAY[v_royce_user_id]::text[] THEN
      INSERT INTO app.app_conversation_channel_members (
        id,
        channel_id,
        user_id,
        role,
        display_language,
        selected_languages,
        status,
        paused_at,
        last_read_at,
        left_at,
        joined_at
      )
      VALUES (
        'royce-welcome-repair-member-' || md5(v_channel_id || ':' || v_royce_user_id),
        v_channel_id,
        v_royce_user_id,
        CASE WHEN v_room.owner_user_id = v_royce_user_id THEN 'owner' ELSE 'member' END,
        CASE
          WHEN v_royce_display_language = ANY(v_royce_selected_languages)
            THEN v_royce_display_language
          ELSE NULL
        END,
        v_royce_selected_languages,
        v_room.status,
        v_room.paused_at,
        NULL,
        NULL,
        now()
      )
      ON CONFLICT (channel_id, user_id) DO UPDATE
        SET left_at = NULL;
    ELSE
      INSERT INTO app.app_conversation_channel_members (
        id,
        channel_id,
        user_id,
        role,
        display_language,
        selected_languages,
        status,
        paused_at,
        last_read_at,
        left_at,
        joined_at
      )
      VALUES (
        'royce-welcome-repair-member-' || md5(v_channel_id || ':' || v_royce_user_id),
        v_channel_id,
        v_royce_user_id,
        CASE WHEN v_room.owner_user_id = v_royce_user_id THEN 'owner' ELSE 'member' END,
        CASE
          WHEN v_royce_display_language = ANY(v_royce_selected_languages)
            THEN v_royce_display_language
          ELSE NULL
        END,
        v_royce_selected_languages,
        v_room.status,
        v_room.paused_at,
        NULL,
        NULL,
        now()
      )
      ON CONFLICT (channel_id, user_id) DO NOTHING;
    END IF;

    UPDATE app.app_conversation_channels AS c
    SET pending_invitee_user_ids = array_remove(
      array_remove(COALESCE(c.pending_invitee_user_ids, ARRAY[]::text[]), v_candidate.id),
      v_royce_user_id
    ),
    updated_at = now(),
    is_deleted = false
    WHERE c.id = v_channel_id;

    SELECT wm.id
    INTO v_message_id
    FROM app.app_messages AS wm
    WHERE wm.session_key = v_session_key
      AND wm.user_id = v_royce_user_id
      AND wm.client_message_id = v_welcome_client_message_id
    LIMIT 1;

    v_source_exists := false;
    IF v_message_id IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1
        FROM app.app_message_contents AS source_content
        WHERE source_content.message_id = v_message_id
          AND source_content.content_type = 'SOURCE'
          AND source_content.language = 'en'
          AND source_content.is_deleted IS NOT TRUE
          AND NULLIF(BTRIM(source_content.text), '') IS NOT NULL
      )
      INTO v_source_exists;
    END IF;

    v_needs_repair := v_room.pending_invitee_user_ids @> ARRAY[v_candidate.id]::text[]
      OR v_room.pending_invitee_user_ids @> ARRAY[v_royce_user_id]::text[]
      OR v_message_id IS NULL
      OR NOT v_source_exists
      OR EXISTS (
        SELECT 1
        FROM unnest(v_translation_languages) AS expected(language)
        WHERE NOT EXISTS (
          SELECT 1
          FROM app.app_message_contents AS existing_translation
          WHERE existing_translation.message_id = v_message_id
            AND existing_translation.content_type = 'TRANSLATION_FINAL'
            AND existing_translation.language = expected.language
            AND existing_translation.is_deleted IS NOT TRUE
            AND NULLIF(BTRIM(existing_translation.text), '') IS NOT NULL
        )
      );

    IF NOT v_needs_repair THEN
      CONTINUE;
    END IF;

    INSERT INTO app.app_messages (
      id,
      user_id,
      session_key,
      client_message_id,
      is_deleted,
      source_language,
      metadata,
      created_at,
      updated_at
    )
    VALUES (
      COALESCE(v_message_id, 'royce-welcome-repair-message-' || md5(v_session_key)),
      v_royce_user_id,
      v_session_key,
      v_welcome_client_message_id,
      false,
      'en',
      jsonb_build_object(
        'source', 'signup_welcome',
        'welcomeVersion', 2,
        'translationLanguages', to_jsonb(v_translation_languages)
      ),
      now(),
      now()
    )
    ON CONFLICT (session_key, client_message_id) DO UPDATE
      SET user_id = EXCLUDED.user_id,
          is_deleted = false,
          source_language = 'en',
          metadata = EXCLUDED.metadata,
          updated_at = now()
    RETURNING id INTO v_message_id;

    INSERT INTO app.app_message_contents (
      id,
      message_id,
      content_type,
      language,
      is_deleted,
      text,
      provider,
      model,
      created_at,
      updated_at
    )
    VALUES (
      'royce-welcome-repair-source-' || md5(v_message_id),
      v_message_id,
      'SOURCE',
      'en',
      false,
      v_welcome_source_text,
      NULL,
      NULL,
      now(),
      now()
    )
    ON CONFLICT (message_id, content_type, language) DO UPDATE
      SET is_deleted = false,
          text = EXCLUDED.text,
          updated_at = now();

    FOREACH v_raw_language IN ARRAY v_translation_languages
    LOOP
      WITH translation_catalog AS (
        SELECT key AS language, value AS text
        FROM jsonb_each_text(v_translation_catalog)
      )
      SELECT t.text
      INTO v_translated_text
      FROM translation_catalog AS t
      WHERE t.language = v_raw_language;

      INSERT INTO app.app_message_contents (
        id,
        message_id,
        content_type,
        language,
        is_deleted,
        text,
        provider,
        model,
        created_at,
        updated_at
      )
      VALUES (
        'royce-welcome-repair-translation-' || md5(v_message_id || ':' || v_raw_language),
        v_message_id,
        'TRANSLATION_FINAL',
        v_raw_language,
        false,
        v_translated_text,
        'hardcoded',
        'royce-welcome-v2',
        now(),
        now()
      )
      ON CONFLICT (message_id, content_type, language) DO UPDATE
        SET is_deleted = false,
            text = EXCLUDED.text,
            provider = EXCLUDED.provider,
            model = EXCLUDED.model,
            updated_at = now();
    END LOOP;

    UPDATE app.app_message_contents AS mc
    SET is_deleted = true,
        updated_at = now()
    WHERE mc.message_id = v_message_id
      AND mc.content_type = 'TRANSLATION_FINAL'
      AND mc.is_deleted IS NOT TRUE
      AND mc.language <> ALL(v_translation_languages);

    UPDATE app.app_conversation_channel_members AS member
    SET last_read_at = NULL
    WHERE member.channel_id = v_channel_id
      AND member.user_id = v_candidate.id
      AND member.left_at IS NULL;

    RAISE NOTICE 'Repaired Royce welcome for % (%) in %', v_candidate.id, v_candidate.name, v_session_key;
  END LOOP;
END $$;
