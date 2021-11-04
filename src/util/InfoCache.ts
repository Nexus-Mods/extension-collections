import { updateCollectionInfo, updateRevisionInfo } from '../actions/persistent';

import { ICollectionModRule } from '../types/ICollection';

import { ICollection, IRevision } from '@nexusmods/nexus-api';
import * as path from 'path';
import { fs, log, selectors, types, util } from 'vortex-api';
import { MOD_TYPE } from '../constants';

// TODO: temporarily reducing expire time around switch to slugs identifying collections,
// used to be once per day
const CACHE_EXPIRE_MS = 1 * 60 * 60 * 1000;

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
  private mCacheColRules: { [revId: string]: Promise<ICollectionModRule[]> } = {};

  constructor(api: types.IExtensionApi) {
    this.mApi = api;
  }

  public async getCollectionModRules(revisionId: string) {
    if (this.mCacheColRules[revisionId] === undefined) {
      this.mCacheColRules[revisionId] = this.cacheCollectionModRules(revisionId);
    }

    return this.mCacheColRules[revisionId];
  }

  public async getCollectionInfo(id: string,
                                 slug: string,
                                 forceFetch?: boolean)
                                 : Promise<ICollection> {
    const { store } = this.mApi;
    if (slug === undefined) {
      return;
    }
    const collections = store.getState().persistent.collections.collections ?? {};
    if (forceFetch
        || (collections[slug]?.timestamp === undefined)
        || ((Date.now() - collections[slug].timestamp) > CACHE_EXPIRE_MS)) {

      if (this.mCacheColRequests[slug] === undefined) {
        this.mCacheColRequests[slug] = this.cacheCollectionInfo(id, slug);
      }
      return this.mCacheColRequests[slug];
    }

    return collections[slug].info;
  }

  public async getRevisionInfo(revisionId: string,
                               collectionSlug: string, revisionNumber: number,
                               forceFetch?: boolean)
                               : Promise<IRevision> {
    const { store } = this.mApi;
    const revisions = store.getState().persistent.collections.revisions ?? {};
    if (forceFetch
        || (revisions[revisionId]?.timestamp === undefined)
        || ((Date.now() - revisions[revisionId].timestamp) > CACHE_EXPIRE_MS)) {
      log('info', 'revision info cache outdated', {
        timestamp: revisions[revisionId]?.timestamp,
        now: Date.now(),
      });

      if (this.mCacheRevRequests[revisionId] === undefined) {
        this.mCacheRevRequests[revisionId] =
          this.cacheRevisionInfo(revisionId, collectionSlug, revisionNumber);
      }
      return this.mCacheRevRequests[revisionId];
    }

    if (revisions[revisionId].info === null) {
      return Promise.resolve(undefined);
    }

    const collectionInfo = await this.getCollectionInfo(
      revisions[revisionId].info.collection.id,
      revisions[revisionId].info.collection.slug);

    return {
      ...revisions[revisionId].info,
      collection: {
        ...collectionInfo,
      },
    };
  }

  private async cacheCollectionModRules(revisionId: string): Promise<ICollectionModRule[]> {
    const store = this.mApi.store;
    const state = store.getState();
    const gameId = selectors.activeGameId(state);
    const mods: { [modId: string]: types.IMod } =
      util.getSafe(state, ['persistent', 'mods', gameId], {});
    const colMod = Object.values(mods).find(iter =>
      (iter.type === MOD_TYPE) && (iter.attributes?.revisionId === revisionId));
    if (colMod === undefined) {
      return [];
    }
    const stagingPath = selectors.installPathForGame(state, selectors.activeGameId(state));
    try {
      const collectionData = await fs.readFileAsync(
        path.join(stagingPath, colMod.installationPath, 'collection.json'), { encoding: 'utf-8' });
      const collection: any = JSON.parse(collectionData);
      return collection.modRules ?? [];
    } catch (err) {
      this.mApi.showErrorNotification('Failed to cache collection mod rules', err);
      return [];
    }
  }

  private async cacheCollectionInfo(collectionId: string,
                                    collectionSlug: string): Promise<ICollection> {
    const { store } = this.mApi;
    let collectionIdNum = parseInt(collectionId, 10);
    if (isNaN(collectionIdNum)) {
      collectionIdNum = undefined;
    }
    const collectionInfo = (await this.mApi.emitAndAwait(
        'get-nexus-collection', collectionIdNum, collectionSlug))[0];
    if (!!collectionInfo) {
      store.dispatch(updateCollectionInfo(collectionId, collectionInfo, Date.now()));
    }
    return Promise.resolve(collectionInfo)
      .then((result: ICollection) => {
        delete this.mCacheColRequests[collectionId];
        return result;
      });
  }

  private async cacheRevisionInfo(revisionId: string,
                                  collectionSlug: string, revisionNumber: number)
                                  : Promise<IRevision> {
    const { store } = this.mApi;
    const revIdNum = parseInt(revisionId, 10);
    if (Number.isNaN(revIdNum)) {
      return Promise.reject(new Error('invalid revision id: ' + revisionId));
    }
    const revisionInfo = collectionSlug !== undefined
      ? (await this.mApi.emitAndAwait('get-nexus-collection-revision',
                                      collectionSlug, revisionNumber))[0]
      : (await this.mApi.emitAndAwait('get-nexus-revision', revIdNum))[0];
    const now = Date.now();

    if (!!revisionInfo) {
      // we cache revision info and collection info separately to reduce duplication
      // in the application state
      store.dispatch(updateCollectionInfo(
        revisionInfo.collection.id, revisionInfo.collection, now));
      store.dispatch(updateRevisionInfo(revisionId, {
        ...revisionInfo,
        collection: {
          id: revisionInfo.collection.id,
          slug: revisionInfo.collection.slug,
        },
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
