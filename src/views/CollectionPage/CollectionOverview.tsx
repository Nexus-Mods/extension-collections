import CollectionThumbnail from './CollectionThumbnail';

import i18next from 'i18next';
import * as React from 'react';
import { Image, ListGroup, Media, Panel } from 'react-bootstrap';
import { ComponentEx, FlexLayout, tooltip, types, util } from 'vortex-api';
import { AUTHOR_UNKNOWN } from '../../constants';

interface ICollectionOverviewProps {
  t: i18next.TFunction;
  gameId: string;
  collection: types.IMod;
  totalSize: number;
  onClose: () => void;
}

class CollectionOverview extends ComponentEx<ICollectionOverviewProps, {}> {
  public render(): JSX.Element {
    const { t, collection, gameId, totalSize, onClose } = this.props;

    const depRules = (collection.rules || [])
      .filter(rule => ['requires', 'recommends'].includes(rule.type));

    return (
      <Panel className='collection-overview'>
        <Media>
          <Media.Left>
            <CollectionThumbnail t={t} imageTime={Date.now()} collection={collection} gameId={gameId} details={false} />
          </Media.Left>
          <Media.Body>
            <FlexLayout type='column'>
              <FlexLayout.Fixed>
                <div className='collection-title'>
                  {util.renderModName(collection)}
                </div>
              </FlexLayout.Fixed>
              <FlexLayout.Fixed>
                <FlexLayout type='row'>
                  <FlexLayout.Fixed className='collection-detail-cell'>
                    <FlexLayout type='row'>
                      <Image
                        src='assets/images/noavatar.png'
                        circle
                      />
                      <div>
                        <div className='title'>{t('Curated by')}</div>
                        <div>{collection.attributes.author || AUTHOR_UNKNOWN}</div>
                      </div>
                    </FlexLayout>
                  </FlexLayout.Fixed>
                  <FlexLayout.Fixed className='collection-detail-cell'>
                    <div className='title'>{t('Uploaded')}</div>
                    <div>{collection.attributes.uploadedTimestamp || t('Never')}</div>
                  </FlexLayout.Fixed>
                  <FlexLayout.Fixed className='collection-detail-cell'>
                    <div className='title'>{t('Last updated')}</div>
                    <div>{collection.attributes.lastUpdateTime || t('Never')}</div>
                  </FlexLayout.Fixed>
                  <FlexLayout.Fixed className='collection-detail-cell'>
                    <div className='title'>{t('Version')}</div>
                    <div>{collection.attributes.version || '0.0.0'}</div>
                  </FlexLayout.Fixed>
                  <FlexLayout.Fixed className='collection-detail-cell'>
                    <div className='title'>{t('Mods')}</div>
                    <div>{depRules.length}</div>
                  </FlexLayout.Fixed>
                  <FlexLayout.Fixed className='collection-detail-cell'>
                    <div className='title'>{t('File size')}</div>
                    <div>{util.bytesToString(totalSize)}</div>
                  </FlexLayout.Fixed>
                </FlexLayout>
              </FlexLayout.Fixed>
              <FlexLayout.Flex>
                <div className='collection-description'>
                  {util.getSafe(collection.attributes, ['description'], t('No description'))}
                </div>
              </FlexLayout.Flex>
              <FlexLayout.Fixed>
                <tooltip.IconButton
                  tooltip={t('Opens the collection page in your webbrowser')}
                  icon='open-in-browser'
                >
                  {t('View Collection')}
                </tooltip.IconButton>
              </FlexLayout.Fixed>
            </FlexLayout>
          </Media.Body>
        </Media>
      </Panel>
    );
  }
}

export default CollectionOverview;
