// The app's own photo gallery for the write screen (owner, 2026-11-27):
// a big preview on top, the phone's recent photos under it, several picked
// in order (numbered), "next" hands them to the web write screen made small
// enough to upload. The web side is src/lib/native-photo-gallery.ts; its
// labels come with the request, so this screen speaks the app's language
// without strings of its own.

import { CameraRoll, type PhotoIdentifier } from '@react-native-camera-roll/camera-roll';
import ImageEditor from '@react-native-community/image-editor';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { check, openPhotoPicker, openSettings, PERMISSIONS, request, RESULTS, type Permission } from 'react-native-permissions';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type PhotoGalleryLabels = {
  title: string;
  next: string;
  close: string;
  /** iOS "selected photos only": a way to let more photos in. */
  limited: string;
  denied: string;
  openSettings: string;
};

export type PhotoGalleryRequest = { requestId: string; max: number; labels: PhotoGalleryLabels };

export type PhotoGalleryAnswer =
  | { requestId: string; type: 'picked'; photos: Array<{ dataUrl: string; name: string }> }
  | { requestId: string; type: 'cancelled'; reason?: string }
  /** Access refused: the web keeps the system picker from then on. */
  | { requestId: string; type: 'denied' };

/** The longest side of a photo handed to the web (the web shrinks it further for upload). */
const MAX_SIDE = 1600;
const PAGE_SIZE = 60;
const COLUMNS = 4;

type Access = 'checking' | 'granted' | 'limited' | 'denied';

function photoPermission(): Permission {
  if (Platform.OS === 'ios') return PERMISSIONS.IOS.PHOTO_LIBRARY;
  return Number(Platform.Version) >= 33 ? PERMISSIONS.ANDROID.READ_MEDIA_IMAGES : PERMISSIONS.ANDROID.READ_EXTERNAL_STORAGE;
}

async function askAccess(): Promise<Access> {
  const permission = photoPermission();
  let status = await check(permission);
  if (status === RESULTS.DENIED) status = await request(permission);
  if (status === RESULTS.GRANTED) return 'granted';
  if (status === RESULTS.LIMITED) return 'limited';
  // Android 14+: "selected photos" leaves READ_MEDIA_IMAGES denied but the picked ones readable.
  if (Platform.OS === 'android' && Number(Platform.Version) >= 34) {
    const partial = await check(PERMISSIONS.ANDROID.READ_MEDIA_VISUAL_USER_SELECTED).catch(() => RESULTS.UNAVAILABLE);
    if (partial === RESULTS.GRANTED) return 'limited';
  }
  return 'denied';
}

