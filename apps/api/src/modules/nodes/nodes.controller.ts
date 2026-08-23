import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { uuidSchema } from '@naf/shared';
import { z } from 'zod';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { NafUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  createFolderInputSchema,
  renameNodeInputSchema,
  moveNodeInputSchema,
  type CreateFolderInput,
  type MoveNodeInput,
  type NodeDto,
  type RenameNodeInput,
} from '@naf/shared';
import { NodesService } from './nodes.service';

const listQuerySchema = z.object({
  parentId: z.union([uuidSchema, z.literal('root')]).optional(),
  trash: z.coerce.boolean().optional(),
});

@Controller('nodes')
export class NodesController {
  constructor(private readonly nodes: NodesService) {}

  @Get()
  async list(
    @CurrentUser() user: NafUser,
    @Query(new ZodValidationPipe(listQuerySchema)) query: { parentId?: string; trash?: boolean },
  ): Promise<NodeDto[]> {
    if (query.trash) return this.nodes.listTrash(user);
    const parentId =
      query.parentId == null || query.parentId === 'root' ? null : (query.parentId as string);
    return this.nodes.listChildren(user, parentId);
  }

  @Post()
  createFolder(
    @CurrentUser() user: NafUser,
    @Body(new ZodValidationPipe(createFolderInputSchema)) dto: CreateFolderInput,
  ): Promise<NodeDto> {
    return this.nodes.createFolder(user, dto.parentId, dto.name);
  }

  @Patch(':id/rename')
  rename(
    @CurrentUser() user: NafUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(renameNodeInputSchema)) dto: RenameNodeInput,
  ): Promise<NodeDto> {
    return this.nodes.rename(user, id, dto.name);
  }

  @Patch(':id/move')
  move(
    @CurrentUser() user: NafUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(moveNodeInputSchema)) dto: MoveNodeInput,
  ): Promise<NodeDto> {
    return this.nodes.move(user, id, dto.parentId);
  }

  @Post(':id/trash')
  async trash(@CurrentUser() user: NafUser, @Param('id') id: string): Promise<{ ok: true }> {
    await this.nodes.trash(user, id);
    return { ok: true };
  }

  @Post(':id/restore')
  async restore(@CurrentUser() user: NafUser, @Param('id') id: string): Promise<{ ok: true }> {
    await this.nodes.restore(user, id);
    return { ok: true };
  }

  @Delete(':id')
  async purge(@CurrentUser() user: NafUser, @Param('id') id: string): Promise<{ ok: true }> {
    await this.nodes.purge(user, id);
    return { ok: true };
  }
}
