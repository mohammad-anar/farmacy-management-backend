import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response, Request } from 'express';

@Catch(Prisma.PrismaClientKnownRequestError, Prisma.PrismaClientValidationError)
export class PrismaClientExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaClientExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError | Prisma.PrismaClientValidationError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.BAD_REQUEST;
    let message = 'Database operation failed';

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002': {
          const target = (exception.meta?.target as string[])?.join(', ') || 'field';
          status = HttpStatus.CONFLICT;
          message = `Unique constraint violation: A record with this ${target} already exists.`;
          break;
        }
        case 'P2025':
          status = HttpStatus.NOT_FOUND;
          message = 'Record not found or already deleted.';
          break;
        default:
          this.logger.warn(`Prisma Known Error ${exception.code}: ${exception.message}`);
          message = `Database error: ${exception.message.split('\n').pop()}`;
      }
    } else {
      this.logger.warn(`Prisma Validation Error: ${exception.message}`);
      message = 'Invalid data provided for database query';
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      error: status === HttpStatus.CONFLICT ? 'Conflict' : status === HttpStatus.NOT_FOUND ? 'Not Found' : 'Bad Request',
      message,
    });
  }
}
