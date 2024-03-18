/* eslint-disable */
import * as PromiseBB from 'bluebird';
import { createHash } from 'crypto';
import { types, util } from 'vortex-api';
import { ICollectionModRuleEx } from '../types/ICollection';
import { IEntryEx } from '../types/IEntryEx';
import { IModEx } from '../types/IModEx';
import { fileMD5 } from 'vortexmt';
import turbowalk, { IEntry, IWalkOptions } from 'turbowalk';

export function makeProgressFunction(api: types.IExtensionApi) {
  const notificationId = api.sendNotification({
    type: 'activity',
    title: 'Building Collection',
    message: '',
    progress: 0,
  });

  let notiPerc = 0;
  let notiText = '';

  const items: Set<string> = new Set();

  const progress = (percent?: number, text?: string) => {
    let change = false;
    if ((percent !== undefined)) {
      if (percent > notiPerc) {
        change = true;
        notiPerc = percent;
      }
      if (text !== undefined) {
        items.delete(text);
        if (items.size > 0) {
          const itemList = Array.from(items);
          const newText = itemList[itemList.length - 1];
          if (newText !== notiText) {
            change = true;
            notiText = newText;
          }
        }
      }
    }
    if ((percent === undefined) && (text !== undefined) && (text !== notiText)) {
      change = true;
      notiText = text;
      if (percent === undefined) {
        items.add(text);
      }
    }

    if (change) {
      api.sendNotification({
        id: notificationId,
        type: 'activity',
        title: 'Building Collection',
        progress: notiPerc,
        message: notiText,
      });
    }
  };

  const progressEnd = () => {
    api.dismissNotification(notificationId);
  };

  return { progress, progressEnd };
}

export function bbProm<T>(func: (...args: any[]) => Promise<T>): (...args: any[]) => PromiseBB<T> {
  return (...args: any[]) => PromiseBB.resolve(func(...args));
}

export function getUnfulfilledNotificationId(collectionId: string) {
  return `collection-incomplete-${collectionId}`;
}

export function md5sum(input: string): string {
  const hash = createHash('md5');
  hash.update(input);
  return hash.digest('hex');
}

export function renderReference(ref: types.IModReference,
                                mods: { [modId: string]: types.IMod }): string {
  const mod = util.findModByRef(ref, mods);
  return util.renderModReference(ref, mod);
}

export function ruleId(rule: ICollectionModRuleEx): string {
  // md5-hashing to prevent excessive id names and special characters as a key
  // in application state
  return md5sum(`${rule.sourceName}-${rule.type}-${rule.referenceName}`);
}

export function modRuleId(input: types.IModRule): string {
  return input.type + '_' + (
    input.reference.fileMD5
    || input.reference.id
    || input.reference.logicalFileName
    || input.reference.fileExpression
    || input.reference.description
  );
}

export function isRelevant(mod: IModEx) {
  if (!!mod.state) {
    // consider any mod that's already being downloaded/installed
    return true;
  }
  if (mod.collectionRule['ignored']) {
    return false;
  }
  if (mod.collectionRule.type !== 'requires') {
    return false;
  }

  return true;
}

export type IModWithRule = types.IMod & { collectionRule: types.IModRule };

export function calculateCollectionSize(mods: { [id: string]: IModWithRule }): number {
  return Object.values(mods).reduce((prev: number, mod: IModEx) => {
    if (!isRelevant(mod)) {
      return prev;
    }
    const size = mod.attributes?.fileSize ?? mod.collectionRule.reference.fileSize ?? 0;
    return prev + size;
  }, 0);
}

export async function fileMD5Async(fileName: string): Promise<string> {
  return new Promise((resolve, reject) => {
    fileMD5(fileName,
            (err: Error, result: string) => (err !== null) ? reject(err) : resolve(result),
            () => null);
  });
}

export async function walkPath(dirPath: string, walkOptions?: IWalkOptions): Promise<IEntryEx[]> {
  walkOptions = walkOptions || { skipLinks: true, skipHidden: true, skipInaccessible: true };
  const walkResults: IEntryEx[] = [];
  return new Promise<IEntryEx[]>(async (resolve, reject) => {
    await turbowalk(dirPath, async (entries: IEntry[]) => {
      for (const entry of entries) {
        const md5 = await fileMD5Async(entry.filePath);
        const extendedEntry: IEntryEx = { ...entry, fileMD5: md5 };
        walkResults.push(extendedEntry);
      }
      return Promise.resolve();
    }, walkOptions).catch(err => err.code === 'ENOENT' ? Promise.resolve() : Promise.reject(err));
    return resolve(walkResults);
  });
}

export function isEmpty(value: any) {
  return (!value)
    || (value.hasOwnProperty('length') && value.length === 0)
    || (value.constructor === Object && Object.keys(value).length === 0);
}