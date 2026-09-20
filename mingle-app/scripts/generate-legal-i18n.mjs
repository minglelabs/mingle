#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const LEGAL_ROOT = path.join(ROOT, "public", "legal");
const LAST_UPDATED_DATE = "August 25, 2026";

const locales = [
  { code: "en", path: "en", name: "English", lang: "en", dir: "ltr" },
  { code: "ko", path: "ko", name: "Korean", lang: "ko", dir: "ltr" },
  { code: "ja", path: "ja", name: "Japanese", lang: "ja", dir: "ltr" },
  { code: "zh-CN", path: "zh-cn", name: "Chinese (Simplified)", lang: "zh-CN", dir: "ltr" },
  { code: "zh-TW", path: "zh-tw", name: "Chinese (Traditional)", lang: "zh-TW", dir: "ltr" },
  { code: "fr", path: "fr", name: "French", lang: "fr", dir: "ltr" },
  { code: "de", path: "de", name: "German", lang: "de", dir: "ltr" },
  { code: "es", path: "es", name: "Spanish", lang: "es", dir: "ltr" },
  { code: "pt", path: "pt", name: "Portuguese", lang: "pt", dir: "ltr" },
  { code: "it", path: "it", name: "Italian", lang: "it", dir: "ltr" },
  { code: "ru", path: "ru", name: "Russian", lang: "ru", dir: "ltr" },
  { code: "ar", path: "ar", name: "Arabic", lang: "ar", dir: "rtl" },
  { code: "hi", path: "hi", name: "Hindi", lang: "hi", dir: "ltr" },
  { code: "th", path: "th", name: "Thai", lang: "th", dir: "ltr" },
  { code: "vi", path: "vi", name: "Vietnamese", lang: "vi", dir: "ltr" },
];

const privacyDoc = {
  key: "privacy",
  fileName: "privacy-policy.html",
  title: "Mingle Privacy Policy",
  description: "How Mingle handles personal data for mobile and web services.",
  intro:
    'This Privacy Policy explains how Mingle Labs, Inc. ("Mingle," "we," "our," or "us") collects, uses, shares, and protects personal data when you use the Mingle mobile app, website, and related services (collectively, the "Service").',
  sections: [
    {
      heading: "1. Scope",
      paragraphs: [
        "This Policy applies to information processed for consumer Mingle accounts and usage. It does not apply to data we process solely on behalf of enterprise customers under separate contracts.",
      ],
    },
    {
      heading: "2. Information We Collect",
      list: [
        "Account Information: name, email address, sign-in provider details, account identifiers, and profile preferences.",
        "Translation and Voice Data: text you submit for translation, voice/audio input needed to provide speech recognition and translation, translated output, and language settings.",
        "Technical and Usage Data: device type, operating system, app version, IP address, request timestamps, crash logs, performance logs, and feature interaction events.",
        "Support Communications: messages and attachments you send to us when requesting help.",
      ],
    },
    {
      heading: "3. Audio Processing and Non-Retention",
      paragraphs: [
        "Mingle processes microphone audio in real time to provide speech recognition and translation. Raw audio is streamed for processing and is not stored by Mingle after the request is completed.",
        "Mingle does not keep a retained archive of raw voice recordings for model training. We may keep limited non-audio technical diagnostics (for example, error codes and timing metrics) for security, abuse prevention, and service reliability.",
      ],
    },
    {
      heading: "4. How We Use Personal Data",
      list: [
        "Provide, maintain, and improve real-time translation features.",
        "Authenticate users and secure user sessions.",
        "Detect abuse, fraud, and security incidents.",
        "Monitor reliability, debug failures, and improve service quality.",
        "Communicate product updates, support responses, and policy changes.",
        "Comply with legal obligations and enforce our Terms of Use.",
      ],
    },
    {
      heading: "5. Legal Bases (EEA/UK)",
      paragraphs: [
        "Where required by law, we rely on one or more legal bases: performance of a contract, legitimate interests (for security and service improvement), legal obligations, and consent (for specific optional processing where requested).",
      ],
    },
    {
      heading: "6. How We Share Information",
      paragraphs: ["We do not sell personal data. We may share data with:"],
      list: [
        "Service Providers: hosting, storage, authentication, customer support, analytics, crash reporting, and other infrastructure vendors that process data under contract.",
        "Soniox: audio stream and related context needed for speech-to-text processing.",
        "Inworld: text and language context needed for voice generation features and synthesized audio delivery.",
        "Google: account authentication and text-based service operations where used. Mingle does not send raw voice audio to Google for speech processing.",
        "Legal/Safety Requests: when required by law or necessary to protect rights, safety, and security.",
        "Corporate Transactions: in connection with merger, financing, acquisition, bankruptcy, or asset transfer.",
      ],
    },
    {
      heading: "7. International Data Transfers",
      paragraphs: [
        "Your data may be processed in countries other than your own. Where required, we use contractual and organizational safeguards designed to protect transferred data.",
      ],
    },
    {
      heading: "8. Retention",
      paragraphs: [
        "We keep personal data only as long as needed for the purposes described in this Policy, including to provide the Service, resolve disputes, maintain security, and meet legal requirements.",
        "For clarity, raw microphone audio used for real-time translation is not stored as a retained user-content archive.",
      ],
    },
    {
      heading: "9. Security",
      paragraphs: [
        "We use commercially reasonable technical and organizational safeguards, including access controls and encryption in transit. No method of transmission or storage is completely secure; therefore, absolute security cannot be guaranteed.",
      ],
    },
    {
      heading: "10. Your Rights and Choices",
      paragraphs: ["Depending on your location, you may have rights to:"],
      list: [
        "access, correct, or delete personal data;",
        "request a copy of data (data portability);",
        "restrict or object to certain processing; and",
        "withdraw consent where processing is based on consent.",
      ],
      tailParagraph:
        "You can submit requests by contacting us at legal@minglelabs.app.",
    },
    {
      heading: "11. Children",
      paragraphs: [
        "The Service is not directed to children under 13 (or the equivalent minimum age in your jurisdiction). If we learn we collected personal data from a child without valid permission, we will delete the data as required by law.",
      ],
    },
    {
      heading: "12. Third-Party Services",
      paragraphs: [
        "The Service may contain links or integrations to third-party services. Their privacy practices are governed by their own policies.",
      ],
    },
    {
      heading: "13. Changes to This Policy",
      paragraphs: [
        'We may update this Privacy Policy from time to time. We will post the updated version on this page and update the "Last updated" date.',
      ],
    },
    {
      heading: "14. Contact",
      paragraphs: [
        "Mingle Labs, Inc. (Republic of Korea)",
        "Email: legal@minglelabs.app",
        "Website: https://translator.minglelabs.xyz",
      ],
    },
  ],
  relatedLabel: "Related document:",
  relatedLinkText: "Mingle Terms of Use",
};

