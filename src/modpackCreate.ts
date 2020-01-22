import { startEditModPack } from './actions/session';
import { createModpackFromProfile } from './util/modpack';

import { types } from 'vortex-api';

export function initFromProfile(api: types.IExtensionApi, profileId: string) {
  const { id, name, updated } = createModpackFromProfile(api, profileId);
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
