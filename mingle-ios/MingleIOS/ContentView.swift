import SwiftUI

private struct LanguageOption: Identifiable {
    let code: String
    let flag: String
    let englishName: String

    var id: String { code }
}

private let languageOptions: [LanguageOption] = [
    .init(code: "en", flag: "🇺🇸", englishName: "English"),
    .init(code: "ko", flag: "🇰🇷", englishName: "Korean"),
    .init(code: "ja", flag: "🇯🇵", englishName: "Japanese"),
    .init(code: "zh", flag: "🇨🇳", englishName: "Chinese"),
    .init(code: "es", flag: "🇪🇸", englishName: "Spanish"),
    .init(code: "fr", flag: "🇫🇷", englishName: "French"),
    .init(code: "de", flag: "🇩🇪", englishName: "German"),
    .init(code: "ru", flag: "🇷🇺", englishName: "Russian"),
    .init(code: "pt", flag: "🇧🇷", englishName: "Portuguese"),
    .init(code: "ar", flag: "🇸🇦", englishName: "Arabic"),
    .init(code: "hi", flag: "🇮🇳", englishName: "Hindi"),
    .init(code: "th", flag: "🇹🇭", englishName: "Thai"),
    .init(code: "vi", flag: "🇻🇳", englishName: "Vietnamese"),
    .init(code: "it", flag: "🇮🇹", englishName: "Italian"),
    .init(code: "id", flag: "🇮🇩", englishName: "Indonesian"),
]

private let minSelectedLanguages = 1
private let maxSelectedLanguages = 5
private let volumeThreshold: Float = 0.05
private let sourceBubbleMaxWidthRatio: CGFloat = 0.85
private let translatedBubbleMaxWidthRatio: CGFloat = 0.80

struct ContentView: View {
    @StateObject private var viewModel = AppViewModel()
    @AppStorage("mingle_ios_tts_enabled") private var isSoundEnabled = false
    @AppStorage("mingle_ios_aec_enabled") private var isAecEnabled = false
    @State private var activeSheet: ActiveSheet?

    private enum ActiveSheet: Int, Identifiable {
        case languages
        case backend

