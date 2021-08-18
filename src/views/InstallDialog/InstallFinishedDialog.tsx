import * as React from 'react';
import { Button, Media, Panel } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import { actions, FlexLayout, Modal, selectors, types, util } from 'vortex-api';
import { NAMESPACE } from '../../constants';

import InstallDriver from '../../util/InstallDriver';
import CollectionThumbnail from '../CollectionPage/CollectionThumbnail';

export interface IInstallFinishedDialogProps {
  api: types.IExtensionApi;
  driver: InstallDriver;
}

function nop() {
  // nop
}

function InstallFinishedDialog(props: IInstallFinishedDialogProps) {
  const { api, driver } = props;
  const { t } = useTranslation(api.NAMESPACE);

  const forceUpdate = React.useState(0)[1];

  React.useEffect(() => {
    if (driver !== undefined)  {
      driver.onUpdate(() => {
        forceUpdate(i => i + 1);
      });
    }
  }, [driver]);

  const skip = React.useCallback(() => {
    driver.continue();
  }, [driver]);

  const showOptionals = React.useCallback(() => {
    api.events.emit('view-collection', driver.collection.id);
    api.store.dispatch(actions.setAttributeFilter('collection-mods', 'required', false));
    driver.continue();
  }, [driver]);

  const collection = driver.collection;

  const optionals = (collection?.rules ?? [])
    .filter(rule => rule.type === 'recommends');

  const game = driver.profile !== undefined ? util.getGame(driver.profile.gameId) : undefined;

  return (
    <Modal
      id='install-finished-dialog'
      show={(driver.collection !== undefined) && (driver.step === 'review')}
      onHide={nop}
    >
      <Modal.Header>
        <Modal.Title>{t('Collection installation complete')}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className='collection-finished-body'>
          <Media.Left>
            <CollectionThumbnail
              t={t}
              gameId={driver.profile?.gameId}
              collection={driver.collection}
              details={true}
              imageTime={42}
            />
          </Media.Left>
          <Media.Right>
            <h5>{game?.name}</h5>
            <h3>{util.renderModName(driver.collection)}</h3>
            {driver.collection?.attributes?.shortDescription ?? t('No description')}
          </Media.Right>
        </div>
        {(optionals.length > 0) ? (
          <div className='collection-finished-optionals'>
            <div className='collection-finished-optionals-text'>
              {t('{{numOptionals}} optional mods available',
                { replace: { numOptionals: optionals.length }})}
            </div>
            <p>
              {t('The curator has recommended {{count}} optional mod for this '
              + 'collection. Follow the button below to view this mod.', {
                count: optionals.length,
              })}
            </p>
            <Button onClick={showOptionals}>{t('Show optional mods')}</Button>
          </div>
        ) : null}
      </Modal.Body>
      <Modal.Footer>
        <Button onClick={skip}>
          {(optionals.length > 0) ? t('No Thanks') : t('Done')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

export default InstallFinishedDialog;
