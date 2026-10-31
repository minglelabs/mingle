import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react';

import { createVoiceController, type VoiceController } from '../nativeVoice';
import { createVoiceApi, type VoiceApi, type VoiceCall } from './voiceApi';
import { createLiveKitRoom } from './createLiveKitRoom';
import { createVoiceStatusPoll, type VoiceStatusPoll } from './voiceStatusPoll';
import type { VoiceRuntimeConfig } from './voiceConfig';
import type { VoiceBridgeEventDetail, VoicePhase, VoiceSetCommand } from './voiceBridge';

// Runs the group voice call with no screen of its own. The web chat page draws
// the panel under its top bar and drives this through the bridge; this sends
// the call state back as `room` events.

export type VoiceRoomHostHandle = {
  /** Join the call of a conversation (starting it if none is live). */
  open: (args: { conversationId: string; title?: string; interpret?: boolean }) => void;
  /** Leave the call. */
  close: () => void;
  /** Start polling who is in a conversation's call, for the web panel. */
  requestStatus: (conversationId: string) => void;
  /** Mic, interpretation, volume mode and mix, from the web panel's buttons. */
  set: (payload: VoiceSetCommand['payload']) => void;
};

export type VoiceRoomHostProps = {
  config: VoiceRuntimeConfig;
  localUserId: string;
  /** Emits native -> web bridge events. */
  emitToWeb: (detail: VoiceBridgeEventDetail) => void;
  /** Injected in tests. */
  createApi?: (config: VoiceRuntimeConfig) => VoiceApi;
  createController?: typeof createVoiceController;
};

// Speaking rings change often; the web gets at most this many updates a second.
const ROOM_EVENT_MIN_GAP_MS = 120;

export const VoiceRoomHost = React.forwardRef<VoiceRoomHostHandle, VoiceRoomHostProps>(
  function VoiceRoomHost(props, ref) {
    const { emitToWeb } = props;
    const controllerRef = useRef<VoiceController | null>(null);
    const conversationRef = useRef<string | null>(null);
    const unsubscribeRef = useRef<(() => void) | null>(null);
    const pollRef = useRef<VoiceStatusPoll | null>(null);
    const throttleRef = useRef<{ timer: ReturnType<typeof setTimeout> | null; lastAt: number }>({ timer: null, lastAt: 0 });

    const api = useMemo<VoiceApi>(
      () => (props.createApi ?? ((c) => createVoiceApi({ baseUrl: c.baseUrl, apiNamespace: c.apiNamespace })))(props.config),
      [props.config, props.createApi],
    );

    const emitPhase = useCallback(
      (phase: VoicePhase, convId: string | null, errorKind?: string) => {
        emitToWeb({ type: 'state', phase, conversationId: convId, errorKind });
      },
      [emitToWeb],
    );

    const sendRoom = useCallback(() => {
      const controller = controllerRef.current;
      const convId = conversationRef.current;
      if (!controller || !convId) return;
      throttleRef.current.lastAt = Date.now();
      emitToWeb({ type: 'room', conversationId: convId, snapshot: controller.getSnapshot() });
    }, [emitToWeb]);

    const scheduleRoom = useCallback(() => {
      const t = throttleRef.current;
      if (t.timer) return;
      const wait = Math.max(0, ROOM_EVENT_MIN_GAP_MS - (Date.now() - t.lastAt));
      t.timer = setTimeout(() => {
        t.timer = null;
        sendRoom();
      }, wait);
    }, [sendRoom]);

    const detach = useCallback(() => {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      if (throttleRef.current.timer) clearTimeout(throttleRef.current.timer);
      throttleRef.current.timer = null;
      controllerRef.current = null;
    }, []);

    const close = useCallback(() => {
      const controller = controllerRef.current;
      const convId = conversationRef.current;
      detach();
      conversationRef.current = null;
      if (controller) {
        void controller.leave().finally(() => emitPhase('left', convId));
      }
    }, [detach, emitPhase]);

    const open = useCallback(
      (args: { conversationId: string; title?: string; interpret?: boolean }) => {
        if (controllerRef.current && conversationRef.current === args.conversationId) {
          sendRoom();
          return;
        }
        if (controllerRef.current) close();
        const make = props.createController ?? createVoiceController;
        const controller = make({
          api,
          createRoom: createLiveKitRoom,
          myLang: props.config.myLang,
          localUserId: props.localUserId,
        });
        controllerRef.current = controller;
        conversationRef.current = args.conversationId;
        unsubscribeRef.current = controller.subscribe(scheduleRoom);
        emitPhase('connecting', args.conversationId);
        if (args.interpret === false) void controller.setInterpret(false);
        void controller
          .connect(args.conversationId)
          .then(() => {
            emitPhase('connected', args.conversationId);
            sendRoom();
          })
          .catch((error: unknown) => {
            emitPhase('error', args.conversationId, (error as { kind?: string })?.kind);
            if (controllerRef.current === controller) {
              detach();
              conversationRef.current = null;
            }
          });
      },
      [api, close, detach, emitPhase, props.config.myLang, props.createController, props.localUserId, scheduleRoom, sendRoom],
    );

    const set = useCallback((payload: VoiceSetCommand['payload']) => {
      const controller = controllerRef.current;
      if (!controller) return;
      if (payload.mic !== undefined) void controller.setMicOn(payload.mic);
      if (payload.interpret !== undefined) void controller.setInterpret(payload.interpret);
      if (payload.mode !== undefined) controller.setMode(payload.mode);
      if (payload.origVol !== undefined) controller.setOrigVol(payload.origVol);
    }, []);

    const requestStatus = useCallback(
      (convId: string) => {
        pollRef.current?.stop();
        const poll = createVoiceStatusPoll({
          api,
          conversationId: convId,
          onUpdate: (call: VoiceCall | null) => emitToWeb({ type: 'status', conversationId: convId, call }),
        });
        pollRef.current = poll;
        poll.start();
      },
      [api, emitToWeb],
    );

    useImperativeHandle(ref, () => ({ open, close, requestStatus, set }), [open, close, requestStatus, set]);

    useEffect(() => () => {
      pollRef.current?.stop();
      const controller = controllerRef.current;
      detach();
      controller?.leave().catch(() => undefined);
    }, [detach]);

    return null;
  },
);