        var id: Int { rawValue }
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider().overlay(Color.gray.opacity(0.12))
            timeline
            Divider().overlay(Color.gray.opacity(0.12))
            bottomControlBar
        }
        .background(Color(uiColor: .systemGray6).ignoresSafeArea())
        .sheet(item: $activeSheet) { sheet in
            switch sheet {
            case .languages:
                languageSelectionSheet
            case .backend:
                backendSettingsSheet
            }
        }
        .onAppear {
            viewModel.ttsEnabled = isSoundEnabled
            viewModel.updateAec(enabled: isAecEnabled)
        }
        .onChange(of: isSoundEnabled) { newValue in
            viewModel.ttsEnabled = newValue
        }
        .onChange(of: isAecEnabled) { newValue in
            viewModel.updateAec(enabled: newValue)
        }
    }

    private var showEmptyStatePrompt: Bool {
        viewModel.utterances.isEmpty
            && viewModel.partialTranscript.isEmpty
            && !viewModel.isRecording
            && !isConnecting
            && !isError
    }

    private var header: some View {
        HStack(alignment: .top, spacing: 12) {
            Text("Mingle")
                .font(.system(size: 54, weight: .heavy, design: .rounded))
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .foregroundStyle(
                    LinearGradient(
                        colors: [Color(red: 0.98, green: 0.63, blue: 0.08), Color(red: 0.95, green: 0.42, blue: 0.06)],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                )
                .onLongPressGesture {
                    activeSheet = .backend
                }

            Spacer()

            Button {
                guard !viewModel.isRecording else { return }
                activeSheet = .languages
            } label: {
                HStack(spacing: 4) {
                    ForEach(displayLanguages, id: \.self) { language in
                        Text(flagForLanguage(language))
                            .font(.system(size: 26))
                    }
                }
            }
            .buttonStyle(.plain)
            .opacity(viewModel.isRecording ? 0.65 : 1)
        }
        .padding(.horizontal, 18)
        .padding(.top, 12)
        .padding(.bottom, 12)
        .background(Color(uiColor: .systemGray6))
    }

    private var timeline: some View {
        ZStack {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 12) {
                        ForEach(viewModel.utterances) { utterance in
                            conversationTurn(utterance)
                                .id(utterance.id)
                        }

                        if !viewModel.partialTranscript.isEmpty {
                            partialTranscriptSection
                                .id("partial-transcript")
                        }

                        Color.clear.frame(height: 8).id("bottom-anchor")
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 10)
                }
                .onAppear {
                    scrollToBottom(proxy)
                }
                .onChange(of: viewModel.utterances.count) { _ in
                    scrollToBottom(proxy)
                }
                .onChange(of: viewModel.partialTranscript) { _ in
                    scrollToBottom(proxy)
                }
            }

            if isConnecting {
                VStack(spacing: 8) {
                    ProgressView()
                    Text(connectingLabel)
                        .font(.system(size: 14))
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, 16)
            }

            if isError {
                VStack(spacing: 6) {
                    Text(connectionFailedLabel)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.red)
                    if let error = viewModel.lastErrorMessage, !error.isEmpty {
                        Text(error)
                            .font(.system(size: 12))
                            .foregroundStyle(.red.opacity(0.8))
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 24)
                    }
                }
                .padding(.vertical, 16)
            }

            if showEmptyStatePrompt {
                emptyStatePrompt
            }
        }
        .background(Color(uiColor: .systemGray6))
    }

    private func conversationTurn(_ utterance: Utterance) -> some View {
        let targetLanguages = orderedTargetLanguages(for: utterance)
        let translationEntries = targetLanguages
            .map { language -> (String, String, Bool)? in
                let text = utterance.translations[language]?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                if text.isEmpty { return nil }
                let isFinalized = utterance.translationFinalized[language] != false
                return (language, text, isFinalized)
            }
            .compactMap { $0 }

        let pendingLanguages = targetLanguages.filter { language in
            let text = utterance.translations[language]?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            return text.isEmpty
        }

        return VStack(alignment: .leading, spacing: 4) {
            sourceBubble(utterance)

            ForEach(translationEntries, id: \.0) { language, text, isFinalized in
                translatedBubble(language: language, text: text, isFinalized: isFinalized)
            }

            ForEach(pendingLanguages, id: \.self) { language in
                pendingTranslationBubble(language: language)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func sourceBubble(_ utterance: Utterance) -> some View {
        bubbleCard(
            language: utterance.originalLang,
            text: utterance.originalText,
            timestampText: formattedBubbleTimestamp(ms: utterance.createdAtMs),
            backgroundColor: .white,
            borderColor: Color.gray.opacity(0.22),
            languageColor: Color.gray.opacity(0.7),
            textColor: Color.black.opacity(0.92),
            leadingInset: 0,
            maxWidthRatio: sourceBubbleMaxWidthRatio,
            showPendingDot: false,
            showBouncingDots: false,
            showLiveCursor: false,
            addShadow: true
        )
    }

    private func translatedBubble(language: String, text: String, isFinalized: Bool) -> some View {
        bubbleCard(
            language: language,
            text: text,
            timestampText: nil,
            backgroundColor: isFinalized ? Color(red: 0.985, green: 0.97, blue: 0.90) : Color.gray.opacity(0.10),
            borderColor: isFinalized ? Color(red: 0.95, green: 0.88, blue: 0.62) : Color.gray.opacity(0.22),
            languageColor: isFinalized ? Color.orange : Color.gray.opacity(0.6),
            textColor: isFinalized ? Color.gray.opacity(0.82) : Color.gray.opacity(0.68),
            leadingInset: 10,
            maxWidthRatio: translatedBubbleMaxWidthRatio,
            showPendingDot: !isFinalized,
            showBouncingDots: false,
            showLiveCursor: false,
            addShadow: false
        )
    }

    private func pendingTranslationBubble(language: String) -> some View {
        bubbleCard(
            language: language,
            text: "",
            timestampText: nil,
            backgroundColor: Color(red: 0.985, green: 0.97, blue: 0.90).opacity(0.72),
            borderColor: Color(red: 0.95, green: 0.88, blue: 0.62),
            languageColor: Color.orange.opacity(0.75),
            textColor: .secondary,
            leadingInset: 10,
            maxWidthRatio: translatedBubbleMaxWidthRatio,
            showPendingDot: false,
            showBouncingDots: true,
            showLiveCursor: false,
            addShadow: false
        )
    }

    private var partialTranscriptSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            bubbleCard(
                language: viewModel.partialLanguage,
                text: viewModel.partialTranscript,
                timestampText: nil,
                backgroundColor: Color.white.opacity(0.82),
                borderColor: Color.gray.opacity(0.24),
                languageColor: Color.gray.opacity(0.62),
                textColor: Color.gray.opacity(0.78),
                leadingInset: 0,
                maxWidthRatio: sourceBubbleMaxWidthRatio,
                showPendingDot: false,
                showBouncingDots: false,
                showLiveCursor: true,
                addShadow: false
            )

            ForEach(pendingPartialLanguages, id: \.self) { language in
                pendingTranslationBubble(language: language)
            }
        }
    }

    private func bubbleCard(
        language: String,
        text: String,
        timestampText: String?,
        backgroundColor: Color,
        borderColor: Color,
        languageColor: Color,
        textColor: Color,
        leadingInset: CGFloat,
        maxWidthRatio: CGFloat,
        showPendingDot: Bool,
        showBouncingDots: Bool,
        showLiveCursor: Bool,
        addShadow: Bool
    ) -> some View {
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .center, spacing: 6) {
                    Text(flagForLanguage(language))
                        .font(.system(size: 18))

                    Text(displayCode(for: language))
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(languageColor)
                        .textCase(.uppercase)

                    if showPendingDot {
                        Circle()
                            .fill(Color.gray.opacity(0.52))
                            .frame(width: 5, height: 5)
                    }

                    Spacer(minLength: 0)

                    if let timestampText, !timestampText.isEmpty {
                        Text(timestampText)
                            .font(.system(size: 11, weight: .regular))
                            .foregroundStyle(Color.black.opacity(0.34))
                            .monospacedDigit()
                    }
                }

                if showBouncingDots {
                    BouncingDotsView(color: Color.orange.opacity(0.72))
                        .padding(.top, 1)
                        .padding(.bottom, 1)
                } else {
                    HStack(spacing: 2) {
                        Text(text)
                            .font(.system(size: 16, weight: .regular))
                            .foregroundStyle(textColor)
                            .fixedSize(horizontal: false, vertical: true)

                        if showLiveCursor {
                            Rectangle()
                                .fill(Color.orange.opacity(0.9))
                                .frame(width: 2, height: 16)
                                .cornerRadius(1)
                                .opacity(0.85)
                        }
                    }
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .frame(maxWidth: bubbleMaxWidth(for: maxWidthRatio), alignment: .leading)
            .background(
                ChatBubbleShape()
                    .fill(backgroundColor)
            )
            .overlay(
                ChatBubbleShape()
                    .stroke(borderColor, lineWidth: 1)
            )
            .shadow(
                color: addShadow ? Color.black.opacity(0.08) : .clear,
                radius: addShadow ? 4 : 0,
                x: 0,
                y: addShadow ? 2 : 0
            )

            Spacer(minLength: 0)
        }
        .padding(.leading, leadingInset)
    }

    private var bottomControlBar: some View {
        HStack(alignment: .center) {
            leftUsageArea

            Spacer(minLength: 8)

            micButton

            Spacer(minLength: 8)

            rightControlArea
        }
        .padding(.top, 10)
        .padding(.bottom, 18)
        .padding(.horizontal, 14)
        .background(Color.white)
    }

    private var emptyStatePrompt: some View {
        GeometryReader { geometry in
            let midX = geometry.size.width / 2
            let textY = geometry.size.height * 0.48
            let arrowTop = textY + 26
            let arrowBottom = max(arrowTop + 32, geometry.size.height - 16)

            ZStack {
                Text(tapPlayToStartLabel)
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .position(x: midX, y: textY)

                Path { path in
                    path.move(to: CGPoint(x: midX, y: arrowTop))
                    path.addLine(to: CGPoint(x: midX, y: arrowBottom))

                    path.move(to: CGPoint(x: midX, y: arrowBottom))
                    path.addLine(to: CGPoint(x: midX - 9, y: arrowBottom - 9))

                    path.move(to: CGPoint(x: midX, y: arrowBottom))
                    path.addLine(to: CGPoint(x: midX + 9, y: arrowBottom - 9))
                }
                .stroke(
                    Color.gray.opacity(0.34),
                    style: StrokeStyle(lineWidth: 3, lineCap: .round, lineJoin: .round)
                )
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .allowsHitTesting(false)
    }

    private var leftUsageArea: some View {
        Group {
            if viewModel.usageSec > 0 {
                Text("\(viewModel.usageSec)s")
                    .font(.system(size: 17, weight: .regular))
                    .foregroundStyle(Color.gray.opacity(0.78))
                    .monospacedDigit()
                    .frame(minWidth: 90, alignment: .leading)
            } else {
                Color.clear.frame(width: 90, height: 1)
            }
        }
    }

    private var micButton: some View {
        let showRipple = isReady && viewModel.volumeLevel > volumeThreshold
        let rippleScale = 1.0 + CGFloat(max(0, viewModel.volumeLevel - volumeThreshold)) * 5.0

        return Button {
            handleMicTap()
        } label: {
            ZStack {
                if showRipple {
                    Circle()
                        .fill(Color.red.opacity(0.24))
                        .frame(width: 72, height: 72)
                        .scaleEffect(rippleScale)
                }

                if isReady {
                    Circle()
                        .fill(Color.red.opacity(0.20))
                        .frame(width: 68, height: 68)
                }

                Circle()
                    .fill(micButtonFill)
                    .frame(width: 64, height: 64)
                    .shadow(color: .black.opacity(0.18), radius: 8, x: 0, y: 5)

                if isConnecting {
                    ProgressView()
                        .tint(.white)
                        .scaleEffect(1.1)
                } else {
                    Image(systemName: "play.fill")
                        .font(.system(size: 30, weight: .medium))
                        .foregroundStyle(.white)
                        .offset(x: 2)
                }
            }
        }
        .buttonStyle(.plain)
        .disabled(isConnecting)
        .opacity(isConnecting ? 0.56 : 1)
    }

    private var rightControlArea: some View {
        Group {
            if viewModel.usageSec > 0 {
                HStack(spacing: 8) {
                    Button {
                        isSoundEnabled.toggle()
                    } label: {
                        Image(systemName: isSoundEnabled ? "speaker.wave.2.fill" : "speaker.slash.fill")
                            .font(.system(size: 20, weight: .semibold))
                            .foregroundStyle(isSoundEnabled ? Color.orange : Color.gray.opacity(0.72))
                            .frame(width: 32, height: 32)
                    }
                    .buttonStyle(.plain)

                    Button {
                        isAecEnabled.toggle()
                    } label: {
                        EchoInputRouteIcon(echoAllowed: !isAecEnabled)
                            .frame(width: 38, height: 22)
                    }
                    .buttonStyle(.plain)
                }
                .frame(minWidth: 90, alignment: .trailing)
            } else {
                Color.clear.frame(width: 90, height: 1)
            }
        }
    }

    private var languageSelectionSheet: some View {
        NavigationStack {
            List {
                Section("언어 선택") {
                    ForEach(sortedLanguageOptions) { option in
                        let selected = containsSelectedLanguage(option.code)
                        let canSelectMore = selectedLanguageCodes.count < maxSelectedLanguages
                        let canDeselect = selectedLanguageCodes.count > minSelectedLanguages
                        let disabled = (selected && !canDeselect) || (!selected && !canSelectMore) || viewModel.isRecording

                        Button {
                            guard !disabled else { return }
                            toggleSelectedLanguage(option.code)
                        } label: {
                            HStack(spacing: 10) {
                                ZStack {
                                    RoundedRectangle(cornerRadius: 4, style: .continuous)
                                        .stroke(selected ? Color.orange : Color.gray.opacity(0.42), lineWidth: 1)
                                        .frame(width: 18, height: 18)
                                    if selected {
                                        RoundedRectangle(cornerRadius: 4, style: .continuous)
                                            .fill(Color.orange)
                                            .frame(width: 18, height: 18)
                                        Image(systemName: "checkmark")
                                            .font(.system(size: 10, weight: .bold))
                                            .foregroundStyle(.white)
                                    }
                                }

                                Text(option.flag)
                                    .font(.system(size: 20))

                                Text(localizedLanguageName(for: option))
                                    .font(.system(size: 15))
                                    .foregroundStyle(disabled && !selected ? .secondary : .primary)

                                Spacer()
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .opacity(disabled && !selected ? 0.45 : 1)
                    }
                }
            }
            .navigationTitle("Languages")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Backend") {
                        activeSheet = .backend
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("닫기") {
                        activeSheet = nil
                    }
                }
            }
        }
    }

    private var backendSettingsSheet: some View {
        NavigationStack {
            Form {
                Section("Backend") {
                    TextField("API Base URL", text: $viewModel.apiBaseURL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)

                    TextField("WS URL", text: $viewModel.wsURL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)

                    TextField("Languages (comma-separated)", text: $viewModel.languagesCSV)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }

                Section("Status") {
                    HStack {
                        Text("Connection")
                        Spacer()
                        Text(connectionStatusLabel)
                            .foregroundStyle(connectionStatusColor)
                    }

                    if let error = viewModel.lastErrorMessage, !error.isEmpty {
                        Text(error)
                            .font(.system(size: 13))
                            .foregroundStyle(.red)
                    }

                    Button("대화 기록 초기화", role: .destructive) {
                        viewModel.clearHistory()
                    }
                }
            }
            .navigationTitle("Backend Settings")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("닫기") {
                        activeSheet = nil
                    }
                }
            }
        }
    }

    private var isReady: Bool {
        viewModel.connectionStatus == "ready"
    }

    private var isConnecting: Bool {
        viewModel.connectionStatus == "connecting"
    }

    private var isError: Bool {
        viewModel.connectionStatus == "error"
    }

    private var micButtonFill: LinearGradient {
        if isReady {
            return LinearGradient(colors: [Color.red, Color.red], startPoint: .topLeading, endPoint: .bottomTrailing)
        }
        if isConnecting || isError {
            return LinearGradient(colors: [Color.gray.opacity(0.66), Color.gray.opacity(0.72)], startPoint: .topLeading, endPoint: .bottomTrailing)
        }
        return LinearGradient(colors: [Color(red: 0.97, green: 0.74, blue: 0.18), Color(red: 0.95, green: 0.47, blue: 0.07)], startPoint: .topLeading, endPoint: .bottomTrailing)
    }

    private var selectedLanguageCodes: [String] {
        var result: [String] = []
        var seen = Set<String>()

        for token in viewModel.languagesCSV.split(separator: ",") {
            let code = normalizedLanguageCode(String(token))
            if code.isEmpty || seen.contains(code) { continue }
            seen.insert(code)
            result.append(code)
        }

        if result.isEmpty {
            return ["en", "ko", "ja"]
        }
        return result
    }

    private var displayLanguages: [String] {
        selectedLanguageCodes
    }

    private var sortedLanguageOptions: [LanguageOption] {
        let sorted = languageOptions.sorted { lhs, rhs in
            if lhs.code == "en" { return true }
            if rhs.code == "en" { return false }
            return lhs.englishName.localizedCaseInsensitiveCompare(rhs.englishName) == .orderedAscending
        }
        return sorted
    }

    private var pendingPartialLanguages: [String] {
        if viewModel.partialTranscript.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return []
        }
        let source = normalizedLanguageCode(viewModel.partialLanguage)
        return selectedLanguageCodes.filter { normalizedLanguageCode($0) != source }
    }

    private var connectionStatusLabel: String {
        switch viewModel.connectionStatus {
        case "ready":
            return viewModel.isRecording ? "Ready" : "Idle"
        case "connecting":
            return "Connecting"
        case "stopping":
            return "Stopping"
        case "error":
            return "Error"
        default:
            return "Idle"
        }
    }

    private var connectionStatusColor: Color {
        switch viewModel.connectionStatus {
        case "ready": return .green
        case "connecting", "stopping": return .orange
        case "error": return .red
        default: return .secondary
        }
    }

    private var tapPlayToStartLabel: String {
        switch uiBaseLanguageCode() {
        case "ko": return "재생 버튼을 눌러 시작하세요"
        case "ja": return "再生ボタンを押して開始"
        default: return "Tap play to start"
        }
    }

    private var connectingLabel: String {
        switch uiBaseLanguageCode() {
        case "ko": return "연결 중..."
        case "ja": return "接続中..."
        default: return "Connecting..."
        }
    }

    private var connectionFailedLabel: String {
        switch uiBaseLanguageCode() {
        case "ko": return "연결 실패"
        case "ja": return "接続失敗"
        default: return "Connection failed"
        }
    }

    private func localizedLanguageName(for option: LanguageOption) -> String {
        Locale.current.localizedString(forLanguageCode: option.code) ?? option.englishName
    }

    private func containsSelectedLanguage(_ code: String) -> Bool {
        let normalized = normalizedLanguageCode(code)
        return selectedLanguageCodes.contains { normalizedLanguageCode($0) == normalized }
    }

    private func toggleSelectedLanguage(_ code: String) {
        let normalized = normalizedLanguageCode(code)
        var languages = selectedLanguageCodes

        if let index = languages.firstIndex(where: { normalizedLanguageCode($0) == normalized }) {
            if languages.count <= minSelectedLanguages { return }
            languages.remove(at: index)
        } else {
            if languages.count >= maxSelectedLanguages { return }
            languages.append(normalized)
        }

        viewModel.languagesCSV = languages.joined(separator: ",")
    }

    private func orderedTargetLanguages(for utterance: Utterance) -> [String] {
        let sourceLanguage = normalizedLanguageCode(utterance.originalLang)
        var ordered: [String] = []
        var seen = Set<String>()

        for language in utterance.targetLanguages {
            let normalized = normalizedLanguageCode(language)
            if normalized.isEmpty || normalized == sourceLanguage || seen.contains(normalized) { continue }
            seen.insert(normalized)
            ordered.append(normalized)
        }

        for language in utterance.translations.keys {
            let normalized = normalizedLanguageCode(language)
            if normalized.isEmpty || normalized == sourceLanguage || seen.contains(normalized) { continue }
            seen.insert(normalized)
            ordered.append(normalized)
        }

        for language in utterance.translationFinalized.keys {
            let normalized = normalizedLanguageCode(language)
            if normalized.isEmpty || normalized == sourceLanguage || seen.contains(normalized) { continue }
            seen.insert(normalized)
            ordered.append(normalized)
        }

        if ordered.isEmpty {
            for language in selectedLanguageCodes {
                let normalized = normalizedLanguageCode(language)
                if normalized.isEmpty || normalized == sourceLanguage || seen.contains(normalized) { continue }
                seen.insert(normalized)
                ordered.append(normalized)
            }
        }

        return ordered
    }

    private func handleMicTap() {
        if viewModel.isRecording {
            viewModel.stopRecording()
        } else {
            viewModel.startRecording()
        }
    }

    private func scrollToBottom(_ proxy: ScrollViewProxy) {
        withAnimation(.easeOut(duration: 0.22)) {
            proxy.scrollTo("bottom-anchor", anchor: .bottom)
        }
    }

    private func bubbleMaxWidth(for ratio: CGFloat) -> CGFloat {
        let screenWidth = UIScreen.main.bounds.width
        return max(220, screenWidth * ratio)
    }

    private func normalizedLanguageCode(_ raw: String) -> String {
        let normalized = raw
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "_", with: "-")
            .lowercased()
        return normalized.split(separator: "-").first.map(String.init) ?? ""
    }

    private func displayCode(for rawLanguage: String) -> String {
        let code = normalizedLanguageCode(rawLanguage)
        return code.isEmpty ? rawLanguage.uppercased() : code.uppercased()
    }

    private func flagForLanguage(_ rawLanguage: String) -> String {
        switch normalizedLanguageCode(rawLanguage) {
        case "en": return "🇺🇸"
        case "ko": return "🇰🇷"
        case "ja": return "🇯🇵"
        case "zh": return "🇨🇳"
        case "es": return "🇪🇸"
        case "fr": return "🇫🇷"
        case "de": return "🇩🇪"
        case "ru": return "🇷🇺"
        case "pt": return "🇧🇷"
        case "ar": return "🇸🇦"
        case "hi": return "🇮🇳"
        case "th": return "🇹🇭"
        case "vi": return "🇻🇳"
        case "it": return "🇮🇹"
        case "id": return "🇮🇩"
        default: return "🌐"
        }
    }

    private func uiBaseLanguageCode() -> String {
        let preferred = Locale.preferredLanguages.first ?? "en"
        let normalized = preferred.replacingOccurrences(of: "_", with: "-").lowercased()
        return normalized.split(separator: "-").first.map(String.init) ?? "en"
    }

    private func formatSecondsAgo(_ seconds: Int, lang: String) -> String {
        switch lang {
        case "ko": return "\(seconds)초 전"
        case "ja", "zh": return "\(seconds)秒前"
        case "es": return "hace \(seconds)s"
        case "fr": return "il y a \(seconds)s"
        case "de": return "vor \(seconds)s"
        case "pt": return "há \(seconds)s"
        case "it": return "\(seconds)s fa"
        default: return "\(seconds)s ago"
        }
    }

    private func formatAmPm(for lang: String) -> (am: String, pm: String) {
        switch lang {
        case "ko": return ("오전", "오후")
        case "ja": return ("午前", "午後")
        case "zh": return ("上午", "下午")
        default: return ("AM", "PM")
        }
    }

    private func format12Hour(_ date: Date, lang: String) -> String {
        let h24 = Calendar.current.component(.hour, from: date)
        let h12 = h24 == 0 ? 12 : (h24 > 12 ? h24 - 12 : h24)
        let minute = String(format: "%02d", Calendar.current.component(.minute, from: date))
        let period = h24 < 12 ? formatAmPm(for: lang).am : formatAmPm(for: lang).pm
        return "\(period) \(h12):\(minute)"
    }

    private func formattedBubbleTimestamp(ms: Int64) -> String {
        if ms <= 0 { return "" }

        let createdAt = Date(timeIntervalSince1970: TimeInterval(ms) / 1000)
        let now = Date()
        let lang = uiBaseLanguageCode()

        if Calendar.current.isDate(createdAt, equalTo: now, toGranularity: .minute) {
            let sec = max(0, Int(now.timeIntervalSince(createdAt)))
            return formatSecondsAgo(sec, lang: lang)
        }

        let sameYear = Calendar.current.isDate(createdAt, equalTo: now, toGranularity: .year)
        let sameMonth = Calendar.current.isDate(createdAt, equalTo: now, toGranularity: .month)
        let sameDay = Calendar.current.isDate(createdAt, inSameDayAs: now)
        let time = format12Hour(createdAt, lang: lang)

        let day = Calendar.current.component(.day, from: createdAt)
        let month = Calendar.current.component(.month, from: createdAt)
        let year = Calendar.current.component(.year, from: createdAt)

        if sameDay { return time }
        if sameMonth {
            if lang == "ko" { return "\(day)일 \(time)" }
            if lang == "ja" { return "\(day)日 \(time)" }
            return "\(day) \(time)"
        }
        if sameYear {
            if lang == "ko" { return "\(month)월 \(day)일 \(time)" }
            if lang == "ja" { return "\(month)月\(day)日 \(time)" }
            return "\(month)/\(day) \(time)"
        }

        if lang == "ko" { return "\(year)년 \(month)월 \(day)일 \(time)" }
        if lang == "ja" { return "\(year)年\(month)月\(day)日 \(time)" }
        return "\(year)/\(month)/\(day) \(time)"
    }
}

