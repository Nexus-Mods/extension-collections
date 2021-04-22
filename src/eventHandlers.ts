import { ICollection, IDownloadURL, IRevision } from '@nexusmods/nexus-api';
import * as path from 'path';
import { types, util } from 'vortex-api';

async function collectionUpdate(api: types.IExtensionApi, gameId: string, collectionId: string) {
  try {
    const collection: ICollection =
      (await api.emitAndAwait('get-nexus-collection', parseInt(collectionId, 10)))[0];
    if (collection === undefined) {
      throw new Error(`Invalid collection id "${collectionId}"`);
    }
    const latest: IRevision = collection.currentRevision;

    const modInfo = {
      game: gameId,
      source: 'nexus',
      name: collection?.name,
      nexus: {
        ids: { gameId, collectionId, revisionId: latest.id, revisionNumber: latest.revision },
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
          fileName + `-rev${latest.revision}.7z`, cb, 'never', false));
    } catch (err) {
      if (err.name === 'AlreadyDownloaded') {
        const { files } = api.getState().persistent.downloads;
        dlId = Object.keys(files).find(iter => files[iter].localPath === err.fileName);
      }
      if (dlId === undefined) {
        throw err;
      }
    }
    await util.toPromise(cb =>
      api.events.emit('start-install-download', dlId, undefined, cb));
  } catch (err) {
    if (!(err instanceof util.UserCanceled)) {
      api.showErrorNotification('Failed to download collection', err);
    }
  }
}

export function onCollectionUpdate(api: types.IExtensionApi): (...args: any[]) => void {
  return (gameId: string, collectionId, revisionNumber, source: string) => {
    if (source !== 'nexus') {
      return;
    }

    collectionUpdate(api, gameId, collectionId.toString())
      .catch(err => {
        api.showErrorNotification('Failed to update collection', err);
      });
  };
}
