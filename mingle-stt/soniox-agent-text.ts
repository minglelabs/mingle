// Soniox "agent text input" (stt-rt-v6): the client tells us the translated
// sentence its TTS is reading aloud, in pieces timed to playback, and we pass
// it to Soniox on the same socket as the microphone audio. Soniox uses it to
// drop the echo of that voice from the transcript and as context for the
// user's reply. https://docs.soniox.com/stt/rt/agent-text-input

export const SONIOX_REALTIME_MODEL = 'stt-rt-v6';

// Soniox ends the stream when `enable_agent_text_input` is sent to a model
// without it, or when `agent_text` arrives without the start flag.
export function supportsSonioxAgentTextInput(model: string): boolean {
    return model === 'stt-rt-v6';
}

// The documented limit is "Maximum length is N characters" with no N, so
// stay well under any plausible value.
export const SONIOX_AGENT_TEXT_MAX_CHARS = 200;

// Only what is spoken aloud: no SSML/HTML tags, expression tags like
// [laughs], or markdown emphasis marks. Spaces are kept as sent, because Soniox
// joins the pieces of one turn exactly as it receives them.
export function sanitizeSonioxAgentText(raw: unknown): string {
    if (typeof raw !== 'string') return '';
    return raw
        .replace(/<[^>]*>/g, '')
        .replace(/\[[^\]]*\]/g, '')
        .replace(/[*`]/g, '');
}

export type SonioxAgentTextFrame = {
    type: 'agent_text';
    text: string;
    end_of_segment: boolean;
};

export function buildSonioxAgentTextFrames(rawText: unknown, endOfSegment: boolean): SonioxAgentTextFrame[] {
    const text = sanitizeSonioxAgentText(rawText);
    const frames: SonioxAgentTextFrame[] = [];
    // Split by code points so a surrogate pair is never cut in half.
    const chars = Array.from(text);
    for (let start = 0; start < chars.length; start += SONIOX_AGENT_TEXT_MAX_CHARS) {
        frames.push({
            type: 'agent_text',
            text: chars.slice(start, start + SONIOX_AGENT_TEXT_MAX_CHARS).join(''),
            end_of_segment: false,
        });
    }
    if (endOfSegment) {
        if (frames.length > 0) frames[frames.length - 1]!.end_of_segment = true;
        else frames.push({ type: 'agent_text', text: '', end_of_segment: true });
    }
    return frames;
}

/** Per-connection counters for the close log. Never holds the text itself. */
export class SonioxAgentTextStats {
    messages = 0;
    chars = 0;
    segments = 0;
    dropped = 0;

    recordSent(frames: readonly SonioxAgentTextFrame[]): void {
        for (const frame of frames) {
            this.messages += 1;
            this.chars += Array.from(frame.text).length;
            if (frame.end_of_segment) this.segments += 1;
        }
    }

    recordDropped(): void {
        this.dropped += 1;
    }

    summary(): string {
        return `agent_text_messages=${this.messages} agent_text_chars=${this.chars} agent_text_segments=${this.segments} agent_text_dropped=${this.dropped}`;
    }
}
