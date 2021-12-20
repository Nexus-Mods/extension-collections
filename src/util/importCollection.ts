/// functions to postprocess collection manifest read from disk to give us an opportunity
/// to maintain backwards compatibility if things change on our end

import { fs } from 'vortex-api';
import { ICollection, ICollectionModRule } from '../types/ICollection';

function isFuzzyVersion(input: string): boolean {
  if (!input) {
    return false;
  }

  // simplified compared to the generic function in testModReference.ts because here
  // we only have to support the variants you'd actually find in a collection
  return input.endsWith('+prefer') || (input === '*');
}

/**
 * hook to fix up collection rules to maintain a bit of backwards compatibility for older
 * collections.
 * Should be cleared when we do a stable release
 */
function postProcessRule(rule: ICollectionModRule): ICollectionModRule {
  const result = JSON.parse(JSON.stringify(rule));
  // remove fileExpression from references with fuzzy version when there's already a
  // logicalFileName, because the fileExpressions we stored are simply the file name and that
  // won't match newer versions.
  // this is handled differently compared to md5 hash which we keep but ignore it testModReference
  // because with an md5 hash it's generally the case it will only match one version whereas
  // fileExpression supports matching multiple versions, it's simply that we have no automated
  // way of generating glob patterns that ignore the version and date field in the file names
  if (isFuzzyVersion(result.reference.versionMatch)
    && !!result.reference.logicalFileName) {
    delete result.reference.fileExpression;
  }
  if (isFuzzyVersion(result.source.versionMatch)
    && !!result.source.logicalFileName) {
    delete result.source.fileExpression;
  }
  return result;
}

export async function readCollection(manifest: string): Promise<ICollection> {
  const collectionData = await fs.readFileAsync(manifest
    , { encoding: 'utf-8' });
  const collection: ICollection = JSON.parse(collectionData);
  collection.modRules = (collection.modRules ?? []).map(rule => postProcessRule(rule));

  return collection;
}
