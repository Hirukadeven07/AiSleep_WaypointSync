import { Module } from '@nestjs/common';
import { StopsController } from './stops.controller';
import { StopsService } from './stops.service';

@Module({
  controllers: [StopsController],
  providers: [StopsService],
  exports: [StopsService],
})
export class StopsModule {}
