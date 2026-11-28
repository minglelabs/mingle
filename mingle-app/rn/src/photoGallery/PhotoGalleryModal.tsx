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
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { check, openPhotoPicker, openSettings, PERMISSIONS, request, RESULTS, type Permission } from 'react-native-permissions';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, CameraType, type CameraApi } from 'react-native-camera-kit';

export type PhotoGalleryLabels = {
  title: string;
  next: string;
  close: string;
  /** iOS "selected photos only": a way to let more photos in. */
  limited: string;
  denied: string;
  openSettings: string;
  /** Go on to writing without a photo (2026-11-27: the gallery opens first, as Instagram's). */
  skip: string;
  /** Over the grid: which photos these are. */
  recent: string;
  /** The title of the album list (older pages send none: "Albums"). */
  albums?: string;
  /** The first tile of the grid: take a photo now (2026-11-28). */
  camera?: string;
  /** Camera access refused. */
  cameraDenied?: string;
};

export type PhotoGalleryRequest = { requestId: string; max: number; labels: PhotoGalleryLabels };

export type PhotoGalleryAnswer =
  | { requestId: string; type: 'picked'; photos: Array<{ dataUrl: string; name: string }> }
  | { requestId: string; type: 'cancelled'; reason?: string }
  /** Access refused: the web keeps the system picker from then on. */
  | { requestId: string; type: 'denied' }
  /** No photo, write anyway. */
  | { requestId: string; type: 'skipped' };

/** The longest side of a photo handed to the web (the web shrinks it further for upload). */
const MAX_SIDE = 1600;
const PAGE_SIZE = 60;
const COLUMNS = 4;

type Access = 'checking' | 'granted' | 'limited' | 'denied';

/** The grid's first cell: the camera. */
const CAMERA_TILE = { node: { id: '__camera__' } } as unknown as PhotoIdentifier;

/** A photo just taken (a file) as a JPEG data URL no larger than MAX_SIDE. */
async function capturedToDataUrl(uri: string, width: number, height: number): Promise<string> {
  const target = scaled(width || MAX_SIDE, height || MAX_SIDE);
  const result = await ImageEditor.cropImage(uri, {
    offset: { x: 0, y: 0 },
    size: { width: width || target.width, height: height || target.height },
    displaySize: target,
    resizeMode: 'contain',
    quality: 0.85,
    format: 'jpeg',
    includeBase64: true,
  });
  return `data:image/jpeg;base64,${(result as { base64?: string }).base64 ?? ''}`;
}

function cameraPermission(): Permission {
  return Platform.OS === 'ios' ? PERMISSIONS.IOS.CAMERA : PERMISSIONS.ANDROID.CAMERA;
}

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

/** An album to browse instead of the recent photos (iOS: albums and smart albums such as Favorites; Android: folders). */
type GalleryAlbum = { title: string; count: number; type: 'Album' | 'SmartAlbum' | 'All' };

