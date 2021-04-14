import { IRevision } from '@nexusmods/nexus-api';
import { types } from 'vortex-api';

export interface IGameSpecificInterfaceProps {
  collection: types.IMod;
  revisionInfo: IRevision;
}
