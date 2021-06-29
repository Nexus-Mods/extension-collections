import { ICollection, IRevision } from '@nexusmods/nexus-api';
import { createAction } from 'redux-act';

export const updateCollectionInfo = createAction('UPDATE_COLLECTION_INFO',
  (collectionId: string, collectionInfo: Partial<ICollection>, timestamp: number) =>
    ({ collectionId, collectionInfo, timestamp }));

export const updateRevisionInfo = createAction('UPDATE_REVISION_INFO',
  (revisionId: string, revisionInfo: Partial<IRevision>, timestamp: number) =>
    ({ revisionId, revisionInfo, timestamp }));

export const updateSuccessRate = createAction('UPDATE_COLLECTION_HEALTH_RATE',
  (revisionId: string, success: boolean) => ({ revisionId, success }));
