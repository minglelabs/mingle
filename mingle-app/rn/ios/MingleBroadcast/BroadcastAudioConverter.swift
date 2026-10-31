import AVFoundation
import CoreMedia

/// Turns ReplayKit's app-audio buffers into the PCM the app expects:
/// 16-bit little-endian mono at `MingleBroadcastChannel.sampleRate`.
///
/// Every channel is mixed down to mono. The capture includes this app's own
/// translation; the app removes it with an echo canceller that knows what it
/// played (see MingleTranslationEchoCanceller).
final class BroadcastAudioConverter {
    private var converter: AVAudioConverter?
    private var converterInputFormat: AVAudioFormat?
    private let outputFormat = AVAudioFormat(
        commonFormat: .pcmFormatInt16,
        sampleRate: Double(MingleBroadcastChannel.sampleRate),
        channels: 1,
        interleaved: true
    )

    /// The buffer as 16 kHz mono 16-bit PCM, or nil when it cannot be converted.
    func convert(_ sampleBuffer: CMSampleBuffer) -> Data? {
        guard let outputFormat,
              let description = CMSampleBufferGetFormatDescription(sampleBuffer)
        else {
            return nil
        }
        let frameCount = AVAudioFrameCount(CMSampleBufferGetNumSamples(sampleBuffer))
        guard frameCount > 0 else { return nil }

        // ReplayKit's layout varies (rate, channels, even byte order), so the
        // buffer's own description drives the conversion.
        let inputFormat = AVAudioFormat(cmAudioFormatDescription: description)
        guard let inputBuffer = AVAudioPCMBuffer(pcmFormat: inputFormat, frameCapacity: frameCount) else {
            return nil
        }
        inputBuffer.frameLength = frameCount
        let copied = CMSampleBufferCopyPCMDataIntoAudioBufferList(
            sampleBuffer,
            at: 0,
            frameCount: Int32(frameCount),
            into: inputBuffer.mutableAudioBufferList
        )
        guard copied == noErr else { return nil }

        if converter == nil || converterInputFormat != inputFormat {
            guard let next = AVAudioConverter(from: inputFormat, to: outputFormat) else { return nil }
            // Mix all channels instead of keeping one, so the mono capture
            // matches the mono reference the app subtracts.
            next.downmix = true
            converter = next
            converterInputFormat = inputFormat
            // Device tuning: whether ReplayKit hands over stereo or mono.
            NSLog("[MingleBroadcast] app audio format channels=%d sampleRate=%.0f interleaved=%d",
                  Int(inputFormat.channelCount), inputFormat.sampleRate, inputFormat.isInterleaved ? 1 : 0)
        }
        guard let converter else { return nil }

        let ratio = outputFormat.sampleRate / inputFormat.sampleRate
        let capacity = AVAudioFrameCount((Double(frameCount) * ratio).rounded(.up)) + 64
        guard let outputBuffer = AVAudioPCMBuffer(pcmFormat: outputFormat, frameCapacity: capacity) else {
            return nil
        }

        var supplied = false
        var conversionError: NSError?
        let status = converter.convert(to: outputBuffer, error: &conversionError) { _, inputStatus in
            if supplied {
                // More arrives with the next buffer; the converter keeps its state.
                inputStatus.pointee = .noDataNow
                return nil
            }
            supplied = true
            inputStatus.pointee = .haveData
            return inputBuffer
        }
        guard status != .error, conversionError == nil,
              outputBuffer.frameLength > 0,
              let samples = outputBuffer.int16ChannelData?[0]
        else {
            return nil
        }
        return Data(bytes: samples, count: Int(outputBuffer.frameLength) * MemoryLayout<Int16>.size)
    }
}