const termsDoc = {
  key: "terms",
  fileName: "terms-of-use.html",
  title: "Mingle Terms of Use",
  description: "Terms of Use for Mingle mobile and web translation services.",
  intro:
    'These Terms of Use ("Terms") govern your use of Mingle services provided by Mingle Labs, Inc. ("Mingle," "we," "our," or "us"), a company organized under the laws of the Republic of Korea. By using the Service, you agree to these Terms.',
  sections: [
    {
      heading: "1. Eligibility and Account",
      list: [
        "You must be at least 13 years old (or the minimum digital consent age in your jurisdiction) to use the Service.",
        "You must provide accurate account information and keep it up to date.",
        "You are responsible for all activity under your account credentials.",
        "You must not share credentials in a way that compromises account security.",
      ],
    },
    {
      heading: "2. Service Description",
      paragraphs: [
        "Mingle provides translation-related features, including text translation, speech processing, and conversation assistance. Service availability, features, and supported languages may change.",
      ],
    },
    {
      heading: "3. Acceptable Use",
      paragraphs: ["You agree not to:"],
      list: [
        "violate laws, regulations, or third-party rights;",
        "upload harmful, illegal, infringing, or abusive content;",
        "attempt to reverse engineer, disrupt, or bypass security controls;",
        "use automated means to scrape or overload the Service; or",
        "use the Service to create or distribute malware, fraud, or spam.",
      ],
    },
    {
      heading: "4. User Content and License",
      list: [
        "You retain ownership of content you submit, subject to rights needed to operate and improve the Service.",
        "You grant Mingle a non-exclusive, worldwide, royalty-free license to host, process, transmit, and display your content solely for providing and supporting the Service.",
        "You represent that you have rights to submit the content and that processing it does not violate law or third-party rights.",
      ],
    },
    {
      heading: "5. Fees, Subscriptions, and Billing",
      paragraphs: [
        "Some features may be paid. Pricing and billing terms will be shown before purchase. If subscriptions are offered, they may renew automatically unless canceled according to the terms presented at purchase.",
      ],
    },
    {
      heading: "6. Third-Party Services",
      paragraphs: [
        "The Service may rely on third-party providers (for example cloud infrastructure, speech processing, payment systems, analytics, or authentication). Their separate terms may apply.",
      ],
    },
    {
      heading: "7. Suspension and Termination",
      paragraphs: [
        "We may suspend or terminate access if you violate these Terms, create legal or security risk, or misuse the Service. You may stop using the Service at any time.",
      ],
    },
    {
      heading: "8. Disclaimers",
      paragraphs: [
        'The Service is provided on an "as is" and "as available" basis. To the fullest extent permitted by law, Mingle disclaims all warranties, express or implied, including merchantability, fitness for a particular purpose, and non-infringement.',
        "Translation output is generated by automated systems and may contain errors, omissions, or ambiguities. You must not rely on translation output as the sole basis for legal, medical, safety-critical, or other high-risk decisions where accuracy is essential.",
      ],
    },
    {
      heading: "9. Limitation of Liability",
      paragraphs: [
        "To the fullest extent permitted by law, Mingle and its affiliates will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, or loss of data, revenue, profits, or business opportunities.",
      ],
    },
    {
      heading: "10. Indemnification",
      paragraphs: [
        "You agree to indemnify and hold harmless Mingle from claims, losses, liabilities, and expenses arising from your misuse of the Service, your content, or your breach of these Terms.",
      ],
    },
    {
      heading: "11. Apple App Store Terms (iOS)",
      paragraphs: [
        "If you use Mingle on iOS, Apple Inc. is not responsible for the Service and has no obligation to provide maintenance or support. Your use of the iOS app is also subject to applicable App Store terms, including the standard Apple EULA: https://www.apple.com/legal/internet-services/itunes/dev/stdeula/.",
      ],
    },
    {
      heading: "12. Governing Law and Jurisdiction",
      paragraphs: [
        "These Terms are governed by the laws of the Republic of Korea, without regard to conflict-of-law principles.",
        "Unless mandatory law provides otherwise, disputes arising out of or in connection with these Terms will be subject to the exclusive jurisdiction of the courts located in Seoul, Republic of Korea.",
      ],
    },
    {
      heading: "13. Changes to Terms",
      paragraphs: [
        "We may update these Terms from time to time. The updated version will be posted on this page with a revised date.",
      ],
    },
    {
      heading: "14. Contact",
      paragraphs: [
        "Mingle Labs, Inc. (Republic of Korea)",
        "Email: legal@minglelabs.app",
        "Website: https://translator.minglelabs.xyz",
      ],
    },
  ],
  relatedLabel: "Related document:",
  relatedLinkText: "Mingle Privacy Policy",
};

const docs = [privacyDoc, termsDoc];

