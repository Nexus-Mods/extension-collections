import { IModPack, IModPackMod } from './types/IModPack';
import { modToPack } from './util/modpack';
import { makeProgressFunction } from './util/util';

import * as PromiseBB from 'bluebird';
import * as _ from 'lodash';
import Zip = require('node-7z');
import * as path from 'path';
import { dir as tmpDir } from 'tmp';
import { fs, log, selectors, types, util } from 'vortex-api';

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
              log('warn', 'Failed to clean up temp file', { path });
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

async function generateModPackInfo(state: types.IState, gameId: string, collection: types.IMod,
                                   progress: (percent: number, text: string) => void,
                                   error: (message: string, replace: any) => void)
                                   : Promise<IModPack> {
  const mods = state.persistent.mods[gameId];
  const stagingPath = selectors.installPath(state);
  return modToPack(state, gameId, stagingPath, collection, mods, progress, error);
}

async function writePackToFile(state: types.IState, info: IModPack,
                               mod: types.IMod, outputPath: string) {
  await fs.ensureDirWritableAsync(outputPath, () => PromiseBB.resolve());

  await fs.writeFileAsync(
    path.join(outputPath, 'modpack.json'), JSON.stringify(info, undefined, 2));

  const stagingPath = selectors.installPath(state);
  const modPath = path.join(stagingPath, mod.installationPath);

  try {
    await fs.copyAsync(path.join(modPath, 'icon.png'), path.join(outputPath, 'icon.png'));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    } // don't strictly need an icon I guess
  }
  try {
    await fs.copyAsync(path.join(modPath, 'INI Tweaks'), path.join(outputPath, 'INI Tweaks'));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    } // else: no ini tweak, no problem
  }
  const zipPath = path.join(modPath,
                            `modpack_${util.getSafe(mod.attributes, ['version'], '1.0.0')}.7z`);
  await zip(zipPath, outputPath);
  await fs.removeAsync(outputPath);
  return zipPath;
}

function toProm<ResT>(func: (cb) => void): Promise<ResT> {
  return new Promise((resolve, reject) => {
    const cb = (err, res) => {
      if (err !== null) {
        return reject(err);
      } else {
        return resolve(res);
      }
    };
    func(cb);
  });
}

function filterInfoMod(mod: IModPackMod): IModPackMod {
  return _.omit(mod, ['hashes', 'choices']);
}

function filterInfo(input: IModPack): any {
  return {
    info: input.info,
    mods: input.mods.map(mod => filterInfoMod(mod)),
  };
}

export async function doExportToAPI(api: types.IExtensionApi, gameId: string, modId: string) {
  const state: types.IState = api.store.getState();
  const mod = state.persistent.mods[gameId][modId];

  const { progress, progressEnd } = makeProgressFunction(api);

  const errors: Array<{ message: string, replace: any }> = [];

  const onError = (message: string, replace: any) => {
    errors.push({ message, replace });
  };

  const info = await generateModPackInfo(state, gameId, mod, progress, onError);
  await withTmpDir(async tmpPath => {
    const filePath = await writePackToFile(state, info, mod, tmpPath);
    await toProm(cb => api.events.emit('submit-collection', filterInfo(info), filePath, cb));
  });
  progressEnd();
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
    const info = await generateModPackInfo(state, gameId, mod, progress, onError);
    const zipPath = await writePackToFile(state, info, mod, outputPath);
    const dialogActions = [
      {
        title: 'Open', action: () => {
          util.opn(path.join(stagingPath, mod.installationPath)).catch(() => null);
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
    return Promise.resolve();
  }
  progressEnd();
}
