import * as _ from 'lodash';
import * as Redux from 'redux';
import * as semver from 'semver';
import { actions, types, util } from 'vortex-api';

export function findModByRef(reference: types.IModReference,
                             mods: { [modId: string]: types.IMod }): types.IMod {
  if ((reference['idHint'] !== undefined)
      && (util.testModReference(mods[reference['idHint']], reference))) {
    // fast-path if we have an id from a previous match
    return mods[reference['idHint']];
  }

  const res = Object.values(mods).find((mod: types.IMod): boolean =>
    util.testModReference(mod, reference));

  return res;
}

export function isFuzzyVersion(versionMatch: string) {
  if (!versionMatch) {
    return false;
  }
  return isNaN(parseInt(versionMatch[0], 16))
    || (semver.validRange(versionMatch)
      !== versionMatch);
}

function newerSort(lhs: types.IDownload, rhs: types.IDownload): number {
  const lVersion = semver.coerce(util.getSafe(lhs, ['modInfo', 'version'], undefined));
  const rVersion = semver.coerce(util.getSafe(rhs, ['modInfo', 'version'], undefined));

  if ((lVersion !== null) && (rVersion !== null)) {
    return semver.compare(rVersion, lVersion);
  }

  return rhs.fileTime - lhs.fileTime;
}

export function testDownloadReference(download: types.IDownload,
                                      reference: types.IReference)
                                      : boolean {
  if (download === undefined) {
    return false;
  }

  const modId = download.modInfo?.meta?.details?.modId
              ?? download.modInfo?.nexus?.ids?.modId;

  const fileId = download.modInfo?.meta?.details?.fileId
              ?? download.modInfo?.nexus?.ids?.fileId;

  const lookup = {
    fileMD5: download.fileMD5,
    fileName: download.localPath,
    fileSizeBytes: download.size,
    version: download.modInfo?.version,
    logicalFileName: download.modInfo?.name,
    game: download.game,
    source: download.modInfo?.source,
    modId,
    fileId,
  };

  return util.testModReference(lookup, reference);
}

export function findDownloadIdByRef(reference: types.IReference,
                                    downloads: { [dlId: string]: types.IDownload })
                                    : string {
  if (isFuzzyVersion(reference.versionMatch)
    && (reference.fileMD5 !== undefined)
    && ((reference.logicalFileName !== undefined)
      || (reference.fileExpression !== undefined))) {
    reference = _.omit(reference, ['fileMD5']);
  }

  const existing: string[] = Object.keys(downloads)
    .filter((dlId: string): boolean => testDownloadReference(downloads[dlId], reference))
    .sort((lhs, rhs) => newerSort(downloads[lhs], downloads[rhs]));
  return existing[0];
}
