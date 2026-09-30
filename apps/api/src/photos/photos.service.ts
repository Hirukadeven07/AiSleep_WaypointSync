import { Injectable } from '@nestjs/common';

/**
 * Placeholder for photo storage. Uploads go to MinIO (MINIO_ENDPOINT / MINIO_BUCKET);
 * when MinIO is unreachable, files fall back to PHOTO_FALLBACK_DIR.
 */
@Injectable()
export class PhotosService {
  readonly bucket = process.env.MINIO_BUCKET ?? 'photos';
  readonly fallbackDir = process.env.PHOTO_FALLBACK_DIR ?? '/tmp/photos';
}