// This section is maintained explicitly because Google Play's account/data
// deletion fields link directly to each localized privacy policy.
const accountDeletionSectionByLocale = {
  en: `<h2 id="account-and-data-deletion">Account and Data Deletion</h2>
<p>Mingle provides an in-app account deletion option. If you have uninstalled Mingle or cannot access the app, you can request deletion of your Mingle account and associated data through this public web resource without reinstalling the app.</p>
<h3>How to request deletion</h3>
<ol><li>Send an email from your Mingle account email address to <a href="mailto:legal@minglelabs.app?subject=Mingle%20account%20and%20data%20deletion%20request">legal@minglelabs.app</a> with the subject “Mingle account and data deletion request”.</li><li>Include your account email address or handle. Do not send your password or authentication tokens.</li><li>Complete ownership verification if requested. Unverified requests for another person’s account will not be processed.</li><li>We will confirm the request and notify you when processing is complete.</li></ol>
<h3>Data deleted or de-identified</h3>
<p>The request covers the account record, authentication links, profile information, profile image, push-notification registration, location information, and other personal data linked to the account, subject to applicable law.</p>
<p>Some message, event, security, abuse-prevention, dispute-resolution, or legal records may be retained or de-identified when necessary. Direct account identifiers are removed where applicable, and retained data is not used to restore the deleted account.</p>
<h3>Deletion timing and recovery period</h3>
<p>In-app account withdrawal starts a 30-day recovery period. Signing in during that period can restore the account and cancel the deletion request. After that period, the account is permanently closed. Verified external requests are generally processed within 30 days. Longer retention required for security or legal obligations is described in this Policy.</p>`,
  ko: `<h2 id="account-and-data-deletion">계정 및 데이터 삭제</h2>
<p>Mingle은 앱 안에서 계정 삭제 기능을 제공합니다. 앱을 삭제했거나 접근할 수 없는 경우에도 이 공개 웹 페이지에서 계정 및 관련 데이터 삭제를 요청할 수 있습니다.</p>
<h3>삭제 요청 방법</h3>
<ol><li>Mingle 계정 이메일 주소에서 <a href="mailto:legal@minglelabs.app?subject=Mingle%20account%20and%20data%20deletion%20request">legal@minglelabs.app</a>으로 “Mingle account and data deletion request”라는 제목의 이메일을 보내세요.</li><li>계정 이메일 주소 또는 핸들을 적어 주세요. 비밀번호나 인증 토큰은 보내지 마세요.</li><li>필요한 경우 본인 확인 절차를 완료해 주세요. 확인되지 않은 타인 계정 삭제 요청은 처리하지 않습니다.</li><li>요청을 확인하고 처리가 완료되면 안내해 드립니다.</li></ol>
<h3>삭제되거나 익명화되는 데이터</h3>
<p>관련 법률에 따라 계정 기록, 로그인 연결 정보, 프로필 정보, 프로필 이미지, 푸시 알림 등록 정보, 위치 정보 및 계정에 연결된 기타 개인 데이터가 삭제 대상에 포함됩니다.</p>
<p>서비스 무결성, 남용 방지, 분쟁 해결, 보안 또는 법적 의무를 위해 일부 메시지·이벤트·보안 기록은 보관되거나 익명화될 수 있습니다. 보관 데이터로 삭제된 계정을 복원하지 않습니다.</p>
<h3>삭제 시점 및 복구 기간</h3>
<p>앱에서 회원 탈퇴를 요청하면 30일의 복구 기간이 시작됩니다. 이 기간에 다시 로그인하면 계정을 복구하고 삭제 요청을 취소할 수 있습니다. 이후 계정은 영구 종료됩니다. 외부 요청은 일반적으로 30일 이내에 처리되며, 보안 또는 법적 의무에 필요한 추가 보관 기간은 본 정책에 설명되어 있습니다.</p>`,
  ja: `<h2 id="account-and-data-deletion">アカウントとデータの削除</h2><p>Mingleにはアプリ内のアカウント削除機能があります。アプリを削除した場合やアクセスできない場合も、この公開ページからアカウントと関連データの削除を申請できます。</p><h3>削除の申請方法</h3><ol><li>Mingleの登録メールアドレスから、件名「Mingle account and data deletion request」で<a href="mailto:legal@minglelabs.app">legal@minglelabs.app</a>へメールを送信してください。</li><li>アカウントのメールアドレスまたはハンドルを記載してください。パスワードや認証トークンは送らないでください。</li><li>求められた場合は本人確認を完了してください。</li><li>申請を確認し、処理完了時にお知らせします。</li></ol><h3>削除または匿名化されるデータ</h3><p>アカウント記録、認証リンク、プロフィール、プロフィール画像、プッシュ通知登録、位置情報など、アカウントに関連付けられた個人データが対象となります。</p><p>サービスの安全性、悪用防止、紛争解決、セキュリティまたは法的義務のため、一部の記録は保持または匿名化される場合があります。</p><h3>削除時期と復旧期間</h3><p>アプリで退会を申請すると30日間の復旧期間が始まります。この期間中に再ログインすると申請を取り消せます。外部申請は本人確認後、通常30日以内に処理します。</p>`,
  "zh-CN": `<h2 id="account-and-data-deletion">账户和数据删除</h2><p>Mingle提供应用内账户删除功能。如果您已卸载应用或无法访问应用，也可以通过此公开网页请求删除Mingle账户及相关数据。</p><h3>如何申请删除</h3><ol><li>使用Mingle账户邮箱向<a href="mailto:legal@minglelabs.app">legal@minglelabs.app</a>发送邮件，主题填写“Mingle account and data deletion request”。</li><li>提供账户邮箱或用户名。请勿发送密码或身份验证令牌。</li><li>如有要求，请完成账户所有权验证。</li><li>我们会确认申请，并在处理完成后通知您。</li></ol><h3>删除或去标识化的数据</h3><p>申请涉及账户记录、身份验证关联、个人资料、头像、推送通知注册信息、位置信息及其他关联个人数据。</p><p>为维护服务完整性、防止滥用、解决争议、保障安全或履行法律义务，部分消息、事件和安全记录可能被保留或去标识化。</p><h3>删除时间和恢复期</h3><p>在应用内注销账户会开始30天恢复期。期间重新登录可以恢复账户并取消删除申请。外部申请通常在验证后30天内处理。</p>`,
  "zh-TW": `<h2 id="account-and-data-deletion">帳戶與資料刪除</h2><p>Mingle 提供應用程式內的帳戶刪除功能。若您已解除安裝應用程式或無法存取，也可以透過此公開網頁要求刪除 Mingle 帳戶及相關資料。</p><h3>如何提出刪除要求</h3><ol><li>使用 Mingle 帳戶電子郵件寄送郵件至 <a href="mailto:legal@minglelabs.app">legal@minglelabs.app</a>，主旨為「Mingle account and data deletion request」。</li><li>提供帳戶電子郵件或使用者名稱。請勿提供密碼或驗證權杖。</li><li>如有要求，請完成所有權驗證。</li><li>我們會確認要求，並在處理完成後通知您。</li></ol><h3>刪除或去識別化的資料</h3><p>範圍包括帳戶記錄、驗證連結、個人資料、個人照片、推播通知註冊、位置資訊及其他相關個人資料。</p><p>為維持服務完整性、防止濫用、解決爭議、確保安全或履行法律義務，部分記錄可能保留或去識別化。</p><h3>刪除時間與復原期間</h3><p>在應用程式內申請停用帳戶後會開始 30 天復原期。期間重新登入即可復原帳戶並取消要求。外部要求通常在驗證後 30 天內處理。</p>`,
  fr: `<h2 id="account-and-data-deletion">Suppression du compte et des données</h2><p>Mingle propose une option de suppression du compte dans l’application. Si vous avez désinstallé Mingle ou ne pouvez pas y accéder, vous pouvez demander la suppression de votre compte et de ses données depuis cette page publique.</p><h3>Comment demander la suppression</h3><ol><li>Envoyez un e-mail depuis l’adresse de votre compte Mingle à <a href="mailto:legal@minglelabs.app">legal@minglelabs.app</a>, avec l’objet « Mingle account and data deletion request ».</li><li>Indiquez l’adresse e-mail ou le nom d’utilisateur du compte. N’envoyez pas votre mot de passe ni vos jetons d’authentification.</li><li>Effectuez la vérification de propriété si elle est demandée.</li><li>Nous confirmerons la demande et vous informerons une fois le traitement terminé.</li></ol><h3>Données supprimées ou désidentifiées</h3><p>La demande concerne les informations du compte, les liens d’authentification, le profil, la photo de profil, l’inscription aux notifications push, la localisation et les autres données personnelles associées.</p><p>Certains messages, événements et journaux peuvent être conservés ou désidentifiés pour la sécurité, la prévention des abus, la résolution des litiges ou les obligations légales.</p><h3>Délai et période de récupération</h3><p>Une demande de retrait dans l’application ouvre une période de récupération de 30 jours. Une connexion pendant cette période annule la suppression. Les demandes externes sont généralement traitées sous 30 jours après vérification.</p>`,
  de: `<h2 id="account-and-data-deletion">Löschung von Konto und Daten</h2><p>Mingle bietet eine Kontolöschung in der App an. Wenn Sie Mingle deinstalliert haben oder keinen Zugriff haben, können Sie die Löschung Ihres Kontos und der zugehörigen Daten über diese öffentliche Seite beantragen.</p><h3>So beantragen Sie die Löschung</h3><ol><li>Senden Sie von Ihrer Mingle-Konto-E-Mail eine E-Mail an <a href="mailto:legal@minglelabs.app">legal@minglelabs.app</a> mit dem Betreff „Mingle account and data deletion request“.</li><li>Geben Sie die Konto-E-Mail oder den Nutzernamen an. Senden Sie niemals Passwort oder Authentifizierungstoken.</li><li>Schließen Sie bei Bedarf die Eigentumsprüfung ab.</li><li>Wir bestätigen den Antrag und informieren Sie nach Abschluss.</li></ol><h3>Gelöschte oder anonymisierte Daten</h3><p>Betroffen sind Kontodaten, Authentifizierungsverknüpfungen, Profilinformationen, Profilbild, Push-Registrierung, Standortinformationen und andere verknüpfte personenbezogene Daten.</p><p>Einige Nachrichten, Ereignisse und Sicherheitsaufzeichnungen können zur Sicherheit, Missbrauchsprävention, Streitbeilegung oder Erfüllung gesetzlicher Pflichten aufbewahrt oder anonymisiert werden.</p><h3>Frist und Wiederherstellung</h3><p>Eine Löschung in der App startet eine 30-tägige Wiederherstellungsfrist. Eine Anmeldung in diesem Zeitraum kann die Löschung stornieren. Externe Anträge werden nach Prüfung in der Regel innerhalb von 30 Tagen bearbeitet.</p>`,
  es: `<h2 id="account-and-data-deletion">Eliminación de la cuenta y los datos</h2><p>Mingle ofrece una opción para eliminar la cuenta dentro de la aplicación. Si desinstaló Mingle o no puede acceder, puede solicitar la eliminación desde esta página pública.</p><h3>Cómo solicitar la eliminación</h3><ol><li>Envíe un correo desde la dirección de su cuenta Mingle a <a href="mailto:legal@minglelabs.app">legal@minglelabs.app</a> con el asunto “Mingle account and data deletion request”.</li><li>Incluya el correo o nombre de usuario de la cuenta. No envíe contraseñas ni tokens.</li><li>Complete la verificación de propiedad si se solicita.</li><li>Confirmaremos la solicitud y le avisaremos al terminar.</li></ol><h3>Datos eliminados o desidentificados</h3><p>La solicitud incluye el registro de la cuenta, enlaces de autenticación, perfil, imagen, registro de notificaciones push, ubicación y otros datos personales vinculados.</p><p>Algunos mensajes, eventos y registros pueden conservarse o desidentificarse por seguridad, prevención de abusos, resolución de disputas u obligaciones legales.</p><h3>Plazo y recuperación</h3><p>La baja desde la aplicación inicia un periodo de recuperación de 30 días. Iniciar sesión durante ese periodo puede cancelar la eliminación. Las solicitudes externas suelen procesarse en un plazo de 30 días tras la verificación.</p>`,
  pt: `<h2 id="account-and-data-deletion">Exclusão da conta e dos dados</h2><p>O Mingle oferece a exclusão da conta no aplicativo. Se você desinstalou o Mingle ou não consegue acessá-lo, pode solicitar a exclusão por esta página pública.</p><h3>Como solicitar a exclusão</h3><ol><li>Envie um e-mail do endereço da sua conta Mingle para <a href="mailto:legal@minglelabs.app">legal@minglelabs.app</a> com o assunto “Mingle account and data deletion request”.</li><li>Informe o e-mail ou nome de usuário da conta. Não envie senha nem tokens.</li><li>Conclua a verificação de titularidade se solicitada.</li><li>Confirmaremos a solicitação e avisaremos quando terminar.</li></ol><h3>Dados excluídos ou desidentificados</h3><p>A solicitação abrange registro da conta, vínculos de autenticação, perfil, imagem, registro de notificações push, localização e outros dados pessoais vinculados.</p><p>Algumas mensagens, eventos e registros podem ser mantidos ou desidentificados por segurança, prevenção de abuso, disputas ou obrigações legais.</p><h3>Prazo e recuperação</h3><p>A exclusão no aplicativo inicia um período de recuperação de 30 dias. Entrar novamente nesse período pode cancelar a exclusão. Solicitações externas normalmente são processadas em até 30 dias após a verificação.</p>`,
  it: `<h2 id="account-and-data-deletion">Eliminazione dell'account e dei dati</h2><p>Mingle offre l'eliminazione dell'account nell'app. Se hai disinstallato Mingle o non puoi accedervi, puoi richiedere l'eliminazione da questa pagina pubblica.</p><h3>Come richiedere l'eliminazione</h3><ol><li>Invia un'e-mail dall'indirizzo del tuo account Mingle a <a href="mailto:legal@minglelabs.app">legal@minglelabs.app</a> con oggetto “Mingle account and data deletion request”.</li><li>Indica l'e-mail o il nome utente dell'account. Non inviare password o token.</li><li>Completa la verifica della titolarità se richiesta.</li><li>Confermeremo la richiesta e ti informeremo al termine.</li></ol><h3>Dati eliminati o resi anonimi</h3><p>La richiesta riguarda dati dell'account, collegamenti di autenticazione, profilo, immagine, registrazione delle notifiche push, posizione e altri dati personali collegati.</p><p>Alcuni messaggi, eventi e registri possono essere conservati o resi anonimi per sicurezza, prevenzione degli abusi, controversie o obblighi di legge.</p><h3>Tempi e recupero</h3><p>L'eliminazione nell'app avvia un periodo di recupero di 30 giorni. Un nuovo accesso durante tale periodo può annullarla. Le richieste esterne sono generalmente evase entro 30 giorni dalla verifica.</p>`,
  ru: `<h2 id="account-and-data-deletion">Удаление аккаунта и данных</h2><p>Mingle предоставляет удаление аккаунта в приложении. Если вы удалили приложение или не можете получить к нему доступ, запрос можно отправить через эту общедоступную страницу.</p><h3>Как запросить удаление</h3><ol><li>Отправьте письмо с адреса электронной почты аккаунта Mingle на <a href="mailto:legal@minglelabs.app">legal@minglelabs.app</a> с темой «Mingle account and data deletion request».</li><li>Укажите адрес электронной почты или имя пользователя. Не отправляйте пароль или токены.</li><li>При необходимости пройдите проверку владения аккаунтом.</li><li>Мы подтвердим запрос и сообщим о завершении обработки.</li></ol><h3>Удаляемые или обезличиваемые данные</h3><p>Запрос охватывает данные аккаунта, связи аутентификации, профиль, изображение, регистрацию push-уведомлений, сведения о местоположении и другие связанные персональные данные.</p><p>Некоторые сообщения, события и журналы могут храниться или обезличиваться для безопасности, предотвращения злоупотреблений, разрешения споров или соблюдения закона.</p><h3>Срок и восстановление</h3><p>Удаление в приложении запускает 30-дневный период восстановления. Вход в этот период может отменить удаление. Внешние запросы обычно обрабатываются в течение 30 дней после проверки.</p>`,
  ar: `<h2 id="account-and-data-deletion">حذف الحساب والبيانات</h2><p>يوفر Mingle خيار حذف الحساب داخل التطبيق. إذا حذفت التطبيق أو تعذر عليك الوصول إليه، يمكنك طلب الحذف عبر هذه الصفحة العامة.</p><h3>كيفية طلب الحذف</h3><ol><li>أرسل رسالة من بريد حساب Mingle إلى <a href="mailto:legal@minglelabs.app">legal@minglelabs.app</a> بعنوان “Mingle account and data deletion request”.</li><li>اذكر بريد الحساب أو اسم المستخدم، ولا ترسل كلمة المرور أو رموز المصادقة.</li><li>أكمل التحقق من الملكية إذا طُلب منك ذلك.</li><li>سنؤكد الطلب ونبلغك عند اكتمال المعالجة.</li></ol><h3>البيانات المحذوفة أو مجهّلة الهوية</h3><p>يشمل الطلب سجل الحساب وروابط المصادقة والملف الشخصي والصورة وتسجيل الإشعارات الفورية والموقع والبيانات الشخصية المرتبطة الأخرى.</p><p>قد نحتفظ ببعض الرسائل والأحداث والسجلات أو نجهّل هويتها لأغراض الأمان ومنع إساءة الاستخدام وحل النزاعات والالتزامات القانونية.</p><h3>المدة والاسترداد</h3><p>يبدأ حذف الحساب داخل التطبيق فترة استرداد مدتها 30 يوماً. يمكن لتسجيل الدخول خلالها إلغاء الحذف. تتم معالجة الطلبات الخارجية عادة خلال 30 يوماً بعد التحقق.</p>`,
  hi: `<h2 id="account-and-data-deletion">खाता और डेटा हटाना</h2><p>Mingle ऐप में खाता हटाने का विकल्प देता है। यदि आपने Mingle हटा दिया है या ऐप तक पहुँच नहीं है, तो इस सार्वजनिक वेब पेज से हटाने का अनुरोध कर सकते हैं।</p><h3>हटाने का अनुरोध कैसे करें</h3><ol><li>अपने Mingle खाते के ईमेल से <a href="mailto:legal@minglelabs.app">legal@minglelabs.app</a> पर “Mingle account and data deletion request” विषय के साथ ईमेल भेजें।</li><li>खाते का ईमेल या हैंडल दें। पासवर्ड या प्रमाणीकरण टोकन न भेजें।</li><li>माँगे जाने पर स्वामित्व सत्यापन पूरा करें।</li><li>हम अनुरोध की पुष्टि करेंगे और पूरा होने पर सूचित करेंगे।</li></ol><h3>हटाया या पहचान-रहित किया जाने वाला डेटा</h3><p>इसमें खाता रिकॉर्ड, प्रमाणीकरण लिंक, प्रोफ़ाइल, प्रोफ़ाइल चित्र, पुश सूचना पंजीकरण, स्थान और अन्य संबद्ध व्यक्तिगत डेटा शामिल हैं।</p><p>सुरक्षा, दुरुपयोग रोकथाम, विवाद समाधान या कानूनी दायित्वों के लिए कुछ रिकॉर्ड रखे या पहचान-रहित किए जा सकते हैं।</p><h3>समय और पुनर्प्राप्ति</h3><p>ऐप में खाता हटाने पर 30 दिनों की पुनर्प्राप्ति अवधि शुरू होती है। इस अवधि में लॉग इन करने से हटाना रद्द हो सकता है। बाहरी अनुरोध सामान्यतः सत्यापन के बाद 30 दिनों में पूरे होते हैं।</p>`,
  th: `<h2 id="account-and-data-deletion">การลบบัญชีและข้อมูล</h2><p>Mingle มีตัวเลือกลบบัญชีภายในแอป หากคุณถอนการติดตั้ง Mingle หรือเข้าใช้แอปไม่ได้ คุณสามารถขอลบบัญชีและข้อมูลที่เกี่ยวข้องผ่านหน้าเว็บสาธารณะนี้ได้</p><h3>วิธีขอลบข้อมูล</h3><ol><li>ส่งอีเมลจากที่อยู่อีเมลบัญชี Mingle ไปที่ <a href="mailto:legal@minglelabs.app">legal@minglelabs.app</a> โดยใช้หัวข้อ “Mingle account and data deletion request”</li><li>ระบุอีเมลหรือชื่อผู้ใช้ของบัญชี ห้ามส่งรหัสผ่านหรือโทเค็นยืนยันตัวตน</li><li>ดำเนินการยืนยันความเป็นเจ้าของเมื่อมีการร้องขอ</li><li>เราจะยืนยันคำขอและแจ้งเมื่อดำเนินการเสร็จ</li></ol><h3>ข้อมูลที่ลบหรือทำให้ไม่สามารถระบุตัวตนได้</h3><p>ครอบคลุมข้อมูลบัญชี ลิงก์การยืนยันตัวตน โปรไฟล์ รูปโปรไฟล์ การลงทะเบียนการแจ้งเตือนแบบพุช ข้อมูลตำแหน่ง และข้อมูลส่วนบุคคลอื่นที่เชื่อมโยง</p><p>ข้อความ เหตุการณ์ และบันทึกบางส่วนอาจถูกเก็บรักษาหรือทำให้ไม่สามารถระบุตัวตนได้เพื่อความปลอดภัย การป้องกันการใช้งานในทางที่ผิด การระงับข้อพิพาท หรือหน้าที่ตามกฎหมาย</p><h3>ระยะเวลาและการกู้คืน</h3><p>การลบบัญชีในแอปจะเริ่มช่วงกู้คืน 30 วัน การเข้าสู่ระบบในช่วงนี้อาจยกเลิกการลบได้ คำขอภายนอกมักดำเนินการภายใน 30 วันหลังยืนยันตัวตน</p>`,
  vi: `<h2 id="account-and-data-deletion">Xóa tài khoản và dữ liệu</h2><p>Mingle cung cấp tùy chọn xóa tài khoản trong ứng dụng. Nếu bạn đã gỡ Mingle hoặc không thể truy cập, bạn có thể yêu cầu xóa tài khoản và dữ liệu liên quan qua trang web công khai này.</p><h3>Cách yêu cầu xóa</h3><ol><li>Gửi email từ địa chỉ tài khoản Mingle đến <a href="mailto:legal@minglelabs.app">legal@minglelabs.app</a> với tiêu đề “Mingle account and data deletion request”.</li><li>Ghi địa chỉ email hoặc tên người dùng của tài khoản. Không gửi mật khẩu hay mã xác thực.</li><li>Hoàn tất xác minh quyền sở hữu nếu được yêu cầu.</li><li>Chúng tôi sẽ xác nhận và thông báo khi xử lý xong.</li></ol><h3>Dữ liệu được xóa hoặc ẩn danh</h3><p>Yêu cầu bao gồm hồ sơ tài khoản, liên kết xác thực, thông tin hồ sơ, ảnh, đăng ký thông báo đẩy, vị trí và dữ liệu cá nhân liên quan khác.</p><p>Một số tin nhắn, sự kiện và nhật ký có thể được lưu giữ hoặc ẩn danh vì an toàn, phòng chống lạm dụng, giải quyết tranh chấp hoặc nghĩa vụ pháp lý.</p><h3>Thời hạn và khôi phục</h3><p>Yêu cầu xóa trong ứng dụng bắt đầu thời gian khôi phục 30 ngày. Đăng nhập trong thời gian này có thể hủy việc xóa. Yêu cầu bên ngoài thường được xử lý trong vòng 30 ngày sau khi xác minh.</p>`,
};

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function linkify(value) {
  let escaped = escapeHtml(value);
  escaped = escaped.replaceAll(
    "legal@minglelabs.app",
    '<a href="mailto:legal@minglelabs.app">legal@minglelabs.app</a>',
  );
  escaped = escaped.replaceAll(
    "https://translator.minglelabs.xyz",
    '<a href="https://translator.minglelabs.xyz">https://translator.minglelabs.xyz</a>',
  );
  escaped = escaped.replaceAll(
    "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/",
    '<a href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/" target="_blank" rel="noopener noreferrer">https://www.apple.com/legal/internet-services/itunes/dev/stdeula/</a>',
  );
  return escaped;
}

