export const ENDPOINT_MARKER_RE = /<\/?(?:end|fin)>/i;
export const ENDPOINT_MARKER_RE_GLOBAL = /<\/?(?:end|fin)>/gi;

export type SegmentationStrategyId = 'fin' | 'end' | 'llm';
export type EffectiveSegmentationStrategyId = 'fin' | 'end';
export type SonioxBoundaryMarker = 'fin' | 'end';

export type SonioxSegmentationRuntime =
    | {
          requested: 'fin' | 'llm';
          effective: 'fin';
          endpointDetection: false;
          carryPolicy: 'manual-finalize-snapshot';
          endpointDelayMs: number;
      }
    | {
          requested: 'end';
          effective: 'end';
          endpointDetection: true;
          carryPolicy: 'none';
          endpointDelayMs: number;
      };

export type NoSegmentationDecision = { action: 'none' };

export type ManualFinalizeDecision =
    | NoSegmentationDecision
    | {
          action: 'finalize';
          kind: 'manual-finalize';
          finalText: string;
          carryText: string;
          usedSnapshotBoundary: true;
      };

export type ProviderEndpointDecision =
    | NoSegmentationDecision
    | {
          action: 'finalize';
          kind: 'provider-endpoint';
          finalText: string;
      };

export type SonioxBoundaryTokenLike = {
    text?: unknown;
    start_ms?: unknown;
    end_ms?: unknown;
    is_final?: unknown;
    speaker?: unknown;
};

export type SonioxBoundaryPartition<T extends SonioxBoundaryTokenLike> = {
    before: T[];
    marker: T | null;
    markerKind: SonioxBoundaryMarker | null;
    after: T[];
};

export type SonioxFinalizeRequestCause = 'idle-fin' | 'stop-flush';

export type SonioxBoundaryHandling =
    | {
          action: 'none';
          cause: 'unsolicited';
          completeFinalizeRequest: false;
          carryAllowed: false;
      }
    | {
          action: 'provider-endpoint';
          cause: 'provider-endpoint' | 'provider-endpoint-during-stop';
          completeFinalizeRequest: false;
          carryAllowed: false;
      }
    | {
          action: 'provider-fallback';
          cause: 'unsolicited-fin';
          completeFinalizeRequest: false;
          carryAllowed: false;
      }
    | {
          action: 'manual-snapshot';
          cause: SonioxFinalizeRequestCause;
          completeFinalizeRequest: true;
          carryAllowed: true;
      }
    | {
          action: 'manual-full';
          cause: SonioxFinalizeRequestCause;
          completeFinalizeRequest: true;
          carryAllowed: false;
      };

export function stripEndpointMarkers(text: string): string {
    return text.replace(ENDPOINT_MARKER_RE_GLOBAL, '');
}

export function parseSonioxBoundaryMarker(rawText: unknown): SonioxBoundaryMarker | null {
    if (typeof rawText !== 'string') return null;
    const match = /<\/?(end|fin)>/i.exec(rawText);
    if (!match) return null;
    return match[1]?.toLowerCase() === 'end' ? 'end' : 'fin';
}

/**
 * Preserve token order around the first provider boundary marker.
 * Soniox documents the marker as a standalone final token at the end of a
 * segment, but splitting residual text keeps an anomalous combined token safe.
 */
export function partitionSonioxTokensAtFirstBoundary<T extends SonioxBoundaryTokenLike>(
    tokens: readonly T[],
): SonioxBoundaryPartition<T> {
    const before: T[] = [];

    for (let index = 0; index < tokens.length; index += 1) {
        const token = tokens[index]!;
        const tokenText = typeof token.text === 'string' ? token.text : '';
        const markerMatch = ENDPOINT_MARKER_RE.exec(tokenText);
        if (!markerMatch) {
            before.push(token);
            continue;
        }

        const markerKind = parseSonioxBoundaryMarker(markerMatch[0]);
        const markerStart = markerMatch.index;
        const markerEnd = markerStart + markerMatch[0].length;
        const prefix = tokenText.slice(0, markerStart);
        const suffix = tokenText.slice(markerEnd);
        if (prefix) {
            before.push({ ...token, text: prefix } as T);
        }

        const after: T[] = [];
        if (suffix) {
            // The suffix belongs to the next turn. Reusing the combined token's
            // timestamp would make the turn watermark discard it immediately.
            const suffixToken = { ...token, text: suffix };
            delete suffixToken.start_ms;
            delete suffixToken.end_ms;
            after.push(suffixToken as T);
        }
        after.push(...tokens.slice(index + 1));

        return {
            before,
            marker: { ...token, text: markerMatch[0] } as T,
            markerKind,
            after,
        };
    }

    return { before, marker: null, markerKind: null, after: [] };
}

