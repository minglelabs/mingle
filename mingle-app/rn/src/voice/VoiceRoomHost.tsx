import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react';

import { Platform } from 'react-native';
import { createVoiceController, type VoiceController } from '../nativeVoice';
import { defaultCallVolume } from './voiceProtocol';
import { setNativeSttVoiceCallActive } from '../nativeStt';
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
  /** The chat screen closed: stop polling. A joined call keeps running. */
  stopStatus: () => void;
  /** Speaker / earphone mode is reading a translation: quiet the call. */
  setReadingAloud: (on: boolean) => void;
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

    const memberCountRef = useRef(-1);
    const sendRoom = useCallback(() => {
      const controller = controllerRef.current;
      const convId = conversationRef.current;
      if (!controller || !convId) return;
      throttleRef.current.lastAt = Date.now();
      const snapshot = controller.getSnapshot();
      emitToWeb({ type: 'room', conversationId: convId, snapshot });
      // Someone joined or left: fetch the server's list now (names, photos)
      // instead of waiting for the next tick.
      if (snapshot.members.length !== memberCountRef.current) {
        memberCountRef.current = snapshot.members.length;
        void pollRef.current?.refresh();
      }
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
        // The web hides its panel on this, so it goes out before the
        // disconnect and the server call, which can take seconds.
        emitPhase('left', convId);
        void controller.leave().finally(() => {
          // After the call let go of the audio session, so STT (if it is
          // still on) takes the session back instead of losing it.
          setNativeSttVoiceCallActive(false);
          // The server now lists this phone as gone: show that at once.
          void pollRef.current?.refresh();
        });
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
        // Android plays the call much louder than iOS, even at the lowest
        // system volume, so its voices start turned down.
        controller.setCallVol(defaultCallVolume(Platform.OS));
        controllerRef.current = controller;
        conversationRef.current = args.conversationId;
        unsubscribeRef.current = controller.subscribe(scheduleRoom);
        // Before connecting: STT must not release the session under the call.
        setNativeSttVoiceCallActive(true);
        emitPhase('connecting', args.conversationId);
        if (args.interpret === false) void controller.setInterpret(false);
        void controller
          .connect(args.conversationId)
          .then(() => {
            // Again once connected: the microphone may only have been allowed
            // during the connect (Android starts the background service then).
            setNativeSttVoiceCallActive(true);
            emitPhase('connected', args.conversationId);
            sendRoom();
            // The server now lists this phone as in the call.
            void pollRef.current?.refresh();
          })
          .catch((error: unknown) => {
            emitPhase('error', args.conversationId, (error as { kind?: string })?.kind);
            if (controllerRef.current === controller) {
              setNativeSttVoiceCallActive(false);
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
      if (payload.volume !== undefined) controller.setCallVol(payload.volume);
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
        // Coming back to the room of a call this phone is in: the panel was
        // remounted and knows nothing, so tell it at once.
        if (controllerRef.current && conversationRef.current === convId) {
          const status = controllerRef.current.getSnapshot().status;
          emitPhase(status === 'connected' ? 'connected' : 'connecting', convId);
          sendRoom();
        }
      },
      [api, emitPhase, emitToWeb, sendRoom],
    );

    const stopStatus = useCallback(() => {
      pollRef.current?.stop();
      pollRef.current = null;
    }, []);

    const setReadingAloud = useCallback((on: boolean) => {
      controllerRef.current?.setReadingAloud(on);
    }, []);

    useImperativeHandle(
      ref,
      () => ({ open, close, requestStatus, set, stopStatus, setReadingAloud }),
      [open, close, requestStatus, set, stopStatus, setReadingAloud],
    );

    useEffect(() => () => {
      pollRef.current?.stop();
      const controller = controllerRef.current;
      detach();
      if (controller) setNativeSttVoiceCallActive(false);
      controller?.leave().catch(() => undefined);
    }, [detach]);

    return null;
  },
);