function buildLanguageNav(docFileName, currentLocalePath) {
  const items = locales
    .map((locale) => {
      const active = locale.path === currentLocalePath ? " aria-current=\"page\"" : "";
      return `<a href="/legal/${locale.path}/${docFileName}"${active}>${escapeHtml(locale.name)}</a>`;
    })
    .join("");
  return `<nav class="lang-nav">${items}</nav>`;
}

function renderDocumentHtml(doc, locale, textMap) {
  const relatedHref =
    doc.key === "privacy"
      ? `/legal/${locale.path}/terms-of-use.html`
      : `/legal/${locale.path}/privacy-policy.html`;

  const renderedSections = doc.sections
    .map((section, idx) => {
      const headingKey = `${doc.key}.section.${idx}.heading`;
      const paragraphKeys =
        section.paragraphs?.map((_, pIdx) => `${doc.key}.section.${idx}.p.${pIdx}`) ?? [];
      const listKeys =
        section.list?.map((_, lIdx) => `${doc.key}.section.${idx}.li.${lIdx}`) ?? [];
      const tailKey =
        section.tailParagraph != null
          ? `${doc.key}.section.${idx}.tail`
          : null;

      const paragraphs = paragraphKeys
        .map((key) => `<p>${linkify(textMap.get(key))}</p>`)
        .join("\n");

      const list = listKeys.length
        ? `<ul>\n${listKeys
            .map((key) => `  <li>${linkify(textMap.get(key))}</li>`)
            .join("\n")}\n</ul>`
        : "";

      const tail = tailKey ? `<p>${linkify(textMap.get(tailKey))}</p>` : "";

      return `<h2>${linkify(textMap.get(headingKey))}</h2>\n${paragraphs}\n${list}\n${tail}`;
    })
    ;

  const sectionHtml = (doc.key === "privacy"
    ? [
        ...renderedSections.slice(0, 10),
        accountDeletionSectionByLocale[locale.code] ?? accountDeletionSectionByLocale.en,
        ...renderedSections.slice(10),
      ]
    : renderedSections
  ).join("\n");

  const title = textMap.get(`${doc.key}.title`);
  const description = textMap.get(`${doc.key}.description`);
  const intro = textMap.get(`${doc.key}.intro`);
  const lastUpdated = textMap.get("meta.lastUpdated");
  const relatedLabel = textMap.get(`${doc.key}.relatedLabel`);
  const relatedLinkText = textMap.get(`${doc.key}.relatedLinkText`);

  return `<!doctype html>
<html lang="${escapeHtml(locale.lang)}" dir="${escapeHtml(locale.dir)}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <link rel="icon" href="/favicon.ico" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Mingle" />
    <meta property="og:image" content="/og-image.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="/og-image.png" />
    <style>
      :root {
        --bg: #f6f7fb;
        --surface: #ffffff;
        --text: #141a24;
        --muted: #5a6475;
        --line: #dfe4ee;
        --accent: #0d6efd;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        color: var(--text);
        background: linear-gradient(180deg, #eef3ff 0%, var(--bg) 160px, var(--bg) 100%);
        line-height: 1.6;
      }

      main {
        max-width: 940px;
        margin: 32px auto;
        padding: 0 16px;
      }

      article {
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: 16px;
        padding: 28px 24px;
        box-shadow: 0 8px 30px rgba(15, 40, 85, 0.06);
      }

      h1 {
        margin: 0 0 8px;
        font-size: 2rem;
        line-height: 1.2;
      }

      h2 {
        margin-top: 30px;
        margin-bottom: 8px;
        font-size: 1.18rem;
      }

      p,
      li {
        font-size: 1rem;
      }

      .meta {
        margin: 0;
        color: var(--muted);
      }

      ul {
        margin-top: 8px;
      }

      a {
        color: var(--accent);
      }

      .legal-links {
        margin-top: 20px;
        padding-top: 16px;
        border-top: 1px solid var(--line);
      }

      .lang-nav {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-bottom: 16px;
      }

      .lang-nav a {
        text-decoration: none;
        border: 1px solid var(--line);
        border-radius: 999px;
        padding: 6px 10px;
        color: var(--text);
        background: #fff;
        font-size: 0.88rem;
      }

      .lang-nav a[aria-current="page"] {
        background: #0d6efd;
        color: #fff;
        border-color: #0d6efd;
      }

      @media (max-width: 640px) {
        main {
          margin: 16px auto;
        }

        article {
          padding: 20px 16px;
          border-radius: 12px;
        }

        h1 {
          font-size: 1.7rem;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <article>
        ${buildLanguageNav(doc.fileName, locale.path)}
        <h1>${linkify(title)}</h1>
        <p class="meta"><strong>${escapeHtml(lastUpdated)}</strong> ${escapeHtml(LAST_UPDATED_DATE)}</p>
        <p>${linkify(intro)}</p>
        ${sectionHtml}
        <p class="legal-links">
          ${escapeHtml(relatedLabel)}
          <a href="${relatedHref}">${escapeHtml(relatedLinkText)}</a>
        </p>
      </article>
    </main>
  </body>
</html>`;
}

