import { updateCollectionInfo } from '../actions/persistent';

import { ICollection } from 'nexus-api';
import { types } from 'vortex-api';

const CACHE_EXPIRE_MS = 24 * 60 * 60 * 1000;

class InfoCache {
  private mApi: types.IExtensionApi;

  constructor(api: types.IExtensionApi) {
    this.mApi = api;
  }

  public async getRevisionInfo(collectionId: string,
                               revisionNumber: number): Promise<ICollection> {
    const { store } = this.mApi;
    const {collections} = store.getState().persistent;
    if ((collections[collectionId] === undefined)
        || ((Date.now() - collections[collectionId].timestamp) > CACHE_EXPIRE_MS)) {
      return this.cacheRevisionInfo(collectionId, revisionNumber);
    }

    return collections[collectionId].info;
  }

  private async cacheRevisionInfo(collectionId: string,
                                  revisionNumber: number): Promise<ICollection> {
    const { store } = this.mApi;
    const collectionInfo =
      (await this.mApi.emitAndAwait('get-nexus-collection', collectionId, revisionNumber))[0];
    store.dispatch(updateCollectionInfo(collectionId, collectionInfo));
    return Promise.resolve(collectionInfo);
  }
}

export default InfoCache;
