import * as React from 'react';
import { Icon, types } from 'vortex-api';

interface INewRevisionMarkerProps {
  t: types.TFunction;
  collection: types.IMod;
}

function NewRevisionMarker(props: INewRevisionMarkerProps) {
  const { t, collection } = props;

  if ((collection.attributes['newestVersion'] === undefined)
      || (collection.attributes['newestVersion'] === collection.attributes['version'])) {
    return null;
  }

  return (
    <div className='collections-new-revision'>
      <Icon name='details'/>
      {t('New Revision')}
    </div>
  );
}

export default NewRevisionMarker;
