import { ICollection, IDownloadURL, IRevision } from '@nexusmods/nexus-api';
import * as Bluebird from 'bluebird';
import { actions, types, util } from 'vortex-api';
import InstallDriver from './util/InstallDriver';

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

    const oldRules = api.getState().persistent.mods[gameId][oldModId].rules ?? [];

    const newModId = await util.toPromise(cb =>
      api.events.emit('start-install-download', dlId, undefined, cb));

    // remove old revision and mods installed for the old revision that are no longer required

    const mods = api.getState().persistent.mods[gameId];
    // candidates is any mod that is depended upon by the old revision that was installed
    // as a dependency
    const candidates = oldRules
      .filter(rule => ['requires', 'recommends'].includes(rule.type))
      .map(rule => util.findModByRef(rule.reference, mods))
      .filter(mod => (mod !== undefined)
                  && (mod.attributes?.['installedAsDependency'] === true));

    const notCandidates = Object.values(mods)
      .filter(mod => !candidates.includes(mod) && ![oldModId, newModId].includes(mod.id));

    const references = (rules: types.IModRule[], mod: types.IMod) =>
      (rules ?? []).find(rule => ['requires', 'recommends'].includes(rule.type)
        && util.testModReference(mod, rule.reference)) !== undefined;

    // for each dependency of the collection,
    const obsolete = candidates
      // see if there is a mod outside candidates that requires it but before anything we
      // check the new version of the collection because that's the most likely to require it
      .filter(mod => !references(mods[newModId].rules, mod))
      .filter(mod => notCandidates
        // that depends upon the candidate,
        .find(other => references(other.rules, mod)) === undefined);

    let ops = { remove: [], keep: [] };

    if (obsolete.length > 0) {
      const result = await api.showDialog('question', 'Remove obsolete mods?', {
        text: 'The following mods were installed as part of this collection but are '
          + 'no longer included in the new revision. If you don\'t remove them now '
          + 'they will henceforth be treated as manually installed mods.',
        checkboxes: obsolete.map(mod =>
          ({ id: mod.id, text: util.renderModName(mod), value: true })),
      }, [
        { label: 'Keep all' },
        { label: 'Remove selected' },
      ]);

      ops = Object.keys(result.input).reduce((prev, value) => {
        if (result.input[value]) {
          prev.remove.push(value);
        } else {
          prev.keep.push(value);
        }
        return prev;
      }, { remove: [], keep: [] });
    }

    // mark kept mods as manually installed, otherwise this will be queried again
    util.batchDispatch(api.store, ops.keep.map(modId =>
      actions.setModAttribute(gameId, modId, 'installedAsDependency', false)));

    await util.toPromise(cb => api.events.emit('remove-mods', gameId,
      [oldModId, ...ops.remove], cb, { incomplete: true, ignoreInstalling: true }));
  } catch (err) {
    if (!(err instanceof util.UserCanceled)) {
      api.showErrorNotification('Failed to download collection', err);
    }
  }
}

export function onCollectionUpdate(api: types.IExtensionApi,
                                   driver: InstallDriver): (...args: any[]) => void {
  return (gameId: string, collectionSlug: string,
          revisionNumber: number | string, source: string, oldModId: string) => {
    if ((source !== 'nexus') || (revisionNumber === undefined)) {
      return;
    }

    driver.prepare(() =>
      Bluebird.resolve(collectionUpdate(api, gameId, collectionSlug,
                                        revisionNumber.toString(), oldModId))
        .catch(err => {
          api.showErrorNotification('Failed to update collection', err);
        }));
  };
}
