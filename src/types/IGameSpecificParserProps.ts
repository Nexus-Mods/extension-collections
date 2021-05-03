import { types } from 'vortex-api';
import { ICollection } from './ICollection';

export interface IGameSpecificParserProps {
  api: types.IExtensionApi;
  gameId: string;
  collection: ICollection;
}
