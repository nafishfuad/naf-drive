import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import type { ZodTypeAny } from 'zod';

/**
 * Per-route validation: @Body(new ZodValidationPipe(vaultInitRequestSchema)).
 * Unknown fields are stripped by schemas using .strict() where required.
 */
@Injectable()
export class ZodValidationPipe<T extends ZodTypeAny> implements PipeTransform<unknown, T['_output']> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): T['_output'] {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Request body failed schema validation',
        details: result.error.flatten(),
      });
    }
    return result.data;
  }
}
