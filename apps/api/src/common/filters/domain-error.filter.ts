import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { DomainError } from '@waypoint/domain';

@Catch(DomainError)
export class DomainErrorFilter implements ExceptionFilter {
  catch(error: DomainError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    res.status(409).json({ reason: error.reasonCode, message: error.message });
  }
}
