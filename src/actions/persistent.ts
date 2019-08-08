import { createAction } from 'redux-act';

export const setModPackInfo = createAction('SET_MODPACK_INFO',
    (profileId: string, key: string, value: any) => ({ profileId, key, value }));
