import { createModpackFromProfile } from './util/modpack';

import { actions, types } from 'vortex-api';

export async function initFromProfile(api: types.IExtensionApi, profileId: string) {
  const { id, name, updated } = await createModpackFromProfile(api, profileId);
  api.store.dispatch(actions.setModEnabled(profileId, id, true));
  api.sendNotification({
    type: 'success',
    id: 'modpack-created',
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
