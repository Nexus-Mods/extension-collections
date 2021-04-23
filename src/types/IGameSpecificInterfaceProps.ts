import { IRevision } from '@nexusmods/nexus-api';
import { types } from 'vortex-api';

export interface IGameSpecificInterfaceProps {
  t: types.TFunction;
  collection: types.IMod;
  revisionInfo: IRevision;
}
