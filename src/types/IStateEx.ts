import { types } from 'vortex-api';
import { ICollectionEx } from './ICollectionEx';

const dummy: types.IState = undefined;

export type ISession = typeof dummy.session;
export type IPersistent = typeof dummy.persistent;

export interface IStateEx extends types.IState {
  session: typeof dummy.session & {
    collections: {
      modId: string;
    };
  };
  persistent: typeof dummy.persistent & {
    collections: {
      [collectionId: string]: ICollectionEx;
    },
  };
}
