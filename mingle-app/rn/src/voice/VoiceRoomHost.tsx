import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

import { createVoiceController, type VoiceController, type VoiceGridMember } from '../nativeVoice';
import { createVoiceApi, type VoiceApi, type VoiceCall, type VoiceParticipant } from './voiceApi';
import { createLiveKitRoom } from './createLiveKitRoom';
import { createVoiceStatusPoll, type VoiceStatusPoll } from './voiceStatusPoll';
import { VoiceMiniBar } from './VoiceMiniBar';
import { VoiceRoomScreen } from './VoiceRoomScreen';
import type { VoiceRuntimeConfig } from './voiceConfig';
import type { VoiceBridgeEventDetail, VoicePhase } from './voiceBridge';

export type VoiceRoomHostHandle = {
  /** Open (or re-open) the room overlay for a conversation. */
  open: (args: { conversationId: string; title?: string; interpret?: boolean }) => void;
  /** Fully tear down and leave. */
  close: () => void;
  /** Ask the poller for the current banner status for a conversation. */
  requestStatus: (conversationId: string) => void;
};

export type VoiceRoomHostProps = {
  config: VoiceRuntimeConfig;
  localUserId: string;
  /** Emits native -> web bridge events (banner status + room phase). */
  emitToWeb: (detail: VoiceBridgeEventDetail) => void;
  onToggleSpeaker?: () => void;
  onInvite?: () => void;
  resolveAvatarUrl?: (member: VoiceGridMember) => string | null | undefined;
  resolveParticipantAvatarUrl?: (p: VoiceParticipant) => string | null | undefined;
  /** Injected in tests. */
  createApi?: (config: VoiceRuntimeConfig) => VoiceApi;
  createController?: typeof createVoiceController;
  topOffset?: number;
};

type OverlayState = 'closed' | 'full' | 'mini';

export const VoiceRoomHost = React.forwardRef<VoiceRoomHostHandle, VoiceRoomHostProps>(
  function VoiceRoomHost(props, ref) {
    const [overlay, setOverlay] = useState<OverlayState>('closed');
    const [title, setTitle] = useState<string | undefined>(undefined);
    const [conversationId, setConversationId] = useState<string | null>(null);

    const controllerRef = useRef<VoiceController | null>(null);
    const pollRef = useRef<VoiceStatusPoll | null>(null);

    const api = useMemo<VoiceApi>(
      () => (props.createApi ?? ((c) => createVoiceApi({ baseUrl: c.baseUrl, apiNamespace: c.apiNamespace })))(props.config),
      [props.config, props.createApi],
    );

    const emitPhase = useCallback(
      (phase: VoicePhase, convId: string | null, errorKind?: string) => {
        props.emitToWeb({ type: 'state', phase, conversationId: convId, errorKind });
      },
      [props],
    );

    const teardownPoll = useCallback(() => {
      pollRef.current?.stop();
      pollRef.current = null;
    }, []);

    const close = useCallback(() => {
      const controller = controllerRef.current;
      const convId = conversationId;
      if (controller) {
        void controller.leave().finally(() => emitPhase('left', convId));
      }
      controllerRef.current = null;
      teardownPoll();
      setOverlay('closed');
    }, [conversationId, emitPhase, teardownPoll]);

    const open = useCallback(
      (args: { conversationId: string; title?: string; interpret?: boolean }) => {
        // Re-opening the same live room just restores the full screen.
        if (controllerRef.current && conversationId === args.conversationId) {
          setOverlay('full');
          return;
        }
        // Switching conversation tears the old room down first.
        if (controllerRef.current) {
          void controllerRef.current.leave().catch(() => undefined);
          controllerRef.current = null;
        }
        const make = props.createController ?? createVoiceController;
        const controller = make({
          api,
          createRoom: createLiveKitRoom,
          myLang: props.config.myLang,
          localUserId: props.localUserId,
        });
        controllerRef.current = controller;
        setConversationId(args.conversationId);
        setTitle(args.title);
        setOverlay('full');
        emitPhase('connecting', args.conversationId);
        void controller
          .connect(args.conversationId)
          .then(() => emitPhase('connected', args.conversationId))
          .catch((error: unknown) => {
            emitPhase('error', args.conversationId, (error as { kind?: string })?.kind);
          });
      },
      [api, conversationId, emitPhase, props.config.myLang, props.createController, props.localUserId],
    );

    const requestStatus = useCallback(
      (convId: string) => {
        teardownPoll();
        const poll = createVoiceStatusPoll({
          api,
          conversationId: convId,
          onUpdate: (call: VoiceCall | null) => {
            props.emitToWeb({ type: 'status', conversationId: convId, call });
          },
        });
        pollRef.current = poll;
        poll.start();
      },
      [api, props, teardownPoll],
    );

    useImperativeHandle(ref, () => ({ open, close, requestStatus }), [open, close, requestStatus]);

    useEffect(() => () => {
      teardownPoll();
      controllerRef.current?.leave().catch(() => undefined);
    }, [teardownPoll]);

    const controller = controllerRef.current;
    if (overlay === 'closed' || !controller) {
      return null;
    }

    return (
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="box-none">
        {overlay === 'full' ? (
          <VoiceRoomScreen
            controller={controller}
            locale={props.config.primaryLocale}
            myLang={props.config.myLang}
            title={title}
            onMinimize={() => setOverlay('mini')}
            onLeft={close}
            onToggleSpeaker={() => props.onToggleSpeaker?.()}
            onInvite={props.onInvite}
            resolveAvatarUrl={props.resolveAvatarUrl}
          />
        ) : (
          <VoiceMiniBar
            controller={controller}
            locale={props.config.primaryLocale}
            topOffset={props.topOffset ?? 70}
            onReopen={() => setOverlay('full')}
            onLeft={close}
          />
        )}
      </View>
    );
  },
);
