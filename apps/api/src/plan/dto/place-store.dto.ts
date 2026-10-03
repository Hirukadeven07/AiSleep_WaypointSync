import { IsNumber, Max, Min } from 'class-validator';

export class PlaceStoreDto {
  @IsNumber()
  @Min(5.85)
  @Max(9.95)
  lat: number;

  @IsNumber()
  @Min(79.4)
  @Max(82.05)
  lng: number;
}
