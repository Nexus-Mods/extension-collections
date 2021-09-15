import { BUNDLED_PATH } from './constants';
import { ICollection, ICollectionMod, ICollectionSourceInfo } from './types/ICollection';
import { modToCollection as modToCollection } from './util/transformCollection';
import { makeProgressFunction } from './util/util';

import { ICreateCollectionResult } from '@nexusmods/nexus-api';
import * as PromiseBB from 'bluebird';
import * as _ from 'lodash';
import Zip = require('node-7z');
import * as path from 'path';
import { dir as tmpDir } from 'tmp';
import { actions, fs, log, selectors, types, util } from 'vortex-api';

async function withTmpDir(cb: (tmpPath: string) => Promise<void>): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tmpDir((err, tmpPath, cleanup) => {
      if (err !== null) {
        return reject(err);
      } else {
        cb(tmpPath)
          .then(() => {
            resolve();
          })
          .catch(tmpErr => {
            reject(tmpErr);
          })
          .finally(() => {
            try {
              cleanup();
            } catch (err) {
              // cleanup failed
              log('warn', 'Failed to clean up temp file', { path, err });
            }
          });
      }
    });
  });
}

async function zip(zipPath: string, sourcePath: string): Promise<void> {
  const zipper = new Zip();
  const files = await fs.readdirAsync(sourcePath);
  await zipper.add(zipPath, files.map(fileName => path.join(sourcePath, fileName)));
}

async function generateCollectionInfo(state: types.IState, gameId: string, collection: types.IMod,
                                      progress: (percent: number, text: string) => void,
                                      error: (message: string, replace: any) => void)
                                      : Promise<ICollection> {
  const mods = state.persistent.mods[gameId];
  const stagingPath = selectors.installPath(state);
  return modToCollection(state, gameId, stagingPath, collection, mods, progress, error);
}

async function writeCollectionToFile(state: types.IState, info: ICollection,
                                     mod: types.IMod, outputPath: string) {
  await fs.ensureDirWritableAsync(outputPath, () => PromiseBB.resolve());

  await fs.writeFileAsync(
    path.join(outputPath, 'collection.json'), JSON.stringify(info, undefined, 2));

  const stagingPath = selectors.installPath(state);
  const modPath = path.join(stagingPath, mod.installationPath);

  try {
    await fs.copyAsync(path.join(modPath, 'INI Tweaks'),
                       path.join(outputPath, 'INI Tweaks'));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    } // else: no ini tweak, no problem
  }

  await fs.copyAsync(path.join(modPath, BUNDLED_PATH), path.join(outputPath, BUNDLED_PATH));

  const zipPath = path.join(modPath, 'export',
                            `collection_${mod.attributes?.version ?? '0'}.7z`);
  try {
    await fs.removeAsync(zipPath);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }
  await zip(zipPath, outputPath);
  await fs.removeAsync(outputPath);
  return zipPath;
}

function filterInfoModSource(source: ICollectionSourceInfo): ICollectionSourceInfo {
  return _.omit(source, ['instructions']);
}

function filterInfoMod(mod: ICollectionMod): ICollectionMod {
  const res = _.omit(mod, ['hashes', 'choices', 'details', 'instructions']);
  res.source = filterInfoModSource(res.source);
  return res;
}

function filterInfo(input: ICollection): Partial<ICollection> {
  const info = input.info;
  return {
    info,
    mods: input.mods.map(mod => filterInfoMod(mod)),
  };
}

async function queryErrorsContinue(api: types.IExtensionApi,
                                   errors: Array<{message: string, replace: any}>) {
  const res = await api.showDialog('error', 'Errors creating collection', {
    text: 'There were errors creating the collection, do you want to proceed anyway?',
    message: errors.map(err => api.translate(err.message, { replace: err.replace })).join('\n'),
  }, [
    { label: 'Cancel' },
    { label: 'Continue' },
  ]);

  if (res.action === 'Cancel') {
    throw new util.UserCanceled();
  }
}

