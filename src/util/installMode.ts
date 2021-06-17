import * as Redux from 'redux';
import { actions, types, util } from 'vortex-api';

export function genDefaultInstallModeAction(api: types.IExtensionApi,
                                            collectionId: string,
                                            mods: types.IMod[],
                                            gameId: string): Redux.Action {

  if (mods.length === 0) {
    // No mods, no point in continuing.
    return undefined;
  }
  const state = api.getState();
  const collection = util.getSafe(state, ['persistent', 'mods', gameId, collectionId], undefined);
  if (collection === undefined) {
    const error = new util.ProcessCanceled('Unable to find collection mod',
      { collectionId: collection.id });
    api.showErrorNotification('Failed to ascertain default install mode', error);
    return undefined;
  }

  const filtered = mods.filter(mod => util.getSafe(collection.attributes,
    ['collection', 'installMode', mod.id], undefined) === undefined);
  if (filtered.length === 0) {
    // all received mods have an assigned installation mode. Nothing to do here.
    return undefined;
  }
  const attr = util.getSafe(collection.attributes, ['collection'], {});
  const resAttr = filtered.reduce((prev, mod) => {
    const choices = util.getSafe(mod, ['attributes', 'installerChoices'], {});
    if (choices?.['type'] === 'fomod' && choices['options']?.length > 0) {
      prev = util.setSafe(prev, ['installMode', mod.id], 'choices');
    }
    return prev;
  }, attr);

  return actions.setModAttribute(gameId, collection.id, 'collection', resAttr);
}
