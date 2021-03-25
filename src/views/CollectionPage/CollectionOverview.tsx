import CollectionThumbnail from './CollectionThumbnail';

import HealthIndicator from '../HealthIndicator';

import { IRevision } from '@nexusmods/nexus-api';
import i18next from 'i18next';
import * as _ from 'lodash';
import * as React from 'react';
import { Image, Media, Panel } from 'react-bootstrap';
import { ComponentEx, FlexLayout, tooltip, types, util } from 'vortex-api';
import { AUTHOR_UNKNOWN, NEXUS_BASE_URL } from '../../constants';

interface ICollectionOverviewProps {
  t: i18next.TFunction;
  language: string;
  gameId: string;
  collection: types.IMod;
  totalSize: number;
  revision: IRevision;
  votedSuccess: boolean;
  onClose: () => void;
  onVoteSuccess: (collectionId: string, success: boolean) => void;
}

class CollectionOverview extends ComponentEx<ICollectionOverviewProps, {}> {
  public render(): JSX.Element {
    const { t, collection, gameId, revision, totalSize, votedSuccess } = this.props;

    const depRules = (collection.rules || [])
      .filter(rule => ['requires', 'recommends'].includes(rule.type));

    return (
      <Panel className='collection-overview'>
        <Media>
          <Media.Left>
            <CollectionThumbnail
              t={t}
              imageTime={Date.now()}
              collection={collection}
              gameId={gameId}
              details={false}
            />
          </Media.Left>
          <Media.Body>
            <FlexLayout type='column'>
              <FlexLayout.Fixed>
                <div className='collection-title'>
                  {util.renderModName(collection)}
                </div>
              </FlexLayout.Fixed>
              <FlexLayout.Fixed>
                    {/*
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
                    <div className='title'>{t('Version')}</div>
                    <div>{collection.attributes.version || '0.0.0'}</div>
                  </FlexLayout.Fixed>
                  <FlexLayout.Fixed className='collection-detail-cell'>
                    <div className='title'>{t('File size')}</div>
                    <div>{util.bytesToString(totalSize)}</div>
                  </FlexLayout.Fixed>
                </FlexLayout>
                      */}
              </FlexLayout.Fixed>
              <FlexLayout.Flex>
                <div className='collection-description'>
                  {util.getSafe(collection.attributes, ['description'], t('No description'))}
                </div>
              </FlexLayout.Flex>
              <FlexLayout.Fixed className='collection-page-detail-bar'>
                <FlexLayout type='row'>
                  <FlexLayout.Fixed className='collection-detail-cell'>
                    <div className='title'>{t('Uploaded')}</div>
                    <div>{this.renderTime(collection.attributes.uploadedTimestamp)}</div>
                  </FlexLayout.Fixed>
                  <FlexLayout.Fixed className='collection-detail-cell'>
                    <div className='title'>{t('Last updated')}</div>
                    <div>{this.renderTime(collection.attributes.updatedTimestamp)}</div>
                  </FlexLayout.Fixed>
                  <FlexLayout.Fixed className='collection-detail-cell'>
                    <div className='title'>{t('Mods')}</div>
                    <div>{depRules.length}</div>
                  </FlexLayout.Fixed>
                  <FlexLayout.Flex>
                    <div />
                  </FlexLayout.Flex>
                  <FlexLayout.Fixed>
                    {(revision?.revisionStatus !== 'is_private') ? (
                      <HealthIndicator
                        t={t}
                        revisionNumber={revision?.revision ?? 0}
                        value={revision !== undefined
                          ? _.pick(revision, ['rating', 'votes'])
                          : undefined}
                        onVoteSuccess={this.voteSuccess}
                        ownSuccess={votedSuccess}
                      />
                    ) : null}
                  </FlexLayout.Fixed>
                  <FlexLayout.Fixed>
                    <tooltip.IconButton
                      tooltip={t('Opens the collection page in your webbrowser')}
                      icon='open-in-browser'
                      onClick={this.openUrl}
                    >
                      {t('View')}
                    </tooltip.IconButton>
                  </FlexLayout.Fixed>
                </FlexLayout>
              </FlexLayout.Fixed>
            </FlexLayout>
          </Media.Body>
        </Media>
      </Panel>
    );
  }

  private openUrl = () => {
    const { collection, revision } = this.props;
    util.opn(`${NEXUS_BASE_URL}/${revision.collection.game.domainName}/collections/${revision.collection.id}`)
  }

  private renderTime(timestamp: number): string {
    const { t, language } = this.props;
    if (timestamp === undefined) {
      return t('Never');
    }
    return (new Date(timestamp)).toLocaleDateString(language);
  }

  private voteSuccess = (success: boolean) => {
    const { collection, onVoteSuccess } = this.props;
    onVoteSuccess(collection.id, success);
  }
}

export default CollectionOverview;
