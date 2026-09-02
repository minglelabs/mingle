import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

type ProfileImageStorageConfig = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicBaseUrl: string;
};

let client: S3Client | null = null;

function readFirstEnvironmentValue(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return "";
}

export function readProfileImageStorageConfig(): ProfileImageStorageConfig | null {
  const accountId = readFirstEnvironmentValue(
    "CLOUDFLARE_R2_ACCOUNT_ID",
    "R2_ACCOUNT_ID",
  );
  const accessKeyId = readFirstEnvironmentValue(
    "CLOUDFLARE_R2_ACCESS_KEY_ID",
    "R2_ACCESS_KEY_ID",
  );
  const secretAccessKey = readFirstEnvironmentValue(
    "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
    "R2_SECRET_ACCESS_KEY",
  );
  const bucketName = readFirstEnvironmentValue(
    "CLOUDFLARE_R2_BUCKET_NAME",
    "R2_BUCKET_NAME",
  );
  const publicBaseUrl = readFirstEnvironmentValue(
    "CLOUDFLARE_R2_PUBLIC_URL",
    "R2_PUBLIC_URL",
  ).replace(/\/+$/, "");

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName || !publicBaseUrl) {
    return null;
  }

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName,
    publicBaseUrl,
  };
}

function getProfileImageStorageClient(config: ProfileImageStorageConfig): S3Client {
  if (client) return client;

  client = new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  return client;
}

export function buildProfileImagePublicUrl(
  objectKey: string,
  config = readProfileImageStorageConfig(),
): string {
  if (!config) throw new Error("profile_image_storage_not_configured");

  const encodedKey = objectKey
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${config.publicBaseUrl}/${encodedKey}`;
}

export async function putProfileImage(args: {
  objectKey: string;
  body: Uint8Array;
  contentType: string;
}): Promise<string> {
  const config = readProfileImageStorageConfig();
  if (!config) throw new Error("profile_image_storage_not_configured");

  await getProfileImageStorageClient(config).send(new PutObjectCommand({
    Bucket: config.bucketName,
    Key: args.objectKey,
    Body: args.body,
    ContentType: args.contentType,
    CacheControl: "public, max-age=31536000, immutable",
  }));

  return buildProfileImagePublicUrl(args.objectKey, config);
}

export async function deleteProfileImage(objectKey: string): Promise<void> {
  const config = readProfileImageStorageConfig();
  if (!config) return;

  await getProfileImageStorageClient(config).send(new DeleteObjectCommand({
    Bucket: config.bucketName,
    Key: objectKey,
  }));
}
