import { updateCollectionInfo, updateRevisionInfo } from '../actions/persistent';

import { ICollection, IRevision } from '@nexusmods/nexus-api';
import { types } from 'vortex-api';

const CACHE_EXPIRE_MS = 24 * 60 * 60 * 1000;

class InfoCache {
  private mApi: types.IExtensionApi;

  constructor(api: types.IExtensionApi) {
    this.mApi = api;
  }

  public async getCollectionInfo(collectionId: string): Promise<ICollection> {
    const { store } = this.mApi;
    const {collections} = store.getState().persistent.collections;
    if ((collections[collectionId]?.timestamp === undefined)
        || ((Date.now() - collections[collectionId].timestamp) > CACHE_EXPIRE_MS)) {
      return this.cacheCollectionInfo(collectionId);
    }

    return collections[collectionId].info;
  }

  public async getRevisionInfo(revisionId: string): Promise<IRevision> {
    const { store } = this.mApi;
    const {revisions} = store.getState().persistent.collections;
    if ((revisions[revisionId]?.timestamp === undefined)
        || ((Date.now() - revisions[revisionId].timestamp) > CACHE_EXPIRE_MS)) {
      return this.cacheRevisionInfo(revisionId);
    }

    const collectionInfo = await this.getCollectionInfo(revisions[revisionId].info.collection.id);

    return {
      ...revisions[revisionId].info,
      collection: {
        ...collectionInfo,
      },
    };
  }

  private async cacheCollectionInfo(collectionId: string): Promise<ICollection> {
    const { store } = this.mApi;
    const collectionInfo = (await this.mApi.emitAndAwait(
        'get-nexus-collection', parseInt(collectionId, 10)))[0];
    if (!!collectionInfo) {
      store.dispatch(updateCollectionInfo(collectionId, collectionInfo, Date.now()));
    }
    return Promise.resolve(collectionInfo);
  }

  private async cacheRevisionInfo(revisionId: string): Promise<IRevision> {
    const { store } = this.mApi;
    const revIdNum = parseInt(revisionId, 10);
    if (Number.isNaN(revIdNum)) {
      return Promise.reject(new Error('invalid revision id: ' + revisionId));
    }
    const revisionInfo = (await this.mApi.emitAndAwait(
        'get-nexus-collection-revision', revIdNum))[0];
    if (!!revisionInfo) {
      const now = Date.now();
      // we cache revision info and collection info separately to reduce duplication
      // in the application state
      store.dispatch(updateCollectionInfo(
        revisionInfo.collection.id, revisionInfo.collection, now));
      store.dispatch(updateRevisionInfo(revisionId, {
        ...revisionInfo,
        collection: { id: revisionInfo.collection.id },
      }, now));
    }
    return Promise.resolve(revisionInfo);
  }
}

export default InfoCache;