async function readAlbums(): Promise<GalleryAlbum[]> {
  try {
    const albums = await CameraRoll.getAlbums(Platform.OS === 'ios' ? { assetType: 'Photos', albumType: 'All' } : { assetType: 'Photos' });
    let list = albums
      .filter((album) => album.count > 0 && album.title)
      .map((album) => ({ title: album.title, count: album.count, type: album.type }));
    // iOS: the largest smart album is the whole library ("Recents"), already the first row of the list.
    if (Platform.OS === 'ios') {
      const smart = list.filter((album) => album.type === 'SmartAlbum');
      const library = smart.reduce<GalleryAlbum | null>((largest, album) => (!largest || album.count > largest.count ? album : largest), null);
      if (library) list = list.filter((album) => album !== library);
    }
    // Smart albums (Favorites, Screenshots, …) first, as in the Photos app; the rest by size.
    return list.sort((a, b) => (a.type === b.type ? b.count - a.count : a.type === 'SmartAlbum' ? -1 : 1));
  } catch {
    return [];
  }
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
  // The album on show (null: the recent photos) and the album list, opened from the "Recents ▾" title.
  const [album, setAlbum] = useState<GalleryAlbum | null>(null);
  const albumRef = useRef<GalleryAlbum | null>(null);
  const [albums, setAlbums] = useState<GalleryAlbum[] | null>(null);
  const [albumListOpen, setAlbumListOpen] = useState(false);
  // The camera, from the grid's first tile: 'off', asking for access, on, or refused.
  const [camera, setCamera] = useState<'off' | 'asking' | 'on' | 'denied'>('off');
  const [cameraBack, setCameraBack] = useState(true);
  const cameraRef = useRef<CameraApi>(null);
  // Picked photos by id, kept across albums (the grid only holds the album on show).
  const pickedEntries = useRef(new Map<string, PhotoIdentifier>());
  const requestId = galleryRequest?.requestId ?? null;
  const max = Math.max(1, galleryRequest?.max ?? 10);
  const labels = galleryRequest?.labels;

  const loadPage = useCallback(async (after: string | null) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const shown = albumRef.current;
      const page = await CameraRoll.getPhotos({
        first: PAGE_SIZE,
        ...(after ? { after } : {}),
        assetType: 'Photos',
        include: ['imageSize', 'filename'],
        ...(shown ? { groupName: shown.title, ...(Platform.OS === 'ios' ? { groupTypes: shown.type === 'SmartAlbum' ? 'SmartAlbum' as const : 'Album' as const } : {}) } : {}),
      });
      if (albumRef.current !== shown) return;
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
    pickedEntries.current.clear();
    albumRef.current = null;
    setAlbum(null);
    setAlbums(null);
    setAlbumListOpen(false);
    setCamera('off');
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
    const entry = byId.get(id);
    if (entry) pickedEntries.current.set(id, entry);
    setPicked((current) => {
      if (current.includes(id)) return current.filter((entry) => entry !== id);
      if (current.length >= max) return current;
      return [...current, id];
    });
  }, [byId, max]);

  const openAlbumList = useCallback(() => {
    setAlbumListOpen(true);
    if (albums === null) void readAlbums().then(setAlbums);
  }, [albums]);

  const showAlbum = useCallback((next: GalleryAlbum | null) => {
    setAlbumListOpen(false);
    albumRef.current = next;
    setAlbum(next);
    setPhotos([]);
    setFocusId(null);
    setCursor(null);
    setHasMore(true);
    loadingRef.current = false;
    void loadPage(null);
  }, [loadPage]);

  const close = useCallback(() => {
    if (!requestId) return;
    onAnswer(access === 'denied' ? { requestId, type: 'denied' } : { requestId, type: 'cancelled' });
  }, [access, onAnswer, requestId]);

  const finish = useCallback(async (taken?: string) => {
    if (!requestId || busy) return;
    // A photo just taken goes after the ones picked, within the limit.
    const ids = taken ? picked.slice(0, Math.max(0, max - 1)) : picked;
    if (ids.length === 0 && !taken) return;
    setBusy(true);
    const out: Array<{ dataUrl: string; name: string }> = [];
    let lastError = '';
    for (const [index, id] of ids.entries()) {
      const photo = pickedEntries.current.get(id) ?? byId.get(id);
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
    if (taken) out.push({ dataUrl: taken, name: `photo-${out.length + 1}.jpg` });
    setBusy(false);
    onAnswer(out.length > 0 ? { requestId, type: 'picked', photos: out } : { requestId, type: 'cancelled', reason: lastError || 'nothing_read' });
  }, [busy, byId, max, onAnswer, picked, requestId]);

  const openCamera = useCallback(() => {
    setCamera('asking');
    void (async () => {
      let status = await check(cameraPermission());
      if (status === RESULTS.DENIED) status = await request(cameraPermission());
      setCamera(status === RESULTS.GRANTED || status === RESULTS.LIMITED ? 'on' : 'denied');
    })();
  }, []);

  const shoot = useCallback(async () => {
    if (busy) return;
    try {
      const photo = await cameraRef.current?.capture();
      if (!photo?.uri) return;
      const uri = photo.uri.startsWith('file://') || photo.uri.startsWith('content://') ? photo.uri : `file://${photo.uri}`;
      const dataUrl = await capturedToDataUrl(uri, photo.width, photo.height);
      if (dataUrl.length <= 'data:image/jpeg;base64,'.length) return;
      setCamera('off');
      await finish(dataUrl);
    } catch {
      // Nothing taken: the camera stays open.
    }
  }, [busy, finish]);

  const skip = useCallback(() => {
    if (requestId) onAnswer({ requestId, type: 'skipped' });
  }, [onAnswer, requestId]);

  const letMoreIn = useCallback(() => {
    void openPhotoPicker().catch(() => undefined).finally(() => { void loadPage(null); });
  }, [loadPage]);

  const canFinish = picked.length > 0;

  // Nothing at all until the web asks (no idle Modal in the tree).
  if (!galleryRequest) return null;
  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={close}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      <View style={[styles.root, { paddingTop: Platform.OS === 'ios' ? insets.top : 0 }]}>
        <View style={styles.bar}>
          <Pressable accessibilityRole="button" accessibilityLabel={labels?.close} onPress={close} hitSlop={12} style={styles.barSide}>
            <Text style={styles.close}>✕</Text>
          </Pressable>
          <Text style={styles.title} numberOfLines={1}>
            {labels?.title}{picked.length > 0 ? ` · ${picked.length}/${max}` : ''}
          </Text>
          <Pressable accessibilityRole="button" onPress={() => { void finish(); }} disabled={!canFinish || busy} hitSlop={12} style={[styles.barSide, styles.barRight]}>
            {busy ? <ActivityIndicator color={ACCENT} /> : <Text style={[styles.next, !canFinish && styles.nextOff]}>{labels?.next}</Text>}
          </Pressable>
        </View>

        {access === 'denied' ? (
          <View style={styles.denied}>
            <Text style={styles.deniedText}>{labels?.denied}</Text>
            <Pressable accessibilityRole="button" onPress={() => { void openSettings(); }} style={styles.settings}>
              <Text style={styles.settingsText}>{labels?.openSettings}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={skip} style={styles.skipWide}>
              <Text style={styles.skipText}>{labels?.skip}</Text>
            </Pressable>
          </View>
        ) : access === 'checking' ? (
          <View style={styles.denied}><ActivityIndicator color={ACCENT} /></View>
        ) : (
          <FlatList
            data={[CAMERA_TILE, ...photos]}
            keyExtractor={(entry) => entry.node.id}
            numColumns={COLUMNS}
            onEndReachedThreshold={0.6}
            onEndReached={() => { if (hasMore) void loadPage(cursor); }}
            ListHeaderComponent={(
              <View>
                <View style={[styles.preview, { width, height: Math.round(width * 1.0) }]}>
                  {focus ? <Image source={{ uri: focus.node.image.uri }} style={styles.previewImage} resizeMode="contain" /> : null}
                </View>
                <View style={styles.listBar}>
                  <Pressable accessibilityRole="button" onPress={openAlbumList} hitSlop={8} style={styles.albumButton} testID="photo-gallery-albums">
                    <Text style={styles.recent} numberOfLines={1}>{album?.title ?? labels?.recent}</Text>
                    <Text style={styles.albumChevron}>▾</Text>
                  </Pressable>
                  {labels?.skip ? (
                    <Pressable accessibilityRole="button" onPress={skip} hitSlop={8} style={styles.skipPill} testID="photo-gallery-skip">
                      <Text style={styles.skipText}>{labels.skip}</Text>
                    </Pressable>
                  ) : null}
                </View>
                {access === 'limited' && Platform.OS === 'ios' ? (
                  <Pressable accessibilityRole="button" onPress={letMoreIn} style={styles.limited}>
                    <Text style={styles.limitedText}>{labels?.limited}</Text>
                  </Pressable>
                ) : null}
              </View>
            )}
            renderItem={({ item }) => {
              if (item === CAMERA_TILE) {
                return (
                  <Pressable accessibilityRole="button" accessibilityLabel={labels?.camera ?? 'Camera'} onPress={openCamera} style={{ width: cell, height: cell, padding: 1 }} testID="photo-gallery-camera">
                    <View style={styles.cameraTile}>
                      <Text style={styles.cameraIcon}>📷</Text>
                      <Text style={styles.cameraLabel} numberOfLines={1}>{labels?.camera ?? 'Camera'}</Text>
                    </View>
                  </Pressable>
                );
              }
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
        {camera !== 'off' ? (
          <View style={[StyleSheet.absoluteFill, styles.cameraSheet]} testID="photo-gallery-camera-view">
            {camera === 'on' ? (
              <Camera ref={cameraRef} style={StyleSheet.absoluteFill} cameraType={cameraBack ? CameraType.Back : CameraType.Front} />
            ) : camera === 'denied' ? (
              <View style={styles.denied}>
                <Text style={[styles.deniedText, styles.cameraText]}>{labels?.cameraDenied ?? labels?.denied}</Text>
                <Pressable accessibilityRole="button" onPress={() => { void openSettings(); }} style={styles.settings}>
                  <Text style={styles.settingsText}>{labels?.openSettings}</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.denied}><ActivityIndicator color="#ffffff" /></View>
            )}
            <View style={[styles.cameraTop, { paddingTop: Platform.OS === 'ios' ? insets.top + 6 : 12 }]}>
              <Pressable accessibilityRole="button" accessibilityLabel={labels?.close} onPress={() => setCamera('off')} hitSlop={12} style={styles.cameraRound}>
                <Text style={styles.cameraClose}>✕</Text>
              </Pressable>
            </View>
            {camera === 'on' ? (
              <View style={[styles.cameraBottom, { paddingBottom: insets.bottom + 24 }]}>
                <View style={styles.cameraSide} />
                <Pressable accessibilityRole="button" accessibilityLabel={labels?.camera ?? 'Camera'} onPress={() => { void shoot(); }} disabled={busy} style={styles.shutter} testID="photo-gallery-shutter">
                  {busy ? <ActivityIndicator color={ACCENT} /> : <View style={styles.shutterInner} />}
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => setCameraBack((back) => !back)} hitSlop={12} style={[styles.cameraSide, styles.cameraRound]}>
                  <Text style={styles.cameraFlip}>⟲</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : null}
        {albumListOpen ? (
          <View style={[StyleSheet.absoluteFill, styles.albumSheet, { paddingTop: Platform.OS === 'ios' ? insets.top : 0 }]}>
            <View style={styles.bar}>
              <Pressable accessibilityRole="button" accessibilityLabel={labels?.close} onPress={() => setAlbumListOpen(false)} hitSlop={12} style={styles.barSide}>
                <Text style={styles.close}>✕</Text>
              </Pressable>
              <Text style={styles.title} numberOfLines={1}>{labels?.albums ?? 'Albums'}</Text>
              <View style={styles.barSide} />
            </View>
            {albums === null ? (
              <View style={styles.denied}><ActivityIndicator color={ACCENT} /></View>
            ) : (
              <FlatList
                data={[null, ...albums]}
                keyExtractor={(entry, index) => (entry ? `${entry.type}:${entry.title}:${index}` : 'recent')}
                renderItem={({ item }) => {
                  const current = item ? album?.title === item.title && album?.type === item.type : album === null;
                  return (
                    <Pressable accessibilityRole="button" onPress={() => showAlbum(item)} style={styles.albumRow} testID={item ? undefined : 'photo-gallery-album-recent'}>
                      <Text style={[styles.albumTitle, current && styles.albumTitleOn]} numberOfLines={1}>{item ? item.title : labels?.recent}</Text>
                      {item ? <Text style={styles.albumCount}>{item.count}</Text> : null}
                    </Pressable>
                  );
                }}
                contentContainerStyle={{ paddingBottom: insets.bottom + 12 }}
              />
            )}
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

// Light, like the write screen it opens into (owner, 2026-11-27: the black gallery felt like another app).
const INK = '#0f172a';
const ACCENT = '#f97316';
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#ffffff' },
  bar: { height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(15,23,42,0.12)' },
  barSide: { minWidth: 64, height: 44, justifyContent: 'center' },
  barRight: { alignItems: 'flex-end' },
  close: { color: INK, fontSize: 22, fontWeight: '500' },
  title: { flex: 1, textAlign: 'center', color: INK, fontSize: 17, fontWeight: '700' },
  next: { color: ACCENT, fontSize: 17, fontWeight: '700' },
  nextOff: { color: 'rgba(15,23,42,0.3)' },
  preview: { backgroundColor: '#f4f4f5' },
  previewImage: { width: '100%', height: '100%' },
  limited: { marginHorizontal: 12, marginBottom: 10, paddingVertical: 10, borderRadius: 12, backgroundColor: '#fff7ed', alignItems: 'center' },
  limitedText: { color: '#c2410c', fontSize: 14, fontWeight: '600' },
  thumb: { flex: 1, backgroundColor: '#f1f5f9' },
  thumbFocus: { opacity: 0.55 },
  badge: { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: '#ffffff', backgroundColor: 'rgba(15,23,42,0.2)', alignItems: 'center', justifyContent: 'center' },
  badgeOn: { backgroundColor: ACCENT, borderColor: '#ffffff' },
  badgeText: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
  denied: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  deniedText: { color: INK, fontSize: 15, textAlign: 'center', lineHeight: 22 },
  settings: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14, backgroundColor: ACCENT },
  settingsText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  listBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  recent: { color: INK, fontSize: 17, fontWeight: '700', flexShrink: 1 },
  albumButton: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1, marginRight: 12 },
  albumChevron: { color: INK, fontSize: 14, fontWeight: '700' },
  albumSheet: { backgroundColor: '#ffffff', zIndex: 10 },
  cameraTile: { flex: 1, backgroundColor: '#fff7ed', alignItems: 'center', justifyContent: 'center', gap: 4 },
  cameraIcon: { fontSize: 26 },
  cameraLabel: { color: '#c2410c', fontSize: 12, fontWeight: '700' },
  cameraSheet: { backgroundColor: '#000000', zIndex: 20 },
  cameraText: { color: '#ffffff' },
  cameraTop: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 16 },
  cameraRound: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  cameraClose: { color: '#ffffff', fontSize: 20, fontWeight: '600' },
  cameraFlip: { color: '#ffffff', fontSize: 22, fontWeight: '700' },
  cameraBottom: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 32 },
  cameraSide: { width: 44, height: 44 },
  shutter: { width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#ffffff' },
  albumRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 15, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(15,23,42,0.08)' },
  albumTitle: { color: INK, fontSize: 16, fontWeight: '600', flexShrink: 1 },
  albumTitleOn: { color: ACCENT, fontWeight: '800' },
  albumCount: { color: 'rgba(15,23,42,0.45)', fontSize: 14, marginLeft: 12 },
  skipPill: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fdba74' },
  skipWide: { marginTop: 12, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14, backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fdba74' },
  skipText: { color: '#c2410c', fontSize: 15, fontWeight: '700' },
});
