import { createAction } from 'redux-act';

export const updateCollectionInfo = createAction('UPDATE_COLLECTION_INFO',
  (collectionId: string, revisionInfo: any) => ({ collectionId, revisionInfo }));

export const updateSuccessRate = createAction('UPDATE_COLLECTION_HEALTH_RATE',
  (collectionId: string, revisionId: string, success: boolean) =>
    ({ collectionId, revisionId, success }));
