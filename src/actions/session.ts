import { createAction } from 'redux-act';

export const startEditModPack = createAction('START_EDIT_COLLECTION',
    (modId: string) => ({ modId }));
