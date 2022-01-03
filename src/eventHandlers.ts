import { ICollection, IDownloadURL, IRevision } from '@nexusmods/nexus-api';
import { types, util } from 'vortex-api';

async function collectionUpdate(api: types.IExtensionApi, gameId: string,
                                collectionSlug: string, revisionNumber: string,
                                oldModId: string) {
  try {
    const latest: IRevision =
      (await api.emitAndAwait('get-nexus-collection-revision',
                              collectionSlug, parseInt(revisionNumber, 10)))[0];
    if (latest === undefined) {
      throw new Error(`Invalid revision "${collectionSlug}:${revisionNumber}"`);
    }
    const collection: ICollection = latest.collection;
    if (collectionSlug !== collection.slug) {
      throw new Error(`Invalid collection "${collectionSlug}"`);
    }
    const modInfo = {
      game: gameId,
      source: 'nexus',
      name: collection?.name,
      nexus: {
        ids: {
          gameId,
          collectionId: collection.id,
          collectionSlug,
          revisionId: latest.id,
          revisionNumber: latest.revision,
        },
        revisionInfo: latest,
      },
    };
    const downloadURLs: IDownloadURL[] =
      (await api.emitAndAwait('resolve-collection-url', latest.downloadLink))[0];
    let dlId: string;
    try {
      const fileName = util.sanitizeFilename(collection.name);
      dlId = await util.toPromise(cb =>
        api.events.emit('start-download', downloadURLs.map(iter => iter.URI), modInfo,
          fileName + `-rev${latest.revision}.7z`, cb, 'never', { allowInstall: false }));
    } catch (err) {
      if (err.name === 'AlreadyDownloaded') {
        const { files } = api.getState().persistent.downloads;
        dlId = Object.keys(files).find(iter => files[iter].localPath === err.fileName);
      }
      if (dlId === undefined) {
        throw err;
      }
    }

    api.events.emit('analytics-track-click-event', 'Collections', 'Update Collection');

    await util.toPromise(cb =>
      api.events.emit('start-install-download', dlId, undefined, cb));

    // remove old revision

    await util.toPromise(cb => api.events.emit('remove-mod', gameId, oldModId, cb, {
      incomplete: true,
    }));
  } catch (err) {
    if (!(err instanceof util.UserCanceled)) {
      api.showErrorNotification('Failed to download collection', err);
    }
  }
}

export function onCollectionUpdate(api: types.IExtensionApi): (...args: any[]) => void {
  return (gameId: string, collectionSlug: string,
          revisionNumber: number | string, source: string, oldModId: string) => {
    if (source !== 'nexus') {
      return;
    }

    collectionUpdate(api, gameId, collectionSlug, revisionNumber.toString(), oldModId)
      .catch(err => {
        api.showErrorNotification('Failed to update collection', err);
      });
  };
}
