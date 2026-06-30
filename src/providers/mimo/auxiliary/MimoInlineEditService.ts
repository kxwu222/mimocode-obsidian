import { QueryBackedInlineEditService } from '../../../core/auxiliary/QueryBackedInlineEditService';
import type ClaudianPlugin from '../../../main';
import { MimoAuxQueryRunner } from './MimoAuxQueryRunner';

export class MimoInlineEditService extends QueryBackedInlineEditService {
  constructor(plugin: ClaudianPlugin) {
    super(new MimoAuxQueryRunner(plugin));
  }
}
