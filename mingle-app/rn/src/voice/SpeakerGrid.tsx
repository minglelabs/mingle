import React, { useEffect, useRef } from 'react';
import { Animated, Image, StyleSheet, Text, View } from 'react-native';

import type { VoiceGridMember } from '../nativeVoice';

type SpeakerTileProps = {
  member: VoiceGridMember;
  youLabel: string;
  avatarUrl?: string | null;
};

// A single speaker tile. The speaking ring is an Animated glow driven by the
// member's isSpeaking flag (ActiveSpeakersChanged upstream).
function SpeakerTile({ member, youLabel, avatarUrl }: SpeakerTileProps) {
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (member.isSpeaking) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(glow, { toValue: 1, duration: 500, useNativeDriver: true }),
          Animated.timing(glow, { toValue: 0.4, duration: 500, useNativeDriver: true }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }
    Animated.timing(glow, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    return undefined;
  }, [member.isSpeaking, glow]);

  const ringScale = glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  const ringOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.9] });
  const initial = (member.name || '?').trim().charAt(0).toUpperCase();

  return (
    <View style={styles.tile} accessible accessibilityLabel={`${member.name}${member.isLocal ? ` (${youLabel})` : ''}`}>
      <View style={styles.avatarWrap}>
        <Animated.View
          pointerEvents="none"
          style={[styles.ring, { transform: [{ scale: ringScale }], opacity: ringOpacity }]}
        />
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarInitial}>{initial}</Text>
          </View>
        )}
        {member.interpretOff ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>OFF</Text>
          </View>
        ) : null}
      </View>
      <Text numberOfLines={1} style={styles.name}>
        {member.isLocal ? `${member.name} · ${youLabel}` : member.name}
      </Text>
      {member.lang ? <Text style={styles.lang}>{member.lang}</Text> : null}
    </View>
  );
}

export type SpeakerGridProps = {
  members: VoiceGridMember[];
  youLabel: string;
  inviteLabel: string;
  maxParticipants: number;
  resolveAvatarUrl?: (member: VoiceGridMember) => string | null | undefined;
  onInvite?: () => void;
};

export function SpeakerGrid({
  members,
  youLabel,
  inviteLabel,
  maxParticipants,
  resolveAvatarUrl,
  onInvite,
}: SpeakerGridProps) {
  const showInvite = members.length < maxParticipants && Boolean(onInvite);
  return (
    <View style={styles.grid}>
      {members.map((m) => (
        <SpeakerTile key={m.identity} member={m} youLabel={youLabel} avatarUrl={resolveAvatarUrl?.(m)} />
      ))}
      {showInvite ? (
        <View style={styles.tile}>
          <View style={styles.avatarWrap}>
            <View style={[styles.avatar, styles.inviteAvatar]}>
              <Text style={styles.invitePlus}>＋</Text>
            </View>
          </View>
          <Text numberOfLines={1} style={styles.name}>
            {inviteLabel}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const RING_SIZE = 76;
const AVATAR_SIZE = 64;

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 16,
    paddingVertical: 12,
  },
  tile: {
    width: 88,
    alignItems: 'center',
  },
  avatarWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: 3,
    borderColor: '#5b4cf0',
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: '#2c2c33',
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
  },
  inviteAvatar: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#9a9aa6',
    backgroundColor: 'transparent',
  },
  invitePlus: {
    color: '#9a9aa6',
    fontSize: 28,
  },
  name: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '600',
    color: '#f1f1f4',
    maxWidth: 88,
    textAlign: 'center',
  },
  lang: {
    fontSize: 11,
    color: '#9a9aa6',
  },
  badge: {
    position: 'absolute',
    bottom: 0,
    right: 6,
    backgroundColor: '#d9480f',
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
  },
});
