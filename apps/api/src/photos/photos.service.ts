import { Injectable, Logger } from '@nestjs/common';
import { createHash, createHmac } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join } from 'path';

const REGION = 'us-east-1';

@Injectable()
export class PhotosService {
  private readonly log = new Logger(PhotosService.name);
  readonly bucket = process.env.MINIO_BUCKET ?? 'photos';
  readonly fallbackDir = process.env.PHOTO_FALLBACK_DIR ?? join(tmpdir(), 'waypoint-photos');
  private bucketReady = false;

  /**
   * Store bytes in MinIO (`MINIO_BUCKET`). On failure, write PHOTO_FALLBACK_DIR.
   * Returns the object key to persist on the owning table — never the bytes.
   */
  async put(key: string, body: Buffer, contentType = 'image/png'): Promise<string> {
    const safeKey = key.replace(/^\/+/, '');
    try {
      await this.putMinio(safeKey, body, contentType);
    } catch (err) {
      this.log.warn(
        `MinIO put failed for ${safeKey}, writing fallback: ${(err as Error).message}`,
      );
      const dest = join(this.fallbackDir, ...safeKey.split('/'));
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, body);
    }
    return safeKey;
  }

  decodePngBase64(raw: string): Buffer {
    const trimmed = raw.trim();
    const b64 = trimmed.includes(',') ? trimmed.slice(trimmed.indexOf(',') + 1) : trimmed;
    const buf = Buffer.from(b64, 'base64');
    if (buf.length < 8) {
      throw new Error('Signature image is empty');
    }
    return buf;
  }

  private async putMinio(key: string, body: Buffer, contentType: string) {
    const endpoint = process.env.MINIO_ENDPOINT;
    if (!endpoint) throw new Error('MINIO_ENDPOINT is not set');
    const access = process.env.MINIO_ROOT_USER ?? 'waypoint';
    const secret = process.env.MINIO_ROOT_PASSWORD ?? 'waypoint-secret';
    const base = new URL(endpoint);
    if (!this.bucketReady) {
      await this.ensureBucket(base, access, secret);
      this.bucketReady = true;
    }
    const res = await this.s3(
      base,
      access,
      secret,
      'PUT',
      `/${this.bucket}/${key.split('/').map(encodeURIComponent).join('/')}`,
      body,
      contentType,
    );
    if (!res.ok) {
      throw new Error(`MinIO PUT ${res.status}: ${await res.text()}`);
    }
  }

  private async ensureBucket(base: URL, access: string, secret: string) {
    const head = await this.s3(base, access, secret, 'HEAD', `/${this.bucket}`, Buffer.alloc(0));
    if (head.status === 200) return;
    if (head.status !== 404) {
      throw new Error(`MinIO HEAD bucket ${head.status}: ${await head.text()}`);
    }
    const created = await this.s3(
      base,
      access,
      secret,
      'PUT',
      `/${this.bucket}`,
      Buffer.alloc(0),
      'application/octet-stream',
    );
    if (!created.ok && created.status !== 409) {
      throw new Error(`MinIO create bucket ${created.status}: ${await created.text()}`);
    }
  }

  private async s3(
    base: URL,
    accessKey: string,
    secretKey: string,
    method: string,
    canonicalUri: string,
    body: Buffer,
    contentType = 'application/octet-stream',
  ): Promise<Response> {
    const host = base.host;
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = sha256Hex(body);
    const canonicalHeaders =
      `content-type:${contentType}\n` +
      `host:${host}\n` +
      `x-amz-content-sha256:${payloadHash}\n` +
      `x-amz-date:${amzDate}\n`;
    const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
    const canonicalRequest = [
      method,
      canonicalUri,
      '',
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');
    const scope = `${dateStamp}/${REGION}/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      scope,
      sha256Hex(canonicalRequest),
    ].join('\n');
    const signingKey = hmac(
      hmac(hmac(hmac(`AWS4${secretKey}`, dateStamp), REGION), 's3'),
      'aws4_request',
    );
    const signature = createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');
    const authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    return fetch(`${base.origin}${canonicalUri}`, {
      method,
      headers: {
        'Content-Type': contentType,
        Host: host,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': amzDate,
        Authorization: authorization,
      },
      body: method === 'HEAD' ? undefined : body,
      signal: AbortSignal.timeout(2000),
    });
  }
}

function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}
