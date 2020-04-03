import { setCollectionInfo, setRevisionInfo } from '../actions/persistent';

import { ICollectionDetailed, IRevisionDetailed } from 'nexus-api';
import { types } from 'vortex-api';

const CACHE_EXPIRE_MS = 24 * 60 * 60 * 1000;

class InfoCache {
  private mApi: types.IExtensionApi;

  constructor(api: types.IExtensionApi) {
    this.mApi = api;
  }

  public async getCollectionInfo(collectionId: string): Promise<ICollectionDetailed> {
    const { store } = this.mApi;
    const {collections} = store.getState().persistent;
    if ((collections[collectionId] === undefined)
        || ((Date.now() - collections[collectionId].timestamp) > CACHE_EXPIRE_MS)) {
      return this.cacheCollectionInfo(collectionId);
    }

    return collections[collectionId].info;
  }

  public async getRevisionInfo(collectionId: string,
                               revisionId: string)
                               : Promise<IRevisionDetailed> {
    const { store } = this.mApi;
    let {collections} = store.getState().persistent;

    if (collections[collectionId] === undefined) {
      await this.cacheCollectionInfo(collectionId);
      collections = store.getState().persistent;
    }

    const revisions = collections[collectionId]?.revisions || {};

    if ((revisions[revisionId]?.info.collection_revision_mods === undefined)
        || ((Date.now() - revisions[revisionId].timestamp) > CACHE_EXPIRE_MS)) {
       return this.cacheRevisionInfo(collectionId, revisionId);
    }

    return revisions[revisionId].info;
  }

  private async cacheCollectionInfo(collectionId: string): Promise<ICollectionDetailed> {
    const { store } = this.mApi;
    const collectionInfo = (await this.mApi.emitAndAwait('get-nexus-collection', collectionId))[0]
    store.dispatch(setCollectionInfo(collectionId, collectionInfo));
    return Promise.resolve(collectionInfo);
  }

  private async cacheRevisionInfo(collectionId: string,
                                  revisionId: string)
                                  : Promise<IRevisionDetailed> {
    const { store } = this.mApi;
    const revisions =
      await this.mApi.emitAndAwait('get-nexus-collection-revision', collectionId, revisionId);
    const revisionInfo = revisions[0];
    store.dispatch(setRevisionInfo(collectionId, revisionId, revisionInfo));
    return Promise.resolve(revisionInfo);
  }
}

export default InfoCache;
