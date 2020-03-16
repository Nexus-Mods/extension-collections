import CollectionThumbnail from './CollectionThumbnail';
import { AUTHOR_UNKNOWN } from '../../constants';

import InstallDriver from '../../util/InstallDriver';

import i18next from 'i18next';
import * as React from 'react';
import { Image, Media, Panel } from 'react-bootstrap';
import { ComponentEx, FlexLayout, tooltip, types, util } from 'vortex-api';

interface ICollectionOverviewInstallingProps {
  t: i18next.TFunction;
  gameId: string;
  driver: InstallDriver;
}

class CollectionOverviewInstalling extends ComponentEx<ICollectionOverviewInstallingProps, { displayModIdx: number }> {
  constructor(props: ICollectionOverviewInstallingProps) {
    super(props);

    this.initState({
      displayModIdx: 0,
    });
  }

  public render(): JSX.Element {
    const { t, driver, gameId } = this.props;
    const { displayModIdx } = this.state;

    const displayMod = driver.revisionInfo.collection_revision_mods[displayModIdx];
    const modCount = driver.revisionInfo.collection_revision_mods.length;

    return (
      <Panel className='installing-mod-overview'>
        <Media>
          <Media.Body>
            <FlexLayout type='column'>
              <FlexLayout.Fixed>
                <div className='installing-mod-title'>
                  {displayMod.mod.name}
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
                        <div className='title'>{t('Uploaded by')}</div>
                        <div>{util.getSafe(displayMod, ['mod', 'uploaded_by', 'name'], undefined) || AUTHOR_UNKNOWN}</div>
                      </div>
                    </FlexLayout>
                  </FlexLayout.Fixed>
                  <FlexLayout.Fixed className='collection-detail-cell'>
                    <div className='title'>{t('Created by')}</div>
                    <div>{util.getSafe(displayMod, ['mod', 'author', 'name'], undefined) || AUTHOR_UNKNOWN}</div>
                  </FlexLayout.Fixed>
                  <FlexLayout.Fixed className='collection-detail-cell'>
                    <div className='title'>{t('Version')}</div>
                    <div>{displayMod.mod_file.version}</div>
                  </FlexLayout.Fixed>
                </FlexLayout>
              </FlexLayout.Fixed>
              <FlexLayout.Flex>
                <div className='collection-description'>
                  {displayMod.mod.summary}
                </div>
              </FlexLayout.Flex>
            </FlexLayout>
          </Media.Body>
          <Media.Right>
            <FlexLayout type='column'>
              <FlexLayout.Flex style={{ maxWidth: '100%' }}>
                <Image className='installing-mod-image' src={displayMod.mod.picture_url} />
              </FlexLayout.Flex>
              <FlexLayout.Fixed>
                <tooltip.IconButton icon='showhide-left' tooltip={t('Show first mod')} disabled={displayModIdx === 0} onClick={this.first} />
                <tooltip.IconButton icon='nav-back' tooltip={t('Show previous mod')} disabled={displayModIdx === 0} onClick={this.prev} />
                {t('{{pos}} of {{count}}', { replace: { pos: displayModIdx + 1, count: modCount } })}
                <tooltip.IconButton icon='nav-forward' tooltip={t('Show next mod')} disabled={displayModIdx === modCount - 1} onClick={this.next}/>
                <tooltip.IconButton icon='showhide-right' tooltip={t('Show last mod')} disabled={displayModIdx === modCount - 1} onClick={this.last}/>
              </FlexLayout.Fixed>
            </FlexLayout>
          </Media.Right>
        </Media>
      </Panel>
    );
  }

  private first = () => {
    this.nextState.displayModIdx = 0;
  }

  private last = () => {
    const { driver } = this.props;
    this.nextState.displayModIdx = driver.revisionInfo.collection_revision_mods.length - 1;
  }

  private prev = () => {
    --this.nextState.displayModIdx;
  }

  private next = () => {
    ++this.nextState.displayModIdx;
  }
}

export default CollectionOverviewInstalling;
