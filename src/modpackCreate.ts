import { startEditModPack } from './actions/session';
import { createModpackFromProfile } from './util/modpack';

import { types } from 'vortex-api';

export function initFromProfile(api: types.IExtensionApi, profileId: string, update: boolean) {
  const { id, name } = createModpackFromProfile(api, profileId);
  api.sendNotification({
    type: 'success',
    id: 'modpack-created',
    title: update ? 'Modpack updated' : 'Modpack created',
    message: name,
    actions: [
      {
        title: 'Configure',
        action: dismiss => {
          api.store.dispatch(startEditModPack(id));
          dismiss();
        },
      },
    ],
  });
}
