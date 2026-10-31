import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import type { CaptionLine } from './voiceProtocol';

export type CaptionsListProps = {
  captions: CaptionLine[];
  myLang: string;
  emptyLabel: string;
};

// Live captions: original → your-language translation, newest first. The
// controller already filters/supplies metrics for the local language only.
export function CaptionsList({ captions, myLang, emptyLabel }: CaptionsListProps) {
  if (captions.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>{emptyLabel}</Text>
      </View>
    );
  }
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {captions.map((line) => {
        const translation = line.translations[myLang];
        return (
          <View key={line.id} style={[styles.line, line.isEcho && styles.echo]}>
            <Text style={styles.who} numberOfLines={1}>
              {line.speakerName || line.lang || '…'}
            </Text>
            <Text style={[styles.orig, line.isPartial && styles.partial]}>
              {line.original}
              {line.isPartial ? ' …' : ''}
            </Text>
            {translation ? <Text style={styles.translation}>{translation}</Text> : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    maxHeight: 220,
  },
  content: {
    gap: 8,
    paddingVertical: 4,
  },
  empty: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyText: {
    color: '#9a9aa6',
    fontSize: 13,
  },
  line: {
    backgroundColor: '#1c1c21',
    borderRadius: 10,
    padding: 10,
  },
  echo: {
    opacity: 0.6,
  },
  who: {
    fontSize: 12,
    color: '#9a9aa6',
    marginBottom: 2,
  },
  orig: {
    fontSize: 14,
    color: '#f1f1f4',
  },
  partial: {
    color: '#9a9aa6',
  },
  translation: {
    marginTop: 4,
    fontSize: 15,
    fontWeight: '700',
    color: '#8b7fff',
  },
});
