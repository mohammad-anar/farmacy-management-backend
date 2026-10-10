import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';

@Injectable()
export class ParseObjectIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    const objectIdRegex = /^[0-9a-fA-F]{24}$/;
    if (!objectIdRegex.test(value)) {
      throw new BadRequestException(`Invalid ID format '${value}'. Expected 24-character hexadecimal ObjectId.`);
    }
    return value;
  }
}
