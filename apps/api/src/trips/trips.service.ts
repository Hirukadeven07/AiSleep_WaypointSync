import { Injectable } from '@nestjs/common';

@Injectable()
export class TripsService {
  placeholder() {
    return { todo: 'trips' };
  }
}
