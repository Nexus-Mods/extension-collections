import * as React from 'react';
import { Icon, types } from 'vortex-api';

interface INewRevisionMarkerProps {
  t: types.TFunction;
  collection: types.IMod;
}

function NewRevisionMarker(props: INewRevisionMarkerProps) {
  const { t, collection } = props;

  if ((collection.attributes?.['newestVersion'] === undefined)
      || (parseInt(collection.attributes?.['newestVersion'], 10)
          <= parseInt(collection.attributes?.['version'], 10))) {
    return null;
  }

  return (
    <div className='collections-new-revision'>
      <Icon name='details'/>
      {t('Update')}
    </div>
  );
}

export default NewRevisionMarker;
