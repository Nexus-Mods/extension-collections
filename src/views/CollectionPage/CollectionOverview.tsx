import CollectionThumbnail from './CollectionThumbnail';
import CollectionModDetails from './CollectionModDetails';
import SlideshowControls from './SlideshowControls';

import HealthIndicator from '../HealthIndicator';

import { ICollectionRevisionMod, IRevision } from '@nexusmods/nexus-api';
import i18next from 'i18next';
import * as _ from 'lodash';
import * as React from 'react';
import { Media, Panel } from 'react-bootstrap';
import { ComponentEx, FlexLayout, Spinner, tooltip, types, util } from 'vortex-api';
import { NEXUS_BASE_URL } from '../../constants';
import CollectionReleaseStatus from './CollectionReleaseStatus';
import { IModEx } from '../../types/IModEx';

interface ICollectionOverviewProps {
  t: i18next.TFunction;
  language: string;
  gameId: string;
  collection: types.IMod;
  totalSize: number;
  revision: IRevision;
  votedSuccess: boolean;
  incomplete: boolean;
  modSelection: Array<{ local: IModEx, remote: ICollectionRevisionMod }>;
  onDeselectMods?: () => void;
  onClose?: () => void;
  onVoteSuccess?: (collectionId: string, success: boolean) => void;
}

class CollectionOverview extends ComponentEx<ICollectionOverviewProps, { selIdx: number }> {
  constructor(props: ICollectionOverviewProps) {
    super(props);

    this.initState({ selIdx: 0 });
  }

  public render(): JSX.Element {
    const { t, collection, gameId, incomplete, modSelection, revision, votedSuccess } = this.props;

    const { selIdx } = this.state;

    const depRules = (collection.rules || [])
      .filter(rule => ['requires', 'recommends'].includes(rule.type));

    const published =
      (util.getSafe(collection.attributes, ['collectionId'], undefined) !== undefined);

    const modDetails = modSelection.length > 0;

    const classes = ['collection-overview'];
    if (modDetails) {
      classes.push('collection-mod-selection');
    }

    return (
      <Panel className={classes.join(' ')}>
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
                <div className='collection-overview-title'>
                  <div className='collection-title'>
                    {util.renderModName(collection)}
                  </div>
                  <CollectionReleaseStatus
                    t={t}
                    active={true}
                    collection={collection}
                    incomplete={incomplete}
                  />
                  <div className='flex-filler'></div>
                  {modSelection.length > 1 ? (
                    <>
                      <SlideshowControls
                        t={t}
                        numItems={modSelection.length}
                        onChangeItem={this.setSelection}
                        autoProgressTimeMS={5000}
                      />
                      <div className='flex-filler'></div>
                      <tooltip.IconButton
                        className='btn-embed'
                        tooltip={t('Deselects mods')}
                        icon='close'
                        onClick={this.props.onDeselectMods}
                      />
                    </>
                  ) : null}
                </div>
              </FlexLayout.Fixed>
              <FlexLayout.Flex className='collection-description-container'>
                <div className='collection-description'>
                  {util.getSafe(collection.attributes, ['description'], t('No description'))}
                </div>
              </FlexLayout.Flex>
              <FlexLayout.Flex>
                {
                  modDetails ? (
                    <CollectionModDetails
                      t={t}
                      local={modSelection[selIdx]?.local}
                      remote={modSelection[selIdx]?.remote}
                    />
                  ) : (
                    null
                  )
                }
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
                    {(published && (revision !== undefined)) ? (
                      <tooltip.IconButton
                        tooltip={t('Opens the collection page in your webbrowser')}
                        icon='open-in-browser'
                        onClick={this.openUrl}
                      >
                        {t('View')}
                      </tooltip.IconButton>
                    ) : null}
                  </FlexLayout.Fixed>
                </FlexLayout>
              </FlexLayout.Fixed>
            </FlexLayout>
          </Media.Body>
        </Media>
      </Panel>
    );
  }

  private setSelection = (idx: number) => {
    this.nextState.selIdx = idx % this.props.modSelection.length;
  }

  private openUrl = () => {
    const { revision } = this.props;
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
    onVoteSuccess?.(collection.id, success);
  }
}

export default CollectionOverview;