function renderIndexPage() {
  const rows = locales
    .map(
      (locale) =>
        `<tr><td>${escapeHtml(locale.name)}</td><td>${escapeHtml(locale.code)}</td><td><a href="/legal/${locale.path}/privacy-policy.html">Privacy Policy</a></td><td><a href="/legal/${locale.path}/terms-of-use.html">Terms of Use</a></td></tr>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Mingle Legal</title>
    <style>
      body {
        margin: 0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        background: #f6f8fd;
        color: #162033;
      }

      main {
        max-width: 960px;
        margin: 40px auto;
        padding: 0 16px 24px;
      }

      .card {
        background: #fff;
        border: 1px solid #dbe2ef;
        border-radius: 14px;
        padding: 24px;
      }

      h1 {
        margin-top: 0;
      }

      a {
        color: #0d6efd;
      }

      table {
        border-collapse: collapse;
        width: 100%;
      }

      th,
      td {
        border-bottom: 1px solid #e6ebf5;
        padding: 10px 8px;
        text-align: left;
        font-size: 0.95rem;
      }

      th {
        background: #f8faff;
      }
    </style>
  </head>
  <body>
    <main>
      <section class="card">
        <h1>Mingle Legal Documents</h1>
        <p>Supported language set (15 locales) for App Store and user trust pages.</p>
        <table>
          <thead>
            <tr><th>Language</th><th>Locale</th><th>Privacy</th><th>Terms</th></tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </section>
    </main>
  </body>
</html>`;
}

function collectSegments() {
  const segments = [];
  const add = (key, value) => segments.push({ key, value });

  add("meta.lastUpdated", "Last updated:");
  for (const doc of docs) {
    add(`${doc.key}.title`, doc.title);
    add(`${doc.key}.description`, doc.description);
    add(`${doc.key}.intro`, doc.intro);
    add(`${doc.key}.relatedLabel`, doc.relatedLabel);
    add(`${doc.key}.relatedLinkText`, doc.relatedLinkText);
    doc.sections.forEach((section, sIdx) => {
      add(`${doc.key}.section.${sIdx}.heading`, section.heading);
      (section.paragraphs ?? []).forEach((p, pIdx) =>
        add(`${doc.key}.section.${sIdx}.p.${pIdx}`, p),
      );
      (section.list ?? []).forEach((li, lIdx) =>
        add(`${doc.key}.section.${sIdx}.li.${lIdx}`, li),
      );
      if (section.tailParagraph) {
        add(`${doc.key}.section.${sIdx}.tail`, section.tailParagraph);
      }
    });
  }

  return segments;
}

function flattenTranslatedBody(rawText, expectedCount) {
  const markerRe = /\[\[\[SEG_(\d+)\]\]\]/g;
  const markers = [...rawText.matchAll(markerRe)];
  if (markers.length !== expectedCount) {
    return null;
  }
  const result = new Map();
  for (let i = 0; i < markers.length; i += 1) {
    const current = markers[i];
    const next = markers[i + 1];
    const index = Number(current[1]);
    const start = (current.index ?? 0) + current[0].length;
    const end = next ? next.index ?? rawText.length : rawText.length;
    result.set(index, rawText.slice(start, end).trim());
  }
  return result;
}

async function translateSegments(targetLocale, segments) {
  if (targetLocale === "en") {
    return new Map(segments.map((segment) => [segment.key, segment.value]));
  }

  const body = segments
    .map((segment, index) => `[[[SEG_${index}]]]\n${segment.value}`)
    .join("\n");

  const url =
    "https://translate.googleapis.com/translate_a/single" +
    `?client=gtx&sl=en&tl=${encodeURIComponent(targetLocale)}` +
    `&dt=t&q=${encodeURIComponent(body)}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Translation request failed for ${targetLocale}: ${response.status}`);
  }

  const payload = await response.json();
  const translated = payload?.[0]?.map((item) => item?.[0] ?? "").join("") ?? "";
  const indexMap = flattenTranslatedBody(translated, segments.length);
  if (!indexMap) {
    throw new Error(`Could not parse translated payload for ${targetLocale}`);
  }

  const output = new Map();
  segments.forEach((segment, index) => {
    output.set(segment.key, indexMap.get(index) ?? segment.value);
  });
  return output;
}

