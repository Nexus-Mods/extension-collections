import { createAction } from 'redux-act';

export const startEditCollection = createAction('START_EDIT_COLLECTION',
    (modId: string) => ({ modId }));
