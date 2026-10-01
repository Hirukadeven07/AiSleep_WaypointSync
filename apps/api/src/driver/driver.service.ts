import { Injectable } from '@nestjs/common';
import type { DriverDayResponse } from '@waypoint/contracts';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { ClockService } from '../common/clock/clock.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { buildDriverDay, DRIVER_TRIP_STATUSES } from './driver-day.mapper';

const asDate = (iso: string) => new Date(`${iso}T00:00:00Z`);

@Injectable()
export class DriverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
  ) {}

  /** Today's workable trips for the vehicle linked by `Vehicle.driverId`, same ownership rule as sync. */
  async day(me: AuthUser): Promise<DriverDayResponse> {
    const serviceDate = this.clock.today();
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { driverId: me.id },
      select: {
        id: true,
        plate: true,
        type: true,
        trips: {
          where: { serviceDate: asDate(serviceDate), status: { in: DRIVER_TRIP_STATUSES } },
          orderBy: { tripNumber: 'asc' },
          select: {
            id: true,
            tripNumber: true,
            status: true,
            planVersion: true,
            stops: {
              orderBy: { sequence: 'asc' },
              select: {
                id: true,
                sequence: true,
                status: true,
                etaMin: true,
                arrivedAt: true,
                storeConfirmedAt: true,
                driverAckAt: true,
                order: {
                  select: {
                    id: true,
                    urgentNote: true,
                    store: {
                      select: {
                        id: true,
                        displayName: true,
                        windowOpenMin: true,
                        windowCloseMin: true,
                        lat: true,
                        lng: true,
                        phone: true,
                        district: { select: { name: true } },
                        phones: { select: { label: true, phoneNo: true } },
                      },
                    },
                  },
                },
                flags: {
                  orderBy: { createdAt: 'asc' },
                  select: {
                    id: true,
                    type: true,
                    qty: true,
                    note: true,
                    orderLine: { select: { name: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    return buildDriverDay(serviceDate, vehicle);
  }
}
