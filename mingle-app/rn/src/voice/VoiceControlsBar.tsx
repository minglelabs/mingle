import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { InterpretVolumeMode } from './voiceProtocol';
import { VolumeSlider } from './VolumeSlider';
import { resolveVoiceStrings } from './voiceStrings';

export type VoiceControlsBarProps = {
  locale: string | null | undefined;
  micOn: boolean;
  micAvailable: boolean;
  interpretOn: boolean;
  mode: InterpretVolumeMode;
  origVol: number;
  trVol: number;
  onToggleMic: () => void;
  onToggleInterpret: () => void;
  onToggleSpeaker: () => void;
  onChangeMode: (mode: InterpretVolumeMode) => void;
  onChangeOrigVol: (fraction: number) => void;
  onChangeTrVol: (fraction: number) => void;
  onLeave: () => void;
};

function ControlButton({
  label,
  active,
  danger,
  disabled,
  onPress,
}: {
  label: string;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.btn,
        active && styles.btnActive,
        danger && styles.btnDanger,
        disabled && styles.btnDisabled,
      ]}
    >
      <Text style={[styles.btnText, active && styles.btnTextActive]}>{label}</Text>
    </Pressable>
  );
}

export function VoiceControlsBar(props: VoiceControlsBarProps) {
  const t = resolveVoiceStrings(props.locale);
  return (
    <View style={styles.wrap}>
      {/* Interpret mix controls only matter while interpret is ON. */}
      {props.interpretOn ? (
        <View style={styles.mix}>
          <Text style={styles.mixLabel}>{t.volumeModeLabel}</Text>
          <View style={styles.modeRow}>
            <ControlButton
              label={t.volumeModeStatic}
              active={props.mode === 'static'}
              onPress={() => props.onChangeMode('static')}
            />
            <ControlButton
              label={t.volumeModeDynamic}
              active={props.mode === 'dynamic'}
              onPress={() => props.onChangeMode('dynamic')}
            />
          </View>
          {props.mode === 'static' ? (
            <VolumeSlider
              label={t.volumeOriginal}
              value={props.origVol}
              onChange={props.onChangeOrigVol}
            />
          ) : null}
          <VolumeSlider
            label={t.volumeInterpreted}
            value={props.trVol}
            onChange={props.onChangeTrVol}
          />
        </View>
      ) : null}

      <View style={styles.controls}>
        <ControlButton
          label={props.micOn ? t.mute : props.micAvailable ? t.unmute : t.micUnavailable}
          active={props.micOn}
          disabled={!props.micAvailable}
          onPress={props.onToggleMic}
        />
        <ControlButton label={t.speaker} onPress={props.onToggleSpeaker} />
        <ControlButton
          label={props.interpretOn ? t.interpretOn : t.interpretOff}
          active={props.interpretOn}
          onPress={props.onToggleInterpret}
        />
        <ControlButton label={t.leave} danger onPress={props.onLeave} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
  },
  mix: {
    gap: 8,
  },
  mixLabel: {
    fontSize: 12,
    color: '#9a9aa6',
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  controls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
  },
  btn: {
    flexGrow: 1,
    flexBasis: '22%',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: '#2c2c33',
    alignItems: 'center',
  },
  btnActive: {
    backgroundColor: '#5b4cf0',
  },
  btnDanger: {
    backgroundColor: '#3a2326',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  btnText: {
    color: '#f1f1f4',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  btnTextActive: {
    color: '#fff',
  },
});
