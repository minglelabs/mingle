#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function normalizeRelativePath(filePath, workspaceRoot) {
  return path.relative(workspaceRoot, filePath).split(path.sep).join("/");
}

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

export function buildFileMediaSnapshot(filePath, workspaceRoot) {
  const stats = fs.statSync(filePath);
  return {
    path: normalizeRelativePath(filePath, workspaceRoot),
    sha256: sha256File(filePath),
    sizeBytes: stats.size,
  };
}

export function buildScreenshotMediaSnapshot(filePaths, workspaceRoot) {
  return filePaths.map((filePath) => buildFileMediaSnapshot(filePath, workspaceRoot));
}

export function normalizeMediaSnapshots(value) {
  const normalized = {
    icon: null,
    featureGraphic: null,
    phoneScreenshots: {},
  };

  if (!value || typeof value !== "object") {
    return normalized;
  }

  if (value.icon && typeof value.icon === "object") {
    normalized.icon = value.icon;
  }

  if (value.featureGraphic && typeof value.featureGraphic === "object") {
    normalized.featureGraphic = value.featureGraphic;
  }

  if (value.phoneScreenshots && typeof value.phoneScreenshots === "object") {
    normalized.phoneScreenshots = { ...value.phoneScreenshots };
  }

  return normalized;
}

export function mediaSnapshotsEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function cloneMediaSnapshots(value) {
  return JSON.parse(JSON.stringify(normalizeMediaSnapshots(value)));
}
