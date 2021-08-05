import { updateCollectionInfo, updateRevisionInfo } from '../actions/persistent';

import { ICollection, IRevision } from '@nexusmods/nexus-api';
import { log, types } from 'vortex-api';

const CACHE_EXPIRE_MS = 24 * 60 * 60 * 1000;

/**
 * manages caching of collection and revision info
 * NOTE: this doesn't have any state of its own, the actual cache is stored in application state
 * As such, this doesn't need to be a class, a bunch of functions would have done. If this
 * behavior were to change, the way InfoCache gets used would become invalid!
 */
class InfoCache {
  private mApi: types.IExtensionApi;
  private mCacheRevRequests: { [revId: string]: Promise<IRevision> } = {};
  private mCacheColRequests: { [revId: string]: Promise<ICollection> } = {};

  constructor(api: types.IExtensionApi) {
    this.mApi = api;
  }

  public async getCollectionInfo(collectionId: string): Promise<ICollection> {
    const { store } = this.mApi;
    const {collections} = store.getState().persistent.collections;
    if ((collections[collectionId]?.timestamp === undefined)
        || ((Date.now() - collections[collectionId].timestamp) > CACHE_EXPIRE_MS)) {

      if (this.mCacheColRequests[collectionId] === undefined) {
        this.mCacheColRequests[collectionId] = this.cacheCollectionInfo(collectionId);
      }
      return this.mCacheColRequests[collectionId];
    }

    return collections[collectionId].info;
  }

  public async getRevisionInfo(revisionId: string): Promise<IRevision> {
    const { store } = this.mApi;
    const {revisions} = store.getState().persistent.collections;
    if ((revisions[revisionId]?.timestamp === undefined)
        || ((Date.now() - revisions[revisionId].timestamp) > CACHE_EXPIRE_MS)) {
      log('info', 'revision info cache outdated', {
        timestamp: revisions[revisionId]?.timestamp,
        now: Date.now(),
      });

      if (this.mCacheRevRequests[revisionId] === undefined) {
        this.mCacheRevRequests[revisionId] = this.cacheRevisionInfo(revisionId);
      }
      return this.mCacheRevRequests[revisionId];
    }

    if (revisions[revisionId].info === null) {
      return Promise.resolve(undefined);
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
    return Promise.resolve(collectionInfo)
      .then((result: ICollection) => {
        delete this.mCacheColRequests[collectionId];
        return result;
      });
  }

  private async cacheRevisionInfo(revisionId: string): Promise<IRevision> {
    const { store } = this.mApi;
    const revIdNum = parseInt(revisionId, 10);
    if (Number.isNaN(revIdNum)) {
      return Promise.reject(new Error('invalid revision id: ' + revisionId));
    }
    const revisionInfo = (await this.mApi.emitAndAwait(
        'get-nexus-collection-revision', revIdNum))[0];
    const now = Date.now();

    if (!!revisionInfo) {
      // we cache revision info and collection info separately to reduce duplication
      // in the application state
      store.dispatch(updateCollectionInfo(
        revisionInfo.collection.id, revisionInfo.collection, now));
      store.dispatch(updateRevisionInfo(revisionId, {
        ...revisionInfo,
        collection: { id: revisionInfo.collection.id },
      }, now));
    } else {
      store.dispatch(updateRevisionInfo(revisionId, null, now));
    }
    return Promise.resolve(revisionInfo)
      .then((result: IRevision) => {
        delete this.mCacheRevRequests[revisionId];
        return result ?? null;
      });
  }
}

export default InfoCache;
