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
    if ((collections[collectionId] === undefined)
        || ((Date.now() - collections[collectionId].timestamp) > CACHE_EXPIRE_MS)) {
      return this.cacheCollectionInfo(collectionId);
    }

    return collections[collectionId];
  }

  private async cacheCollectionInfo(collectionId: string): Promise<ICollection> {
    const { store } = this.mApi;
    const collectionInfo = (await this.mApi.emitAndAwait(
        'get-nexus-collection', parseInt(collectionId, 10)))[0];
    if (!!collectionInfo) {
      store.dispatch(updateCollectionInfo(collectionId, collectionInfo));
    }
    return Promise.resolve(collectionInfo);
  }

  public async getRevisionInfo(revisionId: string): Promise<IRevision> {
    const { store } = this.mApi;
    const {revisions} = store.getState().persistent.collections;
    if ((revisions[revisionId] === undefined)
        || ((Date.now() - revisions[revisionId].timestamp) > CACHE_EXPIRE_MS)) {
      return this.cacheRevisionInfo(revisionId);
    }

    return revisions[revisionId];
  }

  private async cacheRevisionInfo(revisionId: string): Promise<IRevision> {
    const { store } = this.mApi;
    const revisionInfo = (await this.mApi.emitAndAwait(
        'get-nexus-collection-revision', parseInt(revisionId, 10)))[0];
    if (!!revisionInfo) {
      store.dispatch(updateRevisionInfo(revisionId, revisionInfo));
    }
    return Promise.resolve(revisionInfo);
  }
}

export default InfoCache;