private struct BouncingDotsView: View {
    let color: Color
    @State private var animate = false

    var body: some View {
        HStack(spacing: 4) {
            Circle()
                .fill(color)
                .frame(width: 5, height: 5)
                .offset(y: animate ? -2 : 2)
                .animation(.easeInOut(duration: 0.45).repeatForever(autoreverses: true), value: animate)
            Circle()
                .fill(color)
                .frame(width: 5, height: 5)
                .offset(y: animate ? -2 : 2)
                .animation(.easeInOut(duration: 0.45).repeatForever(autoreverses: true).delay(0.15), value: animate)
            Circle()
                .fill(color)
                .frame(width: 5, height: 5)
                .offset(y: animate ? -2 : 2)
                .animation(.easeInOut(duration: 0.45).repeatForever(autoreverses: true).delay(0.30), value: animate)
        }
        .onAppear {
            animate = true
        }
    }
}

private struct ChatBubbleShape: Shape {
    var topLeading: CGFloat = 8
    var topTrailing: CGFloat = 24
    var bottomTrailing: CGFloat = 24
    var bottomLeading: CGFloat = 24

    func path(in rect: CGRect) -> Path {
        let width = rect.width
        let height = rect.height
        let limit = min(width, height) / 2

        let tl = min(max(0, topLeading), limit)
        let tr = min(max(0, topTrailing), limit)
        let br = min(max(0, bottomTrailing), limit)
        let bl = min(max(0, bottomLeading), limit)

        var path = Path()
        path.move(to: CGPoint(x: rect.minX + tl, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX - tr, y: rect.minY))
        path.addArc(
            center: CGPoint(x: rect.maxX - tr, y: rect.minY + tr),
            radius: tr,
            startAngle: .degrees(-90),
            endAngle: .degrees(0),
            clockwise: false
        )
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - br))
        path.addArc(
            center: CGPoint(x: rect.maxX - br, y: rect.maxY - br),
            radius: br,
            startAngle: .degrees(0),
            endAngle: .degrees(90),
            clockwise: false
        )
        path.addLine(to: CGPoint(x: rect.minX + bl, y: rect.maxY))
        path.addArc(
            center: CGPoint(x: rect.minX + bl, y: rect.maxY - bl),
            radius: bl,
            startAngle: .degrees(90),
            endAngle: .degrees(180),
            clockwise: false
        )
        path.addLine(to: CGPoint(x: rect.minX, y: rect.minY + tl))
        path.addArc(
            center: CGPoint(x: rect.minX + tl, y: rect.minY + tl),
            radius: tl,
            startAngle: .degrees(180),
            endAngle: .degrees(270),
            clockwise: false
        )
        path.closeSubpath()
        return path
    }
}

private struct EchoInputRouteIcon: View {
    let echoAllowed: Bool

    var body: some View {
        HStack(spacing: 1) {
            Image(systemName: "speaker.wave.2.fill")
                .font(.system(size: 11, weight: .semibold))
            Image(systemName: "arrow.right")
                .font(.system(size: 10, weight: .semibold))
            Image(systemName: "mic.fill")
                .font(.system(size: 11, weight: .semibold))
        }
        .foregroundStyle(echoAllowed ? Color.orange : Color.gray.opacity(0.65))
        .overlay {
            if !echoAllowed {
                Rectangle()
                    .fill(Color.gray.opacity(0.65))
                    .frame(height: 2)
                    .rotationEffect(.degrees(-24))
            }
        }
    }
}
