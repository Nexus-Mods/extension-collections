import * as React from 'react';
import { types, util } from 'vortex-api';
import i18next from 'i18next';

export interface ICollectionReleaseStatusProps {
  t: i18next.TFunction;
  collection: types.IMod;
  active: boolean;
  incomplete: boolean;
}

function CollectionReleaseStatus(props: ICollectionReleaseStatusProps) {
  const { t, active, collection, incomplete } = props;
  if (active) {
    if (incomplete) {
      return <div className='collection-status'>{t('Incomplete')}</div>;
    } else if ((util.getSafe(collection.attributes, ['collectionId'], undefined) !== undefined)
      && util.getSafe(collection.attributes, ['editable'], false)) {
      return <div className='collection-status'>{t('Published')}</div>;
    } else {
      return <div className='collection-status'>{t('Enabled')}</div>;
    }
  } else {
    return null;
  }
}

export default CollectionReleaseStatus;
