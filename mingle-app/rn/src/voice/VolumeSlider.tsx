import React, { useCallback, useState } from 'react';
import {
  GestureResponderEvent,
  LayoutChangeEvent,
  PanResponder,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { fractionFromTouch, percentLabel } from './sliderMath';

// Re-exported from the pure math module so tests can import them without RN.
export { fractionFromTouch, percentLabel } from './sliderMath';

export type VolumeSliderProps = {
  label: string;
  value: number; // 0..1
  onChange: (fraction: number) => void;
};

// A dependency-free slider: a track whose width we measure, mapping horizontal
// drags to a 0..1 fraction via fractionFromTouch (the unit-tested core).
export function VolumeSlider({ label, value, onChange }: VolumeSliderProps) {
  const [width, setWidth] = useState(0);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setWidth(e.nativeEvent.layout.width);
  }, []);

  const handleTouch = useCallback(
    (e: GestureResponderEvent) => {
      onChange(fractionFromTouch(e.nativeEvent.locationX, width));
    },
    [onChange, width],
  );

  const responder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: handleTouch,
    onPanResponderMove: handleTouch,
  });

  const fillPct = `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` as const;

  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.track} onLayout={onLayout} {...responder.panHandlers}>
        <View style={[styles.fill, { width: fillPct }]} />
        <View style={[styles.thumb, { left: fillPct }]} />
      </View>
      <Text style={styles.value}>{percentLabel(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    width: 44,
    fontSize: 12,
    color: '#9a9aa6',
  },
  track: {
    flex: 1,
    height: 24,
    justifyContent: 'center',
  },
  fill: {
    position: 'absolute',
    height: 4,
    borderRadius: 2,
    backgroundColor: '#5b4cf0',
  },
  thumb: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    marginLeft: -8,
    backgroundColor: '#fff',
  },
  value: {
    width: 40,
    textAlign: 'right',
    fontSize: 12,
    color: '#9a9aa6',
    fontVariant: ['tabular-nums'],
  },
});
