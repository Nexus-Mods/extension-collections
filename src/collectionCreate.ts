import memoizeOne from 'memoize-one';
import { MOD_TYPE } from './constants';
import { createCollectionFromProfile } from './util/transformCollection';

import * as Redux from 'redux';
import { actions, selectors, types, util } from 'vortex-api';

export async function initFromProfile(api: types.IExtensionApi, profileId: string) {
  try {
    const { id, name, updated } = await createCollectionFromProfile(api, profileId);
    api.store.dispatch(actions.setModEnabled(profileId, id, true));
    api.sendNotification({
      type: 'success',
      id: 'collection-created',
      title: updated ? 'Collection updated' : 'Collection created',
      message: name,
      displayMS: util.calcDuration(name.length + 20),
      actions: [
        {
          title: 'Edit',
          action: dismiss => {
            api.events.emit('edit-collection', id);
            dismiss();
          },
        },
      ],
    });
  } catch (err) {
    if (!(err instanceof util.UserCanceled)) {
      throw err;
    }
  }
}

const collections = memoizeOne((mods: { [modId: string]: types.IMod }) => {
  const isWorkshopCollection = mod => (mod.type === MOD_TYPE)
          && (mod.attributes?.editable === true);
  return Object.values(mods)
    .filter(isWorkshopCollection)
    .map(coll => new Set((coll.rules ?? []).map(rule => rule.reference.id)));
});

export function addCollectionCondition(api: types.IExtensionApi, instanceIds: string[]) {
  const state = api.getState();
  const gameId = selectors.activeGameId(state);
  const mods = state.persistent.mods[gameId];

  return collections(mods).find(ruleSet => {
    // only offer the option if there is at least one mod not assigned to a collection
    return instanceIds.find(modId =>
      (mods[modId].type !== MOD_TYPE) && !ruleSet.has(modId)) !== undefined;
  }) !== undefined;
}

export function removeCollectionCondition(api: types.IExtensionApi, instanceIds: string[]) {
  const state = api.getState();
  const gameId = selectors.activeGameId(state);
  const mods = state.persistent.mods[gameId];
  return collections(mods).find(ruleSet => {
    // only offer the option if there is at least one mod assigned to a collection
    return instanceIds.find(modId => ruleSet.has(modId)) !== undefined;
  }) !== undefined;
}

export function alreadyIncluded(rules, modId): boolean {
  return rules?.find?.(rule => rule.reference.id === modId) !== undefined;
}

export function addCollectionAction(api: types.IExtensionApi, instanceIdsIn: string[]) {
  const state = api.getState();
  const gameId = selectors.activeGameId(state);

  const mods = state.persistent.mods[gameId];

  // Not sure why this would happen but maybe if the table uses a cache
  const instanceIds = instanceIdsIn.filter(modId => mods[modId] !== undefined);

  const filtered = instanceIds.filter(modId => (mods[modId].type !== MOD_TYPE));

  const collections = Object.keys(mods)
    .filter(collectionId => {
      if ((mods[collectionId].type !== MOD_TYPE)
          || (mods[collectionId].attributes?.editable !== true)) {
        return false;
      }

      const rules = mods[collectionId].rules ?? [];

      // only offer the option if there is at least one mod selected that is not
      // already in that collection
      return filtered.find(modId => !alreadyIncluded(rules, modId)) !== undefined;
    });

  const sortAlphabetically = (modIds: string[]) => {
    const temp = [...modIds];
    temp.sort((a, b) => {
      const modA = util.renderModName(mods[a]).toLowerCase();
      const modB = util.renderModName(mods[b]).toLowerCase();
      return modA.localeCompare(modB);
    });
    return temp;
  };
  return api.showDialog('question', 'Add Mods to Collection', {
    text: 'Choose which collection you want the selected mods to be added',
    message: sortAlphabetically(filtered).map(modId =>
      util.renderModName(mods[modId], { version: true, variant: true })).join('\n'),
        choices: sortAlphabetically(collections).map((modId, idx) => ({
      id: modId,
      text: util.renderModName(mods[modId]),
      value: idx === 0,
    })),
  }, [
    { label: 'Cancel' },
    { label: 'Add' },
  ])
    .then((result: types.IDialogResult) => {
      if (result.action === 'Add') {
        const collectionId = Object.keys(result.input).find(target => result.input[target]);
        if (mods[collectionId] === undefined) {
          // not entirely sure how this could happen
          return;
        }
        const rules = mods[collectionId].rules ?? [];
        util.batchDispatch(api.store, filtered.reduce((prev: Redux.Action[], modId: string) => {
          if (!alreadyIncluded(rules, modId) && (mods[modId].type !== MOD_TYPE)) {
            prev.push(actions.addModRule(gameId, collectionId, {
              type: 'requires',
              reference: {
                id: modId,
              },
            }));
          }
          return prev;
        }, []));
      }
    });
}

export function removeCollectionAction(api: types.IExtensionApi, instanceIds: string[]) {
  const state = api.getState();
  const gameId = selectors.activeGameId(state);
  const mods = state.persistent.mods[gameId];
  const collections = Object.keys(mods)
    .filter(collectionId => {
      if ((mods[collectionId].type !== MOD_TYPE)
          || (mods[collectionId].attributes?.editable !== true)) {
        return false;
      }

      const rules = mods[collectionId].rules ?? [];

      // only offer the option if there is at least one mod assigned to a collection
      return instanceIds.find(modId => alreadyIncluded(rules, modId)) !== undefined;
    });

  return api.showDialog('question', 'Remove Mods from Collection', {
    text: 'Please select the (modifiable) collection to remove the mods from',
    message: instanceIds.map(modId => util.renderModName(mods[modId])).join('\n'),
    choices: collections.map((modId, idx) => ({
      id: modId,
      text: util.renderModName(mods[modId]),
      value: idx === 0,
    })),
  }, [
    { label: 'Cancel' },
    { label: 'Remove' },
  ])
    .then((result: types.IDialogResult) => {
      if (result.action === 'Remove') {
        const collectionId = Object.keys(result.input).find(target => result.input[target]);
        const rules = mods[collectionId].rules ?? [];

        util.batchDispatch(api.store, instanceIds.reduce((prev: Redux.Action[], modId: string) => {
          const ruleToRemove = rules.find(rule => rule.reference.id === modId);
          if (ruleToRemove !== undefined) {
            prev.push(actions.removeModRule(gameId, collectionId, ruleToRemove));
          }
          return prev;
        }, []));
      }
    });
}
