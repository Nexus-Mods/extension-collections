import { IRevision } from 'nexus-api';

export interface IRevisionEx extends IRevision {
  success?: boolean;
}
