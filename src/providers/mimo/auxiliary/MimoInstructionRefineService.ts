import { QueryBackedInstructionRefineService } from '../../../core/auxiliary/QueryBackedInstructionRefineService';
import type ClaudianPlugin from '../../../main';
import { MimoAuxQueryRunner } from './MimoAuxQueryRunner';

export class MimoInstructionRefineService extends QueryBackedInstructionRefineService {
  constructor(plugin: ClaudianPlugin) {
    super(new MimoAuxQueryRunner(plugin));
  }
}
