import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import {
  uploadCompleteRequestSchema,
  uploadInitRequestSchema,
  type UploadCompleteRequest,
  type UploadInitRequest,
  type UploadInitResponse,
  type UploadStatusResponse,
} from '@naf/shared';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { NafUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { UploadsService } from './uploads.service';

@Controller()
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post('uploads/init')
  init(
    @CurrentUser() user: NafUser,
    @Body(new ZodValidationPipe(uploadInitRequestSchema)) dto: UploadInitRequest,
  ): Promise<UploadInitResponse> {
    return this.uploads.init(user, dto);
  }

  @Get('uploads/:sessionId')
  status(@CurrentUser() user: NafUser, @Param('sessionId') sessionId: string): Promise<UploadStatusResponse> {
    return this.uploads.status(user, sessionId);
  }

  @Post('uploads/:sessionId/complete')
  complete(
    @CurrentUser() user: NafUser,
    @Param('sessionId') sessionId: string,
    @Body(new ZodValidationPipe(uploadCompleteRequestSchema)) dto: UploadCompleteRequest,
  ): Promise<{ nodeId: string }> {
    return this.uploads.complete(user, sessionId, dto);
  }

  @Delete('uploads/:sessionId')
  cancel(@CurrentUser() user: NafUser, @Param('sessionId') sessionId: string): Promise<void> {
    return this.uploads.cancel(user, sessionId);
  }
}