/**
 * Resolve boundary ownership without mutating request state. In end mode an
 * <end> received during stop closes the utterance but deliberately leaves the
 * stop-flush request active; its later <fin> is the completion barrier.
 */
export function resolveSonioxBoundaryHandling(input: {
    effectiveStrategy: EffectiveSegmentationStrategyId;
    markerKind: SonioxBoundaryMarker | null;
    activeFinalizeCause: SonioxFinalizeRequestCause | null;
}): SonioxBoundaryHandling {
    if (!input.markerKind) {
        return {
            action: 'none',
            cause: 'unsolicited',
            completeFinalizeRequest: false,
            carryAllowed: false,
        };
    }

    if (input.effectiveStrategy === 'end' && input.markerKind === 'end') {
        return {
            action: 'provider-endpoint',
            cause: input.activeFinalizeCause === 'stop-flush'
                ? 'provider-endpoint-during-stop'
                : 'provider-endpoint',
            completeFinalizeRequest: false,
            carryAllowed: false,
        };
    }

    if (!input.activeFinalizeCause) {
        if (input.effectiveStrategy === 'end' && input.markerKind === 'fin') {
            return {
                action: 'provider-fallback',
                cause: 'unsolicited-fin',
                completeFinalizeRequest: false,
                carryAllowed: false,
            };
        }
        return {
            action: 'none',
            cause: 'unsolicited',
            completeFinalizeRequest: false,
            carryAllowed: false,
        };
    }

    if (input.effectiveStrategy === 'fin') {
        return {
            action: 'manual-snapshot',
            cause: input.activeFinalizeCause,
            completeFinalizeRequest: true,
            carryAllowed: true,
        };
    }

    return {
        action: 'manual-full',
        cause: input.activeFinalizeCause,
        completeFinalizeRequest: true,
        carryAllowed: false,
    };
}

export function selectSonioxBoundarySpeakerIds(input: {
    handling: SonioxBoundaryHandling;
    currentSpeakerIds: Iterable<string>;
    requestSpeakerIds: Iterable<string>;
}): string[] {
    if (
        input.handling.action === 'provider-endpoint'
        || input.handling.action === 'provider-fallback'
    ) {
        return Array.from(new Set(input.currentSpeakerIds));
    }
    if (
        input.handling.action === 'manual-snapshot'
        || input.handling.action === 'manual-full'
    ) {
        return Array.from(new Set(input.requestSpeakerIds));
    }
    return [];
}

export function evaluateManualFinalizeDecision(input: {
    mergedSnapshot: string;
    snapshotTextLen: number;
}): ManualFinalizeDecision {
    const mergedAtFinalize = stripEndpointMarkers(input.mergedSnapshot).trim();
    if (!mergedAtFinalize) return { action: 'none' };

    let snapshotBoundary = Math.min(
        Math.max(0, input.snapshotTextLen),
        mergedAtFinalize.length,
    );
    snapshotBoundary = snapBoundaryForwardInsideWord(mergedAtFinalize, snapshotBoundary);

    const finalText = mergedAtFinalize.slice(0, snapshotBoundary).trim();
    const carryText = mergedAtFinalize.slice(snapshotBoundary).trim();
    if (!finalText) return { action: 'none' };

    return {
        action: 'finalize',
        kind: 'manual-finalize',
        finalText,
        carryText,
        usedSnapshotBoundary: true,
    };
}

export function evaluateProviderEndpointDecision(input: {
    mergedSnapshot: string;
}): ProviderEndpointDecision {
    const finalText = stripEndpointMarkers(input.mergedSnapshot).trim();
    if (!finalText) return { action: 'none' };
    return {
        action: 'finalize',
        kind: 'provider-endpoint',
        finalText,
    };
}

