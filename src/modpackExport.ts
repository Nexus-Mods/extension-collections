import { modToPack } from './util/modpack';
import { makeProgressFunction } from './util/util';

import * as PromiseBB from 'bluebird';
import Zip = require('node-7z');
import * as path from 'path';
import { fs, selectors, types, util } from 'vortex-api';

async function zip(zipPath: string, sourcePath: string): Promise<void> {
  const zipper = new Zip();
  const files = await fs.readdirAsync(sourcePath);
  await zipper.add(zipPath, files.map(fileName => path.join(sourcePath, fileName)));
}

async function generateModPack(state: types.IState, modId: string,
                               progress: (percent: number, text: string) => void,
                               error: (message: string, replace: any) => void): Promise<string> {
  const gameMode = selectors.activeGameId(state);
  const mods = state.persistent.mods[gameMode];
  const mod: types.IMod = mods[modId];
  const stagingPath = selectors.installPath(state);
  const modPath = path.join(stagingPath, mod.installationPath);
  const outputPath = path.join(modPath, 'build');
  await fs.ensureDirWritableAsync(outputPath, () => PromiseBB.resolve());
  await fs.writeFileAsync(path.join(outputPath, 'modpack.json'), JSON.stringify(
    await modToPack(state, gameMode, stagingPath, mod, mods, progress, error), undefined, 2));
  try {
    await fs.copyAsync(path.join(modPath, 'INI Tweaks'), path.join(outputPath, 'INI Tweaks'));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw  err;
    } // else: no ini tweak, no problem
  }
  const zipPath = path.join(modPath,
                            `modpack_${util.getSafe(mod.attributes, ['version'], '1.0.0')}.7z`);
  await zip(zipPath, outputPath);
  await fs.removeAsync(outputPath);
  return zipPath;
}

function doExport(api: types.IExtensionApi, modId: string) {
  const state: types.IState = api.store.getState();

  const { progress, progressEnd } = makeProgressFunction(api);

  const errors: Array<{ message: string, replace: any }> = [];

  const onError = (message: string, replace: any) => {
    errors.push({ message, replace });
  };

  return generateModPack(state, modId, progress, onError)
    .then((zipPath: string) => {
      const dialogActions = [
        {
          title: 'Open', action: () => {
            const stagingPath = selectors.installPath(state);
            const gameMode = selectors.activeGameId(state);
            const mods = state.persistent.mods[gameMode];
            const mod: types.IMod = mods[modId];
            util.opn(path.join(stagingPath, mod.installationPath)).catch(() => null);
          },
        },
      ];

      if (errors.length > 0) {
        const li = (input: string) => `[*]${input}`;
        dialogActions.unshift({
          title: 'Errors',
          action: () => {
            api.showDialog('error', 'Modpack Export Errors', {
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
        id: 'modpack-exported',
        title: errors.length > 0 ? 'Modpack exported, there were errors' : 'Modpack exported',
        message: zipPath,
        type: errors.length > 0 ? 'warning' : 'success',
        actions: dialogActions,
      });
    })
    .catch(err => {
      api.showErrorNotification('Failed to export modpack', err);
      return Promise.resolve();
    })
    .finally(() => {
      progressEnd();
    });
}

export default doExport;
