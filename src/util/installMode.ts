import * as Redux from 'redux';
import { MissingCollectionModError } from '../types/Errors';
import { actions, types, util } from 'vortex-api';

export function genDefaultInstallModeAction(api: types.IExtensionApi,
                                            collectionId: string,
                                            modIds: string[],
                                            gameId: string): Redux.Action {
  const state = api.getState();
  const collection = util.getSafe(state, ['persistent', 'mods', gameId, collectionId], undefined);
  if (collection === undefined) {
    api.showErrorNotification('Failed to ascertain default install mode', new MissingCollectionModError(collectionId));
    return undefined;
  }

  const attr = util.getSafe(collection.attributes, ['collection'], {});
  const resAttr = modIds.reduce((prev, iter) => {
    if (collection.rules?.find?.(rule => rule.reference.id === iter) === undefined) {
      // Mod is not in the collection.
      return prev;
    }
    const mod = state.persistent.mods[gameId]?.[iter];
    if (mod === undefined) {
      // how ? regardless - not the correct location to report this.
      return prev;
    }
    const choices = util.getSafe(mod, ['attributes', 'installerChoices'], {});
    if (choices?.['type'] === 'fomod' && choices['options']?.length > 0) {
      prev = util.setSafe(prev, ['installMode', iter], 'choices');
    }
    return prev;
  }, attr);

  return actions.setModAttribute(gameId, collection.id, 'collection', resAttr);
}

export function assignDefaultInstallMode(api: types.IExtensionApi,
                                         collectionId: string,
                                         modIds: string[],
                                         gameId: string) {
  const action: Redux.Action = genDefaultInstallModeAction(api, collectionId, modIds, gameId);
  if (action !== undefined) {
    api.store.dispatch(action);
  }
}
