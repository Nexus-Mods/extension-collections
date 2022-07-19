import * as React from 'react';
import { Button, Media, Panel } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import { actions, log, Modal, tooltip, types, util } from 'vortex-api';
import { NAMESPACE } from '../../constants';

import YouCuratedTag from './YouCuratedThisTag';

import InstallDriver from '../../util/InstallDriver';
import CollectionThumbnail from '../CollectionPage/CollectionThumbnail';

export interface IInstallFinishedDialogProps {
  api: types.IExtensionApi;
  driver: InstallDriver;
  onClone: (collectionId: string) => Promise<string>;
  editCollection: (id: string) => void;
}

function nop() {
  // nop
}

const emptyObject = {};

function InstallFinishedDialog(props: IInstallFinishedDialogProps) {
  const { api, driver, onClone } = props;
  const { t } = useTranslation(api.NAMESPACE);

  const userInfo = useSelector<types.IState, { userId: number }>(state =>
    state.persistent['nexus']?.userInfo ?? emptyObject);

  const forceUpdate = React.useState(0)[1];

  React.useEffect(() => {
    if (driver !== undefined)  {
      driver.onUpdate(() => {
        forceUpdate(i => i + 1);
      });
    }
  }, [driver]);

  const skip = React.useCallback(() => {
    if (driver.collection !== undefined) {
      driver.continue();
    }
  }, [driver]);

  const showOptionals = React.useCallback(() => {
    if (driver.collection !== undefined) {
      api.events.emit('view-collection', driver.collection.id);
      api.store.dispatch(actions.setAttributeFilter('collection-mods', undefined, undefined));
      api.store.dispatch(actions.setAttributeFilter('collection-mods', 'required', false));
      driver.continue();
    }
  }, [driver]);

  const installAllOptionals = React.useCallback(() => {
    // double check we're not triggering this multiple times.
    if (driver.step === 'review') {
      driver.installRecommended();
    }
  }, []);

  const clone = React.useCallback(async () => {
    const id: string = await onClone(driver.collection.id);
    if (id !== undefined) {
      props.editCollection(id);
      driver.continue();
    }
  }, [driver, onClone]);

  const collection = driver.collection;

  const mods = useSelector<types.IState, { [modId: string]: types.IMod }>(state =>
    (driver.profile !== undefined)
      ? state.persistent.mods[driver.profile?.gameId]
      : {});

  const optionals = React.useMemo(() => {
    return (collection?.rules ?? [])
      .filter(rule => (rule.type === 'recommends')
                   && (util.findModByRef(rule.reference, mods) === undefined));
  }, [collection?.rules, mods]);

  const game = driver.profile !== undefined ? util.getGame(driver.profile.gameId) : undefined;

  const ownCollection: boolean = driver.collectionInfo?.user?.memberId === userInfo?.userId;

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
            {ownCollection && (optionals.length > 0) ? (
              <div>
                <YouCuratedTag t={t} />
                {t('To edit this collection you must install all of the optional mods')}
              </div>
            ) : null}
          </Media.Right>
        </div>
        {(optionals.length > 0) ? (
          <div className='collection-finished-optionals'>
            <div className='collection-finished-optionals-text'>
              {t('{{numOptionals}} optional mods available',
                { replace: { numOptionals: optionals.length }})}
            </div>
            <p>
              {t('This collection has {{count}} optional mods which are not required to '
                 + 'complete the installation but have been recommended by the curator. '
                 + 'To view these mods, click the button below.', {
                count: optionals.length,
                ns: NAMESPACE,
              })}
            </p>
            <div className='collection-finished-optional-buttons'>
              <Button onClick={showOptionals}>{t('Show optional mods')}</Button>
              <Button onClick={installAllOptionals}>{t('Install all optional mods')}</Button>
            </div>
          </div>
        ) : ownCollection ? (
          <div className='collection-can-clone-container'>
            <YouCuratedTag t={t} />
            {t('You now have the whole collection installed, you can start editing '
               + 'your collection by cloning it.')}
            <tooltip.IconButton
              icon='clone'
              tooltip={t('Clone the collection to the workshop for editing')}
              onClick={clone}
            >
              {t('Clone')}
            </tooltip.IconButton>
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

export default React.memo(InstallFinishedDialog);
