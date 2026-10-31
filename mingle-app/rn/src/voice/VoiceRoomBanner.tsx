import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import type { VoiceCall, VoiceParticipant } from './voiceApi';
import { resolveVoiceStrings } from './voiceStrings';

export type VoiceRoomBannerProps = {
  locale: string | null | undefined;
  /** Live call from GET /voice, or null when none is live. */
  call: VoiceCall | null;
  onJoin: () => void;
  onStart: () => void;
  /** Resolves a participant avatar URL (chat User.image source). */
  resolveAvatarUrl?: (p: VoiceParticipant) => string | null | undefined;
};

// Sticky banner at the top of the chat message list. When a room is live it
// shows "🎙 Voice talk · N/8" + avatars + Join; when none is live it shows the
// "Start voice talk" affordance.
export function VoiceRoomBanner({ locale, call, onJoin, onStart, resolveAvatarUrl }: VoiceRoomBannerProps) {
  const t = resolveVoiceStrings(locale);

  if (!call || call.status !== 'live') {
    return (
      <Pressable accessibilityRole="button" onPress={onStart} style={[styles.banner, styles.startBanner]}>
        <Text style={styles.startText}>{t.bannerTitle} · {t.startVoiceTalk}</Text>
      </Pressable>
    );
  }

  const avatars = call.participants.slice(0, 3);
  return (
    <View style={styles.banner} accessible accessibilityLabel={`${t.bannerTitle} ${call.participants.length}/${call.maxParticipants}`}>
      <View style={styles.left}>
        <Text style={styles.title}>
          {t.bannerTitle} · {call.participants.length}/{call.maxParticipants}
        </Text>
        <View style={styles.avatars}>
          {avatars.map((p, i) => {
            const uri = resolveAvatarUrl?.(p);
            return (
              <View key={p.userId} style={[styles.avatarWrap, { marginLeft: i === 0 ? 0 : -8 }]}>
                {uri ? (
                  <Image source={{ uri }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Text style={styles.avatarInitial}>{(p.name || '?').charAt(0).toUpperCase()}</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </View>
      <Pressable accessibilityRole="button" onPress={onJoin} style={styles.joinBtn}>
        <Text style={styles.joinText}>{t.bannerJoin}</Text>
      </Pressable>
    </View>
  );
}

const AV = 24;

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1c1c21',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2c2c33',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  startBanner: {
    justifyContent: 'center',
  },
  startText: {
    color: '#8b7fff',
    fontSize: 14,
    fontWeight: '600',
  },
  left: {
    flex: 1,
    gap: 4,
  },
  title: {
    color: '#f1f1f4',
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  avatars: {
    flexDirection: 'row',
  },
  avatarWrap: {
    borderRadius: AV / 2,
    borderWidth: 1.5,
    borderColor: '#1c1c21',
  },
  avatar: {
    width: AV,
    height: AV,
    borderRadius: AV / 2,
    backgroundColor: '#2c2c33',
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  joinBtn: {
    backgroundColor: '#5b4cf0',
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  joinText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
