import { Injectable } from '@nestjs/common';

@Injectable()
export class SyncService {
  placeholder() {
    return { todo: 'sync' };
  }
}
