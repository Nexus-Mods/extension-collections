import { createAction } from 'redux-act';

export const setCollectionInfo = createAction('SET_COLLECTION_INFO',
    (collectionId: string, collectionInfo: any) => ({ collectionId, collectionInfo }));

export const setRevisionInfo = createAction('SET_COLLECTION_REVISION_INFO',
    (collectionId: string, revisionId: string, revisionInfo: any) => ({ collectionId, revisionId, revisionInfo }));

export const updateSuccessRate = createAction('UPDATE_COLLECTION_HEALTH_RATE',
    (collectionId: string, revisionId: string, success: boolean) => ({ collectionId, revisionId, success }));
