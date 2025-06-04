import { EARS } from '@/shared/ears/types';
import type { MessageEntity, Rows, TagEntity, ThreadEntity } from '@/shared/types';
import type { AgentStartupData, AgentThreadData } from '@/types';
import { flowRows } from './mock-data';

export default function flowsStartupData() {
  return flowRows
}