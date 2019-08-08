import { createAction } from 'redux-act';

export const startEditModPack = createAction('START_EDIT_MODPACK',
    (modId: string) => ({ modId }));
