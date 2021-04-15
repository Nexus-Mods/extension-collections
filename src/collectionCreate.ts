import { MOD_TYPE } from './constants';
import { createCollectionFromProfile } from './util/transformCollection';

import { actions, selectors, types, util } from 'vortex-api';

export async function initFromProfile(api: types.IExtensionApi, profileId: string) {
  const { id, name, updated } = await createCollectionFromProfile(api, profileId);
  api.store.dispatch(actions.setModEnabled(profileId, id, true));
  api.sendNotification({
    type: 'success',
    id: 'collection-created',
    title: updated ? 'Collection updated' : 'Collection created',
    message: name,
    actions: [
      {
        title: 'Configure',
        action: dismiss => {
          api.events.emit('edit-collection', id);
          dismiss();
        },
      },
    ],
  });
}

export function addCollectionCondition(api: types.IExtensionApi, instanceIds: string[]) {
  const state = api.getState();
  const gameId = selectors.activeGameId(state);
  const mods = state.persistent.mods[gameId];
  return Object.keys(mods)
    .find(collectionId => {
      if (mods[collectionId].type !== MOD_TYPE) {
        return false;
      }

      const rules = mods[collectionId].rules ?? [];

      // only offer the option if there is at least one mod assigned to a collection
      return instanceIds.find(modId => !alreadyIncluded(rules, modId)) !== undefined;
    }) !== undefined;
}

export function removeCollectionCondition(api: types.IExtensionApi, instanceIds: string[]) {
  const state = api.getState();
  const gameId = selectors.activeGameId(state);
  const mods = state.persistent.mods[gameId];
  return Object.keys(mods)
    .find(collectionId => {
      if (mods[collectionId].type !== MOD_TYPE) {
        return false;
      }

      const rules = mods[collectionId].rules ?? [];

      // only offer the option if there is at least one mod assigned to a collection
      return instanceIds.find(modId => alreadyIncluded(rules, modId)) !== undefined;
    }) !== undefined;
}

export function alreadyIncluded(rules, modId): boolean {
  return rules.find(rule => rule.reference.id === modId) !== undefined;
}

export function addCollectionAction(api: types.IExtensionApi, instanceIds: string[]) {
  const state = api.getState();
  const gameId = selectors.activeGameId(state);
  const mods = state.persistent.mods[gameId];
  const collections = Object.keys(mods)
    .filter(collectionId => {
      if (mods[collectionId].type !== MOD_TYPE) {
        return false;
      }

      const rules = mods[collectionId].rules ?? [];

      // only offer the option if there is at least one mod selected that is not
      // already in that collection
      return instanceIds.find(modId => !alreadyIncluded(rules, modId)) !== undefined;
    });

  return api.showDialog('question', 'Add Mods to Collection', {
    text: 'Please select the collection to add the mods to',
    message: instanceIds.map(modId => util.renderModName(mods[modId])).join('\n'),
    choices: collections.map((modId, idx) => ({
      id: modId,
      text: util.renderModName(mods[modId]),
      value: idx === 0,
    }))
  }, [
    { label: 'Cancel' },
    { label: 'Add' },
  ])
    .then((result: types.IDialogResult) => {
      if (result.action === 'Add') {
        const collectionId = Object.keys(result.input).find(target => result.input[target]);
        const rules = mods[collectionId].rules ?? [];

        instanceIds.forEach(modId => {
          if (!alreadyIncluded(rules, modId)) {
            api.store.dispatch(actions.addModRule(gameId, collectionId, {
              type: 'requires',
              reference: {
                id: modId,
              },
            }));
          }
        });
      }
    });
}

export function removeCollectionAction(api: types.IExtensionApi, instanceIds: string[]) {
  const state = api.getState();
  const gameId = selectors.activeGameId(state);
  const mods = state.persistent.mods[gameId];
  const collections = Object.keys(mods)
    .filter(collectionId => {
      if (mods[collectionId].type !== MOD_TYPE) {
        return false;
      }

      const rules = mods[collectionId].rules ?? [];

      // only offer the option if there is at least one mod assigned to a collection
      return instanceIds.find(modId => alreadyIncluded(rules, modId)) !== undefined;
    });

  return api.showDialog('question', 'Remove Mods from Collection', {
    text: 'Please select the collection to remove the mods from',
    message: instanceIds.map(modId => util.renderModName(mods[modId])).join('\n'),
    choices: collections.map((modId, idx) => ({
      id: modId,
      text: util.renderModName(mods[modId]),
      value: idx === 0,
    }))
  }, [
    { label: 'Cancel' },
    { label: 'Remove' },
  ])
    .then((result: types.IDialogResult) => {
      if (result.action === 'Remove') {
        const collectionId = Object.keys(result.input).find(target => result.input[target]);
        const rules = mods[collectionId].rules ?? [];

        instanceIds.forEach(modId => {
          if (alreadyIncluded(rules, modId)) {
            api.store.dispatch(actions.removeModRule(gameId, collectionId, {
              type: 'requires',
              reference: {
                id: modId,
              },
            }));
          }
        });
      }
    });
}