export async function doExportToAPI(api: types.IExtensionApi,
                                    gameId: string,
                                    modId: string,
                                    uploaderName: string)
                                    : Promise<number> {
  const state: types.IState = api.store.getState();
  const mod = state.persistent.mods[gameId][modId];

  const { progress, progressEnd } = makeProgressFunction(api);

  const errors: Array<{ message: string, replace: any }> = [];

  const onError = (message: string, replace: any) => {
    errors.push({ message, replace });
  };

  let info: ICollection;

  let collectionId: number;

  try {
    info = await generateCollectionInfo(state, gameId, mod, progress, onError);
    if (errors.length > 0) {
      await queryErrorsContinue(api, errors);
    }
    await withTmpDir(async tmpPath => {
      const filePath = await writeCollectionToFile(state, info, mod, tmpPath);
      collectionId = mod.attributes?.collectionId ?? undefined;
      if ((collectionId !== undefined)
          && (mod.attributes?.author !== uploaderName)) {
        log('info', 'user doesn\'t match original author, creating new collection');
        collectionId = undefined;
      }
      const result: ICreateCollectionResult = await util.toPromise(cb =>
        api.events.emit('submit-collection', filterInfo(info), filePath,
                        collectionId, cb));
      collectionId = result.collectionId;
      api.store.dispatch(actions.setModAttribute(gameId, modId, 'collectionId', collectionId));
      api.store.dispatch(actions.setModAttribute(gameId, modId, 'revisionId', result.revisionId));
      api.store.dispatch(actions.setModAttribute(gameId, modId, 'source', 'nexus'));
      api.store.dispatch(actions.setModAttribute(gameId, modId, 'version',
        ((result['revisionNumber'] ?? 0) + 1).toString()));
    });
    progressEnd();
  } catch (err) {
    progressEnd();
    if (err.name === 'ModFileNotFound') {
      const file = info.mods.find(iter => iter.source.fileId === err.fileId);
      api.sendNotification({
        type: 'error',
        title: 'The server can\'t find one of the files in the collection, '
             + 'are mod id and file id for it set correctly?',
        message: file !== undefined ? file.name : `id: ${err.fileId}`,
      });
      throw new util.ProcessCanceled('Mod file not found');
    } else if (err.constructor.name === 'ParameterInvalid') {
      api.sendNotification({
        type: 'error',
        title: 'The server rejected this collection',
        message: err.message || '<No reason given>',
      });
      throw new util.ProcessCanceled('collection rejected');
    } else {
      throw err;
    }
  }

  return collectionId;
}

export async function doExportToFile(api: types.IExtensionApi, gameId: string, modId: string) {
  const state: types.IState = api.store.getState();
  const mod = state.persistent.mods[gameId][modId];

  const { progress, progressEnd } = makeProgressFunction(api);

  const errors: Array<{ message: string, replace: any }> = [];

  const onError = (message: string, replace: any) => {
    errors.push({ message, replace });
  };

  try {
    const stagingPath = selectors.installPathForGame(state, gameId);
    const modPath = path.join(stagingPath, mod.installationPath);
    const outputPath = path.join(modPath, 'build');
    const info = await generateCollectionInfo(state, gameId, mod, progress, onError);
    const zipPath = await writeCollectionToFile(state, info, mod, outputPath);
    const dialogActions = [
      {
        title: 'Open', action: () => {
          util.opn(path.join(stagingPath, mod.installationPath, 'export')).catch(() => null);
        },
      },
    ];

    if (errors.length > 0) {
      const li = (input: string) => `[*]${input}`;
      dialogActions.unshift({
        title: 'Errors',
        action: () => {
          api.showDialog('error', 'Collection Export Errors', {
            bbcode: '[list]'
              + errors.map(err => li(api.translate(err.message, { replace: err.replace })))
              + '[/list]',
          }, [
            { label: 'Close' },
          ]);
        },
      });
    }

    api.sendNotification({
      id: 'collection-exported',
      title: errors.length > 0 ? 'Collection exported, there were errors' : 'Collection exported',
      message: zipPath,
      type: errors.length > 0 ? 'warning' : 'success',
      actions: dialogActions,
    });
  } catch (err) {
    api.showErrorNotification('Failed to export collection', err);
  }
  progressEnd();
}