async function generate() {
  const segments = collectSegments();
  const renderedByLocale = new Map();

  for (const locale of locales) {
    const textMap = await translateSegments(locale.code, segments);
    const localeDir = path.join(LEGAL_ROOT, locale.path);
    await mkdir(localeDir, { recursive: true });

    const renderedDocs = new Map();
    for (const doc of docs) {
      const html = renderDocumentHtml(doc, locale, textMap);
      await writeFile(path.join(localeDir, doc.fileName), html, "utf8");
      renderedDocs.set(doc.fileName, html);
    }
    renderedByLocale.set(locale.path, renderedDocs);
  }

  // Keep existing root URLs stable for App Store metadata with full EN content.
  const englishDocs = renderedByLocale.get("en");
  if (!englishDocs) {
    throw new Error("English legal docs were not generated");
  }
  await writeFile(path.join(LEGAL_ROOT, "privacy-policy.html"), englishDocs.get("privacy-policy.html"), "utf8");
  await writeFile(path.join(LEGAL_ROOT, "terms-of-use.html"), englishDocs.get("terms-of-use.html"), "utf8");
  await writeFile(path.join(LEGAL_ROOT, "index.html"), renderIndexPage(), "utf8");
}

generate().catch((error) => {
  console.error(error);
  process.exit(1);
});
