import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { VoiceController } from '../nativeVoice';
import { useVoiceSnapshot } from './useVoiceController';
import { resolveVoiceStrings } from './voiceStrings';

export type VoiceMiniBarProps = {
  controller: VoiceController;
  locale: string | null | undefined;
  topOffset: number;
  onReopen: () => void;
  onLeft: () => void;
};

// Floating pill shown while the user browses chat but stays in the room.
// Tap body = reopen the room screen; ⎋ = leave.
export function VoiceMiniBar({ controller, locale, topOffset, onReopen, onLeft }: VoiceMiniBarProps) {
  const snapshot = useVoiceSnapshot(controller);
  const t = resolveVoiceStrings(locale);

  if (snapshot.status !== 'connected' && snapshot.status !== 'reconnecting') return null;

  const speakingCount = snapshot.members.filter((m) => m.isSpeaking).length;

  const handleLeave = () => {
    void controller.leave().finally(() => onLeft());
  };

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: topOffset }]}>
      <Pressable accessibilityRole="button" onPress={onReopen} style={styles.pill}>
        <Text style={styles.dot}>🎙</Text>
        <Text style={styles.text}>
          {snapshot.participantCount}/{snapshot.maxParticipants}
          {speakingCount > 0 ? ` · ${speakingCount}` : ''}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.miniLeave}
          onPress={handleLeave}
          hitSlop={10}
          style={styles.leaveBtn}
        >
          <Text style={styles.leaveText}>⎋</Text>
        </Pressable>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: 12,
    alignItems: 'flex-end',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1c1c21',
    borderRadius: 999,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  dot: {
    fontSize: 14,
  },
  text: {
    color: '#f1f1f4',
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  leaveBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#2c2c33',
    alignItems: 'center',
    justifyContent: 'center',
  },
  leaveText: {
    color: '#f1f1f4',
    fontSize: 14,
  },
});