function scaled(width: number, height: number): { width: number; height: number } {
  const longest = Math.max(width, height, 1);
  const scale = Math.min(1, MAX_SIDE / longest);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** One photo as a JPEG data URL no larger than MAX_SIDE. */
async function toDataUrl(photo: PhotoIdentifier): Promise<string> {
  const { uri, width, height } = photo.node.image;
  const target = scaled(width || MAX_SIDE, height || MAX_SIDE);
  if (Platform.OS === 'ios') {
    // The Photos framework scales (and turns HEIC into JPEG), fetching from iCloud when needed.
    const thumbnail = await CameraRoll.getPhotoThumbnail(photo.node.id, { allowNetworkAccess: true, targetSize: target, quality: 0.85 });
    return `data:image/jpeg;base64,${thumbnail.thumbnailBase64}`;
  }
  const result = await ImageEditor.cropImage(uri, {
    offset: { x: 0, y: 0 },
    size: { width: width || target.width, height: height || target.height },
    displaySize: target,
    resizeMode: 'contain',
    quality: 0.85,
    format: 'jpeg',
    includeBase64: true,
  });
  const base64 = (result as { base64?: string }).base64 ?? '';
  return `data:image/jpeg;base64,${base64}`;
}

export default function PhotoGalleryModal({ request: galleryRequest, onAnswer }: {
  request: PhotoGalleryRequest | null;
  onAnswer: (answer: PhotoGalleryAnswer) => void;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const cell = Math.floor(width / COLUMNS);
  const [access, setAccess] = useState<Access>('checking');
  const [photos, setPhotos] = useState<PhotoIdentifier[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const loadingRef = useRef(false);
  const requestId = galleryRequest?.requestId ?? null;
  const max = Math.max(1, galleryRequest?.max ?? 10);
  const labels = galleryRequest?.labels;

  const loadPage = useCallback(async (after: string | null) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const page = await CameraRoll.getPhotos({ first: PAGE_SIZE, ...(after ? { after } : {}), assetType: 'Photos', include: ['imageSize', 'filename'] });
      setPhotos((current) => {
        const seen = new Set(current.map((entry) => entry.node.id));
        const next = after ? [...current, ...page.edges.filter((entry) => !seen.has(entry.node.id))] : page.edges;
        return next;
      });
      setFocusId((current) => current ?? page.edges[0]?.node.id ?? null);
      setCursor(page.page_info.end_cursor ?? null);
      setHasMore(page.page_info.has_next_page);
    } catch {
      setHasMore(false);
    } finally {
      loadingRef.current = false;
    }
  }, []);

  // A new request: start over (access, photos, picks).
  useEffect(() => {
    if (!requestId) return;
    let cancelled = false;
    setPhotos([]);
    setPicked([]);
    setFocusId(null);
    setCursor(null);
    setHasMore(true);
    setBusy(false);
    setAccess('checking');
    void askAccess().then((next) => {
      if (cancelled) return;
      setAccess(next);
      if (next === 'denied') return;
      void loadPage(null).then(() => {
        // Right after the access prompt the first read can come back empty: once more, shortly after.
        if (!cancelled) setTimeout(() => { if (!cancelled) void loadPage(null); }, 700);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [loadPage, requestId]);

  const byId = useMemo(() => new Map(photos.map((entry) => [entry.node.id, entry])), [photos]);
  const focus = (focusId ? byId.get(focusId) : null) ?? photos[0] ?? null;

  const toggle = useCallback((id: string) => {
    setFocusId(id);
    setPicked((current) => {
      if (current.includes(id)) return current.filter((entry) => entry !== id);
      if (current.length >= max) return current;
      return [...current, id];
    });
  }, [max]);

  const close = useCallback(() => {
    if (!requestId) return;
    onAnswer(access === 'denied' ? { requestId, type: 'denied' } : { requestId, type: 'cancelled' });
  }, [access, onAnswer, requestId]);

  const finish = useCallback(async () => {
    if (!requestId || busy) return;
    // Nothing ticked: the photo on show is the one meant.
    const ids = picked.length > 0 ? picked : focus ? [focus.node.id] : [];
    if (ids.length === 0) return;
    setBusy(true);
    const out: Array<{ dataUrl: string; name: string }> = [];
    let lastError = '';
    for (const [index, id] of ids.entries()) {
      const photo = byId.get(id);
      if (!photo) continue;
      try {
        const dataUrl = await toDataUrl(photo);
        if (dataUrl.length > 'data:image/jpeg;base64,'.length) out.push({ dataUrl, name: `photo-${index + 1}.jpg` });
        else lastError = 'empty_image';
      } catch (error) {
        // One unreadable photo (an iCloud one offline) does not stop the rest.
        lastError = error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200);
      }
    }
    setBusy(false);
    onAnswer(out.length > 0 ? { requestId, type: 'picked', photos: out } : { requestId, type: 'cancelled', reason: lastError || 'nothing_read' });
  }, [busy, byId, focus, onAnswer, picked, requestId]);

  const letMoreIn = useCallback(() => {
    void openPhotoPicker().catch(() => undefined).finally(() => { void loadPage(null); });
  }, [loadPage]);

  const canFinish = picked.length > 0 || Boolean(focus);

  // Nothing at all until the web asks (no idle Modal in the tree).
  if (!galleryRequest) return null;
  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={close}>
      <View style={[styles.root, { paddingTop: Platform.OS === 'ios' ? insets.top : 0 }]}>
        <View style={styles.bar}>
          <Pressable accessibilityRole="button" accessibilityLabel={labels?.close} onPress={close} hitSlop={12} style={styles.barSide}>
            <Text style={styles.close}>✕</Text>
          </Pressable>
          <Text style={styles.title} numberOfLines={1}>
            {labels?.title}{picked.length > 0 ? ` · ${picked.length}/${max}` : ''}
          </Text>
          <Pressable accessibilityRole="button" onPress={() => { void finish(); }} disabled={!canFinish || busy} hitSlop={12} style={[styles.barSide, styles.barRight]}>
            {busy ? <ActivityIndicator color="#f97316" /> : <Text style={[styles.next, !canFinish && styles.nextOff]}>{labels?.next}</Text>}
          </Pressable>
        </View>

        {access === 'denied' ? (
          <View style={styles.denied}>
            <Text style={styles.deniedText}>{labels?.denied}</Text>
            <Pressable accessibilityRole="button" onPress={() => { void openSettings(); }} style={styles.settings}>
              <Text style={styles.settingsText}>{labels?.openSettings}</Text>
            </Pressable>
          </View>
        ) : access === 'checking' ? (
          <View style={styles.denied}><ActivityIndicator color="#ffffff" /></View>
        ) : (
          <FlatList
            data={photos}
            keyExtractor={(entry) => entry.node.id}
            numColumns={COLUMNS}
            onEndReachedThreshold={0.6}
            onEndReached={() => { if (hasMore) void loadPage(cursor); }}
            ListHeaderComponent={(
              <View>
                <View style={[styles.preview, { width, height: Math.round(width * 1.0) }]}>
                  {focus ? <Image source={{ uri: focus.node.image.uri }} style={styles.previewImage} resizeMode="contain" /> : null}
                </View>
                {access === 'limited' && Platform.OS === 'ios' ? (
                  <Pressable accessibilityRole="button" onPress={letMoreIn} style={styles.limited}>
                    <Text style={styles.limitedText}>{labels?.limited}</Text>
                  </Pressable>
                ) : null}
              </View>
            )}
            renderItem={({ item }) => {
              const order = picked.indexOf(item.node.id);
              const isFocus = focus?.node.id === item.node.id;
              return (
                <Pressable onPress={() => toggle(item.node.id)} style={{ width: cell, height: cell, padding: 1 }}>
                  <Image source={{ uri: item.node.image.uri }} style={[styles.thumb, isFocus && styles.thumbFocus]} />
                  <View style={[styles.badge, order >= 0 && styles.badgeOn]}>
                    {order >= 0 ? <Text style={styles.badgeText}>{order + 1}</Text> : null}
                  </View>
                </Pressable>
              );
            }}
            contentContainerStyle={{ paddingBottom: insets.bottom + 12 }}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b0b0f' },
  bar: { height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  barSide: { minWidth: 64, height: 44, justifyContent: 'center' },
  barRight: { alignItems: 'flex-end' },
  close: { color: '#ffffff', fontSize: 22, fontWeight: '600' },
  title: { flex: 1, textAlign: 'center', color: '#ffffff', fontSize: 17, fontWeight: '700' },
  next: { color: '#f97316', fontSize: 17, fontWeight: '700' },
  nextOff: { color: 'rgba(255,255,255,0.35)' },
  preview: { backgroundColor: '#000000' },
  previewImage: { width: '100%', height: '100%' },
  limited: { marginHorizontal: 12, marginVertical: 10, paddingVertical: 10, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center' },
  limitedText: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
  thumb: { flex: 1, backgroundColor: '#1f2937' },
  thumbFocus: { opacity: 0.6 },
  badge: { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: '#ffffff', backgroundColor: 'rgba(0,0,0,0.25)', alignItems: 'center', justifyContent: 'center' },
  badgeOn: { backgroundColor: '#f97316', borderColor: '#f97316' },
  badgeText: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
  denied: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  deniedText: { color: '#ffffff', fontSize: 15, textAlign: 'center', lineHeight: 22 },
  settings: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14, backgroundColor: '#f97316' },
  settingsText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
});
