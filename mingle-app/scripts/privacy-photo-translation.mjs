// Localized privacy-policy copy for the conversation photo text feature.
// Keep this in the legal-doc generator source so regeneration preserves it.
export const PHOTO_TEXT_PRIVACY_COPY = {
  en: {
    heading: "Photo Text Processing in Conversations",
    paragraphs: [
      "When you send a photo in a conversation, Mingle stores it with the message in private cloud image storage provided by Cloudflare. When photo text translation is enabled, Mingle sends the photo to Google Gemini to identify visible text, its language, position, and visual style.",
      "Mingle sends the recognized text and its language information to Google Gemini to translate it into languages requested for the conversation. Google processes the photo and text sent to Gemini under its applicable service terms and privacy information.",
      "To display the translated text over the photo, Mingle stores the recognized text blocks, their detected positions and visual-style details, and generated translations in records linked to the photo message. These records are retained with the message as described below.",
    ],
    deletion: "Clearing conversation history marks messages and their text content as deleted and removes them from the ordinary conversation view. This action does not currently physically delete the stored photos or their separately stored OCR and translation records. Account withdrawal starts a 30-day recovery period; withdrawing an account does not currently remove its conversation messages, photos, OCR results, or translations. Those records may remain as needed to provide the Service, maintain security, resolve disputes, or meet legal requirements.",
  },
  ko: {
    heading: "대화 사진의 텍스트 처리",
    paragraphs: [
      "대화에서 사진을 보내면 Mingle은 Cloudflare가 제공하는 비공개 클라우드 이미지 저장소에 사진을 메시지와 함께 저장합니다. 사진 텍스트 번역 기능이 활성화된 경우, Mingle은 사진에서 보이는 텍스트와 언어, 위치 및 시각적 스타일을 인식하기 위해 사진을 Google Gemini에 전송합니다.",
      "Mingle은 인식된 텍스트와 언어 정보를 Google Gemini에 보내 대화에 요청된 언어로 번역합니다. Google은 Gemini로 전송된 사진과 텍스트를 해당 서비스 약관 및 개인정보 안내에 따라 처리합니다.",
      "사진 위에 번역을 표시하기 위해 Mingle은 인식된 텍스트 블록, 감지된 위치와 시각적 스타일 정보, 생성된 번역을 사진 메시지에 연결된 기록으로 저장합니다. 이 기록은 아래 설명처럼 메시지와 함께 보유됩니다.",
    ],
    deletion: "대화 기록을 비우면 메시지와 텍스트 콘텐츠가 삭제 표시되어 일반 대화 화면에서 보이지 않게 됩니다. 현재 이 작업은 저장된 사진이나 별도로 보관된 OCR·번역 기록을 실제로 삭제하지 않습니다. 계정 탈퇴 시 30일의 복구 기간이 시작되며, 현재 계정 탈퇴 절차는 해당 계정의 대화 메시지, 사진, OCR 결과 또는 번역을 삭제하지 않습니다. 서비스 제공, 보안 유지, 분쟁 해결 또는 법적 요구 사항을 위해 이러한 기록이 계속 보관될 수 있습니다.",
  },
  ja: {
    heading: "会話写真のテキスト処理",
    paragraphs: [
      "会話で写真を送信すると、Mingle は Cloudflare が提供する非公開クラウド画像ストレージに写真をメッセージとともに保存します。写真内テキストの翻訳機能が有効な場合、Mingle は写真内の文字、言語、位置、見た目のスタイルを認識するため、写真を Google Gemini に送信します。",
      "Mingle は認識した文字とその言語情報を Google Gemini に送信し、会話で指定された言語に翻訳します。Google は、Gemini に送信された写真とテキストを、適用されるサービス規約とプライバシー情報に従って処理します。",
      "写真上に翻訳を表示するため、Mingle は認識したテキストブロック、検出した位置と見た目の情報、および生成した翻訳を写真メッセージに関連付けて保存します。これらの記録は、以下の説明に従ってメッセージとともに保持されます。",
    ],
    deletion: "会話履歴を消去すると、メッセージとテキスト内容に削除済みの印が付き、通常の会話画面には表示されなくなります。現在、この操作では保存済みの写真や別途保存された OCR・翻訳記録は物理的に削除されません。アカウント退会を申請すると30日間の復旧期間が始まります。現在のアカウント退会手続きでは、関連する会話メッセージ、写真、OCR結果、翻訳は削除されません。サービスの提供、セキュリティの維持、紛争の解決、法的要件への対応に必要な範囲で、これらの記録が残る場合があります。",
  },
  "zh-CN": {
    heading: "对话照片中的文字处理",
    paragraphs: [
      "您在对话中发送照片时，Mingle 会将其与消息一起存储在由 Cloudflare 提供的私有云图片存储中。启用照片文字翻译后，Mingle 会将照片发送给 Google Gemini，以识别其中可见的文字、语言、位置和视觉样式。",
      "Mingle 会将识别出的文字及其语言信息发送给 Google Gemini，翻译成对话所需的语言。Google 会根据适用的服务条款和隐私说明处理发送给 Gemini 的照片和文字。",
      "为了在照片上显示译文，Mingle 会将识别出的文字块、检测到的位置和视觉样式信息以及生成的译文，存储为与照片消息关联的记录。下文所述的消息保留规则也适用于这些记录。",
    ],
    deletion: "清空对话历史会将消息及其文字内容标记为已删除，并使其不再显示在普通对话视图中。目前，此操作不会实际删除已存储的照片或单独保存的 OCR 和翻译记录。申请注销账户会开始 30 天恢复期；目前的账户注销流程不会删除相关对话消息、照片、OCR 结果或译文。为提供服务、维护安全、解决争议或履行法律要求，这些记录可能继续保留。",
  },
  "zh-TW": {
    heading: "對話照片中的文字處理",
    paragraphs: [
      "您在對話中傳送照片時，Mingle 會將其與訊息一同儲存在由 Cloudflare 提供的私人雲端圖片儲存空間。啟用照片文字翻譯後，Mingle 會將照片傳送給 Google Gemini，以辨識其中可見的文字、語言、位置及視覺樣式。",
      "Mingle 會將辨識出的文字及其語言資訊傳送給 Google Gemini，翻譯成對話所需的語言。Google 會依據適用的服務條款與隱私說明，處理傳送給 Gemini 的照片與文字。",
      "為了在照片上顯示譯文，Mingle 會將辨識出的文字區塊、偵測到的位置與視覺樣式資訊，以及產生的譯文，儲存為與照片訊息相關的記錄。下文所述的訊息保留規則也適用於這些記錄。",
    ],
    deletion: "清除對話歷史會將其中的訊息及其文字內容標記為已刪除，並使其不再顯示於一般對話畫面。目前此操作不會實際刪除已儲存的照片或另外保存的 OCR 與翻譯記錄。申請註銷帳戶會開始 30 天復原期；目前的帳戶註銷流程不會刪除相關對話訊息、照片、OCR 結果或譯文。為提供服務、維護安全、解決爭議或履行法律要求，這些記錄可能繼續保留。",
  },
  fr: {
    heading: "Traitement du texte des photos dans les conversations",
    paragraphs: [
      "Lorsque vous envoyez une photo dans une conversation, Mingle la stocke avec le message dans un espace privé de stockage cloud fourni par Cloudflare. Lorsque la traduction du texte des photos est activée, Mingle envoie la photo à Google Gemini afin d’identifier le texte visible, sa langue, sa position et son style visuel.",
      "Mingle envoie le texte reconnu et les informations sur sa langue à Google Gemini pour les traduire dans les langues demandées pour la conversation. Google traite les photos et les textes envoyés à Gemini conformément à ses conditions de service et informations de confidentialité applicables.",
      "Pour afficher la traduction sur la photo, Mingle stocke les blocs de texte reconnus, leurs positions et indications de style détectées, ainsi que les traductions générées, dans des enregistrements associés au message photo. Google traite les photos et textes envoyés à Gemini, et Cloudflare fournit le stockage des images. Leur traitement est soumis aux conditions de service et informations de confidentialité applicables. Ces données sont conservées avec le message selon les modalités décrites ci-dessous.",
    ],
    deletion: "Effacer l’historique d’une conversation marque les messages et leur contenu textuel comme supprimés et les retire de l’affichage habituel de la conversation. Cette action ne supprime actuellement pas physiquement les photos stockées ni les enregistrements OCR et de traduction conservés séparément. Le retrait d’un compte ouvre une période de récupération de 30 jours ; la procédure actuelle ne supprime pas les messages de conversation, photos, résultats OCR ou traductions associés. Ces données peuvent être conservées si nécessaire pour fournir le Service, assurer la sécurité, résoudre des litiges ou respecter des obligations légales.",
  },
  de: {
    heading: "Verarbeitung von Text in Gesprächsfotos",
    paragraphs: [
      "Wenn Sie ein Foto in einer Unterhaltung senden, speichert Mingle es zusammen mit der Nachricht in einem privaten Cloud-Bildspeicher von Cloudflare. Wenn die Übersetzung von Fototext aktiviert ist, sendet Mingle das Foto an Google Gemini, um sichtbaren Text, Sprache, Position und visuellen Stil zu erkennen.",
      "Mingle sendet den erkannten Text und die zugehörigen Sprachinformationen an Google Gemini, um sie in die für die Unterhaltung angeforderten Sprachen zu übersetzen. Google verarbeitet die an Gemini gesendeten Fotos und Texte gemäß den geltenden Nutzungsbedingungen und Datenschutzhinweisen.",
      "Damit Übersetzungen auf dem Foto angezeigt werden können, speichert Mingle die erkannten Textblöcke, ihre erkannten Positionen und visuellen Stilmerkmale sowie die erzeugten Übersetzungen in Datensätzen, die mit der Fotonachricht verknüpft sind. Google verarbeitet die an Gemini gesendeten Fotos und Texte; Cloudflare stellt den Bildspeicher bereit. Für deren Verarbeitung gelten die jeweiligen Dienstbedingungen und Datenschutzhinweise. Diese Datensätze werden wie unten beschrieben zusammen mit der Nachricht aufbewahrt.",
    ],
    deletion: "Beim Löschen des Gesprächsverlaufs werden die Nachrichten und ihre Textinhalte als gelöscht markiert und aus der normalen Gesprächsansicht entfernt. Dadurch werden gespeicherte Fotos sowie separat gespeicherte OCR- und Übersetzungsdaten derzeit nicht physisch gelöscht. Bei einer Kontolöschung beginnt eine 30-tägige Wiederherstellungsfrist; der aktuelle Kontolöschungsprozess entfernt zugehörige Gesprächsnachrichten, Fotos, OCR-Ergebnisse oder Übersetzungen nicht. Diese Daten können soweit erforderlich zur Bereitstellung des Dienstes, zur Sicherheit, zur Beilegung von Streitigkeiten oder zur Erfüllung gesetzlicher Pflichten aufbewahrt werden.",
  },
  es: {
    heading: "Tratamiento del texto de fotos en conversaciones",
    paragraphs: [
      "Cuando envía una foto en una conversación, Mingle la almacena con el mensaje en el almacenamiento privado en la nube de imágenes de conversación proporcionado por Cloudflare. Si está habilitada la traducción del texto de fotos, Mingle envía la foto a Google Gemini para identificar el texto visible, su idioma, posición y estilo visual.",
      "Mingle envía el texto reconocido y la información de idioma a Google Gemini para traducirlos a los idiomas solicitados para la conversación. Google procesa las fotos y el texto enviados a Gemini conforme a sus términos de servicio e información de privacidad aplicables.",
      "Para mostrar la traducción sobre la foto, Mingle almacena los bloques de texto reconocidos, sus posiciones y detalles de estilo visual detectados, y las traducciones generadas en registros vinculados al mensaje con la foto. Google procesa las fotos y el texto enviados a Gemini, y Cloudflare proporciona el almacenamiento de imágenes. Su tratamiento se rige por los términos del servicio y la información de privacidad aplicables. Estos registros se conservan junto con el mensaje según se describe a continuación.",
    ],
    deletion: "Al borrar el historial de una conversación, los mensajes y su contenido de texto se marcan como eliminados y dejan de aparecer en la vista normal de la conversación. Actualmente, esta acción no elimina físicamente las fotos almacenadas ni los registros de OCR y traducción guardados por separado. La baja de una cuenta inicia un periodo de recuperación de 30 días; el proceso actual no elimina los mensajes, fotos, resultados de OCR ni traducciones asociados. Estos registros pueden conservarse cuando sea necesario para prestar el Servicio, mantener la seguridad, resolver disputas o cumplir obligaciones legales.",
  },
  pt: {
    heading: "Processamento de texto em fotos nas conversas",
    paragraphs: [
      "Quando você envia uma foto em uma conversa, o Mingle a armazena com a mensagem no armazenamento privado de imagens em nuvem fornecido pelo Cloudflare. Quando a tradução do texto das fotos está ativada, o Mingle envia a foto ao Google Gemini para identificar o texto visível, o idioma, a posição e o estilo visual.",
      "O Mingle envia o texto reconhecido e as informações de idioma ao Google Gemini para traduzi-los nos idiomas solicitados para a conversa. O Google processa as fotos e os textos enviados ao Gemini conforme os termos de serviço e as informações de privacidade aplicáveis.",
      "Para exibir a tradução sobre a foto, o Mingle armazena os blocos de texto reconhecidos, suas posições e detalhes de estilo visual detectados e as traduções geradas em registros vinculados à mensagem com a foto. O Google processa as fotos e os textos enviados ao Gemini, e o Cloudflare fornece o armazenamento de imagens. O processamento segue os termos de serviço e as informações de privacidade aplicáveis de cada empresa. Esses registros são mantidos com a mensagem conforme descrito abaixo.",
    ],
    deletion: "Ao limpar o histórico de uma conversa, as mensagens e seus conteúdos de texto são marcados como excluídos e deixam de aparecer na visualização normal da conversa. Atualmente, essa ação não exclui fisicamente as fotos armazenadas nem os registros de OCR e tradução guardados separadamente. A exclusão da conta inicia um período de recuperação de 30 dias; o processo atual não remove as mensagens, fotos, resultados de OCR ou traduções associados. Esses registros podem ser mantidos quando necessário para fornecer o Serviço, manter a segurança, resolver disputas ou cumprir obrigações legais.",
  },
  it: {
    heading: "Elaborazione del testo nelle foto delle conversazioni",
    paragraphs: [
      "Quando invii una foto in una conversazione, Mingle la archivia insieme al messaggio nello spazio privato di archiviazione cloud delle immagini fornito da Cloudflare. Quando la traduzione del testo nelle foto è attiva, Mingle invia la foto a Google Gemini per identificare il testo visibile, la lingua, la posizione e lo stile visivo.",
      "Mingle invia il testo riconosciuto e le informazioni sulla lingua a Google Gemini per tradurli nelle lingue richieste per la conversazione. Google elabora le foto e i testi inviati a Gemini secondo i termini di servizio e le informazioni sulla privacy applicabili.",
      "Per mostrare la traduzione sulla foto, Mingle archivia i blocchi di testo riconosciuti, le posizioni e i dettagli di stile visivo rilevati e le traduzioni generate in record collegati al messaggio con la foto. Google elabora le foto e i testi inviati a Gemini; Cloudflare fornisce lo spazio di archiviazione delle immagini. Il trattamento è soggetto ai rispettivi termini di servizio e alle informazioni sulla privacy applicabili. Questi record sono conservati insieme al messaggio secondo quanto descritto di seguito.",
    ],
    deletion: "Quando cancelli la cronologia di una conversazione, i messaggi e i relativi contenuti testuali vengono contrassegnati come eliminati e rimossi dalla normale vista della conversazione. Attualmente, questa azione non elimina fisicamente le foto archiviate né i record OCR e di traduzione conservati separatamente. Il recesso dall’account avvia un periodo di recupero di 30 giorni; la procedura attuale non rimuove i messaggi, le foto, i risultati OCR o le traduzioni associati. Questi record possono essere conservati se necessario per fornire il Servizio, mantenere la sicurezza, risolvere controversie o adempiere obblighi di legge.",
  },
  ru: {
    heading: "Обработка текста на фотографиях в переписке",
    paragraphs: [
      "Когда вы отправляете фотографию в переписке, Mingle хранит её вместе с сообщением в закрытом облачном хранилище изображений, предоставляемом Cloudflare. Если включён перевод текста на фотографиях, Mingle отправляет фотографию в Google Gemini для распознавания видимого текста, языка, положения и визуального стиля.",
      "Mingle отправляет распознанный текст и сведения о его языке в Google Gemini, чтобы перевести их на языки, запрошенные для переписки. Google обрабатывает фотографии и текст, отправленные в Gemini, согласно применимым условиям обслуживания и сведениям о конфиденциальности.",
      "Чтобы показывать перевод поверх фотографии, Mingle сохраняет распознанные текстовые блоки, определённые положения и сведения о визуальном стиле, а также созданные переводы в записях, связанных с сообщением-фотографией. Google обрабатывает фотографии и текст, отправленные в Gemini, а Cloudflare предоставляет хранилище изображений. К их обработке применяются соответствующие условия обслуживания и сведения о конфиденциальности. Эти записи хранятся вместе с сообщением, как описано ниже.",
    ],
    deletion: "При очистке истории переписки сообщения и их текстовое содержимое помечаются как удалённые и перестают отображаться в обычном интерфейсе переписки. Сейчас это действие физически не удаляет сохранённые фотографии или отдельно хранящиеся записи OCR и перевода. Удаление аккаунта запускает 30-дневный период восстановления; действующая процедура не удаляет связанные сообщения, фотографии, результаты OCR или переводы. Эти записи могут храниться, если это необходимо для предоставления Сервиса, безопасности, разрешения споров или выполнения требований закона.",
  },
  ar: {
    heading: "معالجة النصوص في صور المحادثات",
    paragraphs: [
      "عند إرسال صورة في محادثة، يخزنها Mingle مع الرسالة في مساحة تخزين سحابية خاصة للصور توفرها Cloudflare. عند تفعيل ترجمة نص الصور، يرسل Mingle الصورة إلى Google Gemini للتعرّف على النص الظاهر ولغته وموقعه وأسلوبه المرئي.",
      "يرسل Mingle النص الذي تم التعرّف عليه ومعلومات لغته إلى Google Gemini لترجمته إلى اللغات المطلوبة للمحادثة. وتعالج Google الصور والنصوص المرسلة إلى Gemini وفقًا لشروط الخدمة ومعلومات الخصوصية المعمول بها.",
      "لعرض الترجمة فوق الصورة، يخزن Mingle كتل النص التي تم التعرّف عليها ومواقعها وتفاصيل أسلوبها المرئي والترجمات الناتجة في سجلات مرتبطة برسالة الصورة. تعالج Google الصور والنصوص المرسلة إلى Gemini، وتوفر Cloudflare خدمة تخزين الصور. وتخضع معالجة كل منهما لشروط الخدمة ومعلومات الخصوصية المعمول بها. وتُحتفظ بهذه السجلات مع الرسالة وفقًا لما هو موضح أدناه.",
    ],
    deletion: "يؤدي مسح سجل المحادثة إلى وضع علامة حذف على الرسائل ومحتواها النصي وإخفائها من العرض المعتاد للمحادثة. ولا يحذف هذا الإجراء حاليًا ملفات الصور المخزنة فعليًا أو سجلات OCR والترجمة المخزنة بشكل منفصل. ويبدأ طلب حذف الحساب فترة استعادة مدتها 30 يومًا؛ ولا يحذف إجراء حذف الحساب الحالي رسائل المحادثة أو الصور أو نتائج OCR أو الترجمات المرتبطة بها. وقد تُحتفظ بهذه السجلات عند الحاجة لتقديم الخدمة أو الحفاظ على الأمن أو حل النزاعات أو الوفاء بالمتطلبات القانونية.",
  },
  hi: {
    heading: "बातचीत की तस्वीरों में पाठ का प्रसंस्करण",
    paragraphs: [
      "जब आप बातचीत में कोई तस्वीर भेजते हैं, तो Mingle उसे संदेश के साथ Cloudflare द्वारा उपलब्ध कराए गए निजी क्लाउड चित्र भंडारण में रखता है। तस्वीर के पाठ का अनुवाद चालू होने पर, Mingle दिखाई देने वाले पाठ, उसकी भाषा, स्थान और दृश्य शैली की पहचान के लिए तस्वीर Google Gemini को भेजता है।",
      "Mingle पहचाने गए पाठ और भाषा की जानकारी को बातचीत के लिए मांगी गई भाषाओं में अनुवाद करने हेतु Google Gemini को भेजता है। Google को भेजी गई तस्वीरों और पाठ का प्रसंस्करण लागू सेवा शर्तों और गोपनीयता जानकारी के अनुसार होता है।",
      "तस्वीर पर अनुवाद दिखाने के लिए, Mingle पहचाने गए पाठ खंडों, उनके पहचाने गए स्थान और दृश्य शैली के विवरण तथा बनाए गए अनुवादों को तस्वीर वाले संदेश से जुड़े रिकॉर्ड में रखता है। Google को Gemini के लिए भेजी गई तस्वीर और पाठ संसाधित करता है, और Cloudflare चित्र भंडारण उपलब्ध कराता है। उन पर संबंधित सेवा शर्तें और गोपनीयता जानकारी लागू होती हैं। नीचे बताए अनुसार ये रिकॉर्ड संदेश के साथ रखे जाते हैं।",
    ],
    deletion: "बातचीत का इतिहास साफ़ करने पर संदेश और उनका पाठ हटाया हुआ चिह्नित हो जाता है और सामान्य बातचीत दृश्य से हट जाता है। फिलहाल इस कार्रवाई से संग्रहित तस्वीरें या अलग से रखे OCR और अनुवाद रिकॉर्ड भौतिक रूप से नहीं मिटते। खाता बंद करने के अनुरोध पर 30 दिनों की पुनर्प्राप्ति अवधि शुरू होती है; मौजूदा प्रक्रिया संबंधित बातचीत संदेश, तस्वीरें, OCR परिणाम या अनुवाद नहीं हटाती। सेवा देने, सुरक्षा बनाए रखने, विवाद सुलझाने या कानूनी आवश्यकताएँ पूरी करने के लिए ये रिकॉर्ड रखे जा सकते हैं।",
  },
  th: {
    heading: "การประมวลผลข้อความในรูปภาพของบทสนทนา",
    paragraphs: [
      "เมื่อคุณส่งรูปภาพในบทสนทนา Mingle จะจัดเก็บรูปภาพพร้อมข้อความในพื้นที่จัดเก็บรูปภาพบนคลาวด์แบบส่วนตัวที่ให้บริการโดย Cloudflare เมื่อเปิดใช้การแปลข้อความในรูปภาพ Mingle จะส่งรูปภาพไปยัง Google Gemini เพื่อระบุข้อความที่มองเห็น ภาษา ตำแหน่ง และรูปแบบภาพ",
      "Mingle ส่งข้อความที่ตรวจพบและข้อมูลภาษาไปยัง Google Gemini เพื่อแปลเป็นภาษาที่ร้องขอสำหรับบทสนทนา Google ประมวลผลรูปภาพและข้อความที่ส่งไปยัง Gemini ตามข้อกำหนดบริการและข้อมูลความเป็นส่วนตัวที่เกี่ยวข้อง",
      "เพื่อแสดงคำแปลบนรูปภาพ Mingle จัดเก็บบล็อกข้อความที่ตรวจพบ ตำแหน่งและรายละเอียดรูปแบบภาพที่ตรวจพบ ตลอดจนคำแปลที่สร้างขึ้นเป็นระเบียนที่เชื่อมโยงกับข้อความรูปภาพ Google ประมวลผลรูปภาพและข้อความที่ส่งไปยัง Gemini ส่วน Cloudflare ให้บริการพื้นที่จัดเก็บรูปภาพ การประมวลผลอยู่ภายใต้ข้อกำหนดบริการและข้อมูลความเป็นส่วนตัวที่เกี่ยวข้องของแต่ละราย ระเบียนเหล่านี้จะจัดเก็บไว้กับข้อความตามที่อธิบายด้านล่าง",
    ],
    deletion: "เมื่อคุณล้างประวัติบทสนทนา ระบบจะทำเครื่องหมายว่าข้อความและเนื้อหาข้อความถูกลบ และนำออกจากมุมมองบทสนทนาปกติ ปัจจุบันการดำเนินการนี้ไม่ได้ลบรูปภาพที่จัดเก็บหรือระเบียน OCR และคำแปลที่จัดเก็บแยกต่างหากออกจริง การขอลบบัญชีจะเริ่มช่วงกู้คืน 30 วัน และกระบวนการปัจจุบันจะไม่ลบข้อความบทสนทนา รูปภาพ ผล OCR หรือคำแปลที่เกี่ยวข้อง ระเบียนเหล่านี้อาจเก็บไว้เท่าที่จำเป็นเพื่อให้บริการ รักษาความปลอดภัย แก้ไขข้อพิพาท หรือปฏิบัติตามข้อกำหนดทางกฎหมาย",
  },
  vi: {
    heading: "Xử lý văn bản trong ảnh của cuộc trò chuyện",
    paragraphs: [
      "Khi bạn gửi ảnh trong cuộc trò chuyện, Mingle lưu ảnh cùng tin nhắn trong kho lưu trữ ảnh đám mây riêng tư do Cloudflare cung cấp. Khi bật tính năng dịch văn bản trong ảnh, Mingle gửi ảnh đến Google Gemini để nhận diện văn bản hiển thị, ngôn ngữ, vị trí và kiểu trình bày.",
      "Mingle gửi văn bản đã nhận diện và thông tin ngôn ngữ đến Google Gemini để dịch sang các ngôn ngữ được yêu cầu cho cuộc trò chuyện. Google xử lý ảnh và văn bản được gửi đến Gemini theo điều khoản dịch vụ và thông tin quyền riêng tư áp dụng.",
      "Để hiển thị bản dịch trên ảnh, Mingle lưu các khối văn bản đã nhận diện, vị trí và chi tiết kiểu trình bày được phát hiện cùng các bản dịch được tạo trong hồ sơ liên kết với tin nhắn ảnh. Google xử lý ảnh và văn bản được gửi đến Gemini; Cloudflare cung cấp dịch vụ lưu trữ ảnh. Việc xử lý của họ tuân theo điều khoản dịch vụ và thông tin quyền riêng tư áp dụng. Các hồ sơ này được lưu cùng tin nhắn như mô tả dưới đây.",
    ],
    deletion: "Khi xóa lịch sử cuộc trò chuyện, tin nhắn và nội dung văn bản được đánh dấu đã xóa và không còn hiện trong giao diện trò chuyện thông thường. Hiện thao tác này không xóa vật lý ảnh đã lưu hoặc hồ sơ OCR và bản dịch được lưu riêng. Yêu cầu xóa tài khoản bắt đầu thời gian khôi phục 30 ngày; quy trình hiện tại không xóa tin nhắn, ảnh, kết quả OCR hoặc bản dịch liên quan. Các hồ sơ này có thể được lưu giữ khi cần để cung cấp Dịch vụ, duy trì an toàn, giải quyết tranh chấp hoặc đáp ứng nghĩa vụ pháp lý.",
  },
}

export function renderPhotoTextPrivacySection(localePath, escapeHtml) {
  const copy = PHOTO_TEXT_PRIVACY_COPY[localePath] || PHOTO_TEXT_PRIVACY_COPY.en
  return `<h3>${escapeHtml(copy.heading)}</h3>\n${copy.paragraphs.map(paragraph => `<p>${escapeHtml(paragraph)}</p>`).join("\n")}`
}

export function renderPhotoTextDeletionNotice(localePath, escapeHtml) {
  const copy = PHOTO_TEXT_PRIVACY_COPY[localePath] || PHOTO_TEXT_PRIVACY_COPY.en
  return `<p>${escapeHtml(copy.deletion)}</p>`
}
