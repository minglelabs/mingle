"use client";

import {
  DEFAULT_PROFILE_IMAGE_CROP,
  PROFILE_IMAGE_MAX_SCALE,
  clampProfileImageCropToImage,
  normalizeProfileImageCrop,
  type ProfileImageCrop,
  type ProfileImageCropInput,
} from "@/lib/profile-image-crop";
import { ImagePlus, UserRound } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent } from "react";
import { resolveProfileImageCropCopy } from "@/i18n/profile-image-crop-copy";

const CROP_VIEWPORT_SIZE_PX = 240;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

type PointerPoint = {
  x: number;
  y: number;
};

type GestureState = {
  baseCrop: ProfileImageCrop;
  startCenter: PointerPoint;
  startDistance: number;
  lastPoint: PointerPoint | null;
};

export type ProfileImageCropperChange = {
  file: File | null;
  crop: ProfileImageCrop;
};

type ProfileImageCropperProps = {
  imageUrl: string | null;
  initialCrop?: ProfileImageCropInput;
  open: boolean;
  locale: string;
  onChange: (value: ProfileImageCropperChange) => void;
};

function distanceBetween(first: PointerPoint, second: PointerPoint): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function centerOfPoints(points: PointerPoint[]): PointerPoint {
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}

export default function ProfileImageCropper({
  imageUrl,
  initialCrop = DEFAULT_PROFILE_IMAGE_CROP,
  open,
  locale,
  onChange,
}: ProfileImageCropperProps) {
  const copy = resolveProfileImageCropCopy(locale);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const pointersRef = useRef<Map<number, PointerPoint>>(new Map());
  const gestureRef = useRef<GestureState | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(imageUrl);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [crop, setCrop] = useState<ProfileImageCrop>(() => normalizeProfileImageCrop(initialCrop));
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [imageError, setImageError] = useState(false);
  const [fileError, setFileError] = useState(false);

  const clampCrop = useCallback((nextCrop: ProfileImageCrop): ProfileImageCrop => {
    const normalized = normalizeProfileImageCrop(nextCrop);
    if (!naturalSize.width || !naturalSize.height) return normalized;

    return clampProfileImageCropToImage({
      crop: normalized,
      imageWidth: naturalSize.width,
      imageHeight: naturalSize.height,
      viewportSize: CROP_VIEWPORT_SIZE_PX,
    });
  }, [naturalSize.height, naturalSize.width]);

  useEffect(() => {
    if (!open) return;
    onChange({ file: selectedFile, crop });
  }, [crop, onChange, open, selectedFile]);

  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  const handleFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file) return;

    const isSupportedType = ["image/jpeg", "image/png", "image/webp"].includes(file.type.toLowerCase());
    if (!isSupportedType || file.size > MAX_FILE_SIZE_BYTES) {
      setFileError(true);
      return;
    }

    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const nextObjectUrl = URL.createObjectURL(file);
    objectUrlRef.current = nextObjectUrl;
    setPreviewUrl(nextObjectUrl);
    setSelectedFile(file);
    setCrop(DEFAULT_PROFILE_IMAGE_CROP);
    setNaturalSize({ width: 0, height: 0 });
    setImageError(false);
    setFileError(false);
  }, []);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!previewUrl || imageError) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointersRef.current.values()];
    if (points.length >= 2) {
      const first = points[0];
      const second = points[1];
      gestureRef.current = {
        baseCrop: crop,
        startCenter: centerOfPoints(points.slice(0, 2)),
        startDistance: Math.max(1, distanceBetween(first, second)),
        lastPoint: null,
      };
      return;
    }

    gestureRef.current = {
      baseCrop: crop,
      startCenter: { x: event.clientX, y: event.clientY },
      startDistance: 0,
      lastPoint: { x: event.clientX, y: event.clientY },
    };
  }, [crop, imageError, previewUrl]);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;

    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointersRef.current.values()];
    const gesture = gestureRef.current;
    if (!gesture) return;

    if (points.length >= 2 && gesture.startDistance > 0) {
      const first = points[0];
      const second = points[1];
      const center = centerOfPoints(points.slice(0, 2));
      const distance = distanceBetween(first, second);
      setCrop(clampCrop({
        scale: gesture.baseCrop.scale * (distance / gesture.startDistance),
        x: gesture.baseCrop.x + (center.x - gesture.startCenter.x) / CROP_VIEWPORT_SIZE_PX,
        y: gesture.baseCrop.y + (center.y - gesture.startCenter.y) / CROP_VIEWPORT_SIZE_PX,
      }));
      return;
    }

    const lastPoint = gesture.lastPoint;
    if (!lastPoint) return;
    const deltaX = event.clientX - lastPoint.x;
    const deltaY = event.clientY - lastPoint.y;
    gesture.lastPoint = { x: event.clientX, y: event.clientY };
    setCrop((current) => clampCrop({
      ...current,
      x: current.x + deltaX / CROP_VIEWPORT_SIZE_PX,
      y: current.y + deltaY / CROP_VIEWPORT_SIZE_PX,
    }));
  }, [clampCrop]);

  const handlePointerEnd = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const points = [...pointersRef.current.values()];
    if (points.length === 1) {
      gestureRef.current = {
        baseCrop: crop,
        startCenter: points[0],
        startDistance: 0,
        lastPoint: points[0],
      };
    } else if (points.length === 0) {
      gestureRef.current = null;
    }
  }, [crop]);

  const baseScale = naturalSize.width && naturalSize.height
    ? Math.max(
        CROP_VIEWPORT_SIZE_PX / naturalSize.width,
        CROP_VIEWPORT_SIZE_PX / naturalSize.height,
      )
    : 1;
  const imageWidth = naturalSize.width ? naturalSize.width * baseScale : "100%";
  const imageHeight = naturalSize.height ? naturalSize.height * baseScale : "100%";

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="relative h-[240px] w-[240px] touch-none select-none overflow-hidden rounded-full bg-gray-100 shadow-inner"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        role="img"
        aria-label={copy.hint}
      >
        {previewUrl && !imageError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt=""
            draggable={false}
            onLoad={(event) => {
              setNaturalSize({
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              });
              setCrop((current) => clampCrop(current));
            }}
            onError={() => setImageError(true)}
            className="absolute left-1/2 top-1/2 max-w-none"
            style={{
              width: imageWidth,
              height: imageHeight,
              transform: `translate3d(calc(-50% + ${crop.x * CROP_VIEWPORT_SIZE_PX}px), calc(-50% + ${crop.y * CROP_VIEWPORT_SIZE_PX}px), 0) scale(${crop.scale})`,
              transformOrigin: "center",
            }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-gray-400">
            <UserRound size={64} strokeWidth={1.5} aria-hidden="true" />
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 rounded-full border-2 border-white/90 shadow-[0_0_0_999px_rgba(15,23,42,0.18)]" />
      </div>

      <p className="max-w-[280px] text-center text-[12px] leading-snug text-gray-500">{copy.hint}</p>

      <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-[13px] font-semibold text-slate-800 transition active:bg-gray-100">
        <ImagePlus size={16} aria-hidden="true" />
        <span>{previewUrl ? copy.changePhoto : copy.addPhoto}</span>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={handleFileChange}
        />
      </label>

      {fileError ? <p className="text-center text-[12px] text-red-500" role="alert">{copy.invalidFile}</p> : null}
      {imageError ? <p className="text-center text-[12px] text-red-500" role="alert">{copy.loadError}</p> : null}
      <span className="sr-only">Zoom up to {PROFILE_IMAGE_MAX_SCALE}x</span>
    </div>
  );
}
