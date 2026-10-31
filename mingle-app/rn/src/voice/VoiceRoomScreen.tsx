import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { VoiceController, VoiceGridMember } from '../nativeVoice';
import { CaptionsList } from './CaptionsList';
import { SpeakerGrid } from './SpeakerGrid';
import { useVoiceSnapshot } from './useVoiceController';
import { VoiceControlsBar } from './VoiceControlsBar';
import { resolveVoiceStrings } from './voiceStrings';

export type VoiceRoomScreenProps = {
  controller: VoiceController;
  locale: string | null | undefined;
  myLang: string;
  title?: string;
  onMinimize: () => void;
  onLeft: () => void;
  onToggleSpeaker: () => void;
  onInvite?: () => void;
  resolveAvatarUrl?: (member: VoiceGridMember) => string | null | undefined;
};

export function VoiceRoomScreen(props: VoiceRoomScreenProps) {
  const insets = useSafeAreaInsets();
  const snapshot = useVoiceSnapshot(props.controller);
  const t = resolveVoiceStrings(props.locale);

  const handleLeave = () => {
    void props.controller.leave().finally(() => props.onLeft());
  };

  const statusLine =
    snapshot.status === 'connecting'
      ? t.connecting
      : snapshot.status === 'reconnecting'
        ? t.reconnecting
        : snapshot.status === 'error'
          ? snapshot.errorKind === 'voice_room_full'
            ? t.roomFull
            : snapshot.errorKind === 'forbidden'
              ? t.notMember
              : t.connectError
          : '';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={props.onMinimize} hitSlop={12} style={styles.headerBtn}>
          <Text style={styles.headerBtnText}>‹</Text>
        </Pressable>
        <Text numberOfLines={1} style={styles.title}>
          {props.title || t.roomTitle}
        </Text>
        <View style={styles.count}>
          <Text style={styles.countText}>
            {snapshot.participantCount}/{snapshot.maxParticipants}
          </Text>
        </View>
      </View>

      {statusLine ? (
        <View style={styles.statusRow}>
          {snapshot.status === 'connecting' ? <ActivityIndicator color="#8b7fff" /> : null}
          <Text style={styles.statusText}>{statusLine}</Text>
        </View>
      ) : null}

      <View style={styles.gridWrap}>
        <SpeakerGrid
          members={snapshot.members}
          youLabel={t.you}
          inviteLabel={t.invite}
          maxParticipants={snapshot.maxParticipants}
          resolveAvatarUrl={props.resolveAvatarUrl}
          onInvite={props.onInvite}
        />
      </View>

      <View style={styles.captionsWrap}>
        <CaptionsList captions={snapshot.captions} myLang={props.myLang} emptyLabel={t.captionsEmpty} />
      </View>

      <View style={[styles.controlsWrap, { paddingBottom: insets.bottom + 12 }]}>
        <VoiceControlsBar
          locale={props.locale}
          micOn={snapshot.micOn}
          micAvailable={snapshot.micAvailable}
          interpretOn={snapshot.interpretOn}
          mode={snapshot.mode}
          origVol={snapshot.origVol}
          trVol={snapshot.trVol}
          onToggleMic={() => void props.controller.setMicOn(!snapshot.micOn)}
          onToggleInterpret={() => void props.controller.setInterpret(!snapshot.interpretOn)}
          onToggleSpeaker={props.onToggleSpeaker}
          onChangeMode={(mode) => props.controller.setMode(mode)}
          onChangeOrigVol={(v) => props.controller.setOrigVol(v)}
          onChangeTrVol={(v) => props.controller.setTrVol(v)}
          onLeave={handleLeave}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#111114',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  headerBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBtnText: {
    color: '#f1f1f4',
    fontSize: 28,
    lineHeight: 30,
  },
  title: {
    flex: 1,
    color: '#f1f1f4',
    fontSize: 17,
    fontWeight: '700',
  },
  count: {
    backgroundColor: '#2c2c33',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  countText: {
    color: '#f1f1f4',
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  statusText: {
    color: '#9a9aa6',
    fontSize: 13,
  },
  gridWrap: {
    paddingHorizontal: 12,
  },
  captionsWrap: {
    flex: 1,
    paddingHorizontal: 16,
    marginTop: 8,
  },
  controlsWrap: {
    paddingHorizontal: 16,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2c2c33',
  },
});