function snapBoundaryForwardInsideWord(text: string, boundary: number): number {
    if (boundary <= 0 || boundary >= text.length) return boundary;
    const previousCharacter = text[boundary - 1] ?? '';
    const currentCharacter = text[boundary] ?? '';
    if (previousCharacter === ' ' || currentCharacter === ' ') return boundary;

    let snappedBoundary = boundary;
    while (snappedBoundary < text.length && text[snappedBoundary] !== ' ') {
        snappedBoundary += 1;
    }
    return snappedBoundary;
}

/** Timer and provisional-state ownership for manual-finalize carry only. */
export class ManualFinalizeCarryController {
    private expiryTimer: ReturnType<typeof setTimeout> | null = null;
    private provisional = false;

    constructor(
        private readonly expiryMs: number,
        private readonly onExpiry: () => void,
    ) {}

    get isProvisional(): boolean {
        return this.provisional;
    }

    begin(): void {
        this.reset();
        this.provisional = true;
        this.expiryTimer = setTimeout(() => {
            this.expiryTimer = null;
            if (!this.provisional) return;
            this.onExpiry();
        }, this.expiryMs);
    }

    resolve(): void {
        this.provisional = false;
        this.clearExpiryTimer();
    }

    reset(): void {
        this.provisional = false;
        this.clearExpiryTimer();
    }

    dispose(): void {
        this.reset();
    }

    private clearExpiryTimer(): void {
        if (!this.expiryTimer) return;
        clearTimeout(this.expiryTimer);
        this.expiryTimer = null;
    }
}

export function readSegmentationStrategyId(): SegmentationStrategyId {
    const raw = (process.env['SONIOX_SEGMENTATION_STRATEGY'] ?? '').trim().toLowerCase();
    if (raw === 'end') return 'end';
    if (raw === 'llm') return 'llm';
    return 'fin';
}

export function resolveSonioxSegmentationRuntime(
    requested: SegmentationStrategyId,
    configuredSilenceMs: number,
): SonioxSegmentationRuntime {
    if (requested === 'end') {
        return {
            requested,
            effective: 'end',
            endpointDetection: true,
            carryPolicy: 'none',
            endpointDelayMs: 2000,
        };
    }

    return {
        requested,
        effective: 'fin',
        endpointDetection: false,
        carryPolicy: 'manual-finalize-snapshot',
        endpointDelayMs: configuredSilenceMs,
    };
}

export function resolveSonioxEndpointLatencyAdjustmentLevel(
    raw = process.env['SONIOX_ENDPOINT_LATENCY_ADJUSTMENT_LEVEL'],
): number {
    const value = Number(raw);
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(3, Math.floor(value)));
}

export function resolveSonioxEndpointSensitivity(
    raw = process.env['SONIOX_ENDPOINT_SENSITIVITY'],
): number {
    const value = Number(raw);
    if (!Number.isFinite(value)) return 0;
    return Math.max(-1, Math.min(1, value));
}

export function buildSonioxEndpointDetectionConfig(
    runtime: SonioxSegmentationRuntime,
): Record<string, unknown> {
    if (!runtime.endpointDetection) {
        return { enable_endpoint_detection: false };
    }

    return {
        enable_endpoint_detection: true,
        endpoint_latency_adjustment_level: resolveSonioxEndpointLatencyAdjustmentLevel(),
        endpoint_sensitivity: resolveSonioxEndpointSensitivity(),
        max_endpoint_delay_ms: Math.max(500, Math.min(3000, runtime.endpointDelayMs)),
    };
}

// Compatibility helpers retained for focused configuration tests.
export function resolveSonioxEndpointDetectionConfig(
    id: SegmentationStrategyId,
    endpointDelayMs: number,
): Record<string, unknown> {
    const runtime = resolveSonioxSegmentationRuntime(id, endpointDelayMs);
    return buildSonioxEndpointDetectionConfig(
        runtime.effective === 'end'
            ? { ...runtime, endpointDelayMs }
            : runtime,
    );
}

export function resolveSonioxEndpointDelayMs(
    id: SegmentationStrategyId,
    configuredSilenceMs: number,
): number {
    return resolveSonioxSegmentationRuntime(id, configuredSilenceMs).endpointDelayMs;
}
