import { IGameSpecificInterfaceProps } from './IGameSpecificInterfaceProps';

import { types } from 'vortex-api';
import { ICollection } from './ICollection';

export interface IGameSupportEntry {
  gameId: string;
  generator: (state: types.IState,
              gameId: string,
              stagingPath: string,
              modIds: string[],
              mods: { [modId: string]: types.IMod }) => Promise<any>;

  parser: (api: types.IExtensionApi,
           gameId: string,
           collection: ICollection) => Promise<void>;

  interface: (props: IGameSpecificInterfaceProps) => JSX.Element;
}
