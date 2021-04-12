import { ICollectionRevisionMod } from '@nexusmods/nexus-api';
import i18next from 'i18next';
import * as React from 'react';
import { Image, Media, Panel } from 'react-bootstrap';
import { ComponentEx, FlexLayout, tooltip, types, util } from 'vortex-api';
import { AUTHOR_UNKNOWN } from '../../constants';
import InstallDriver from '../../util/InstallDriver';
import CollectionThumbnail from './CollectionThumbnail';

interface ICollectionOverviewInstallingProps {
  t: i18next.TFunction;
  gameId: string;
  driver: InstallDriver;
}

class CollectionOverviewInstalling
    extends ComponentEx<ICollectionOverviewInstallingProps, { displayModIdx: number }> {
  constructor(props: ICollectionOverviewInstallingProps) {
    super(props);

    this.initState({
      displayModIdx: 0,
    });
  }

  public render(): JSX.Element {
    const { t, driver } = this.props;
    const { displayModIdx } = this.state;

    const displayMod: ICollectionRevisionMod = driver.revisionInfo?.modFiles?.[displayModIdx];
    const modCount = driver.revisionInfo?.modFiles?.length;

    const uploaderName = displayMod?.['mod']?.uploader?.name || AUTHOR_UNKNOWN;
    const authorName = displayMod?.['mod']?.author?.name || AUTHOR_UNKNOWN;

    return (
      <Panel className='installing-mod-overview'>
        <FlexLayout type='row'>
          <FlexLayout.Flex>
            <FlexLayout type='column'>
              <FlexLayout.Fixed>
                <div className='installing-mod-title'>
                  {displayMod?.file?.mod?.name ?? ''}
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
                        <div>{uploaderName}</div>
                      </div>
                    </FlexLayout>
                  </FlexLayout.Fixed>
                  <FlexLayout.Fixed className='collection-detail-cell'>
                    <div className='title'>{t('Created by')}</div>
                    <div>{authorName}</div>
                  </FlexLayout.Fixed>
                  <FlexLayout.Fixed className='collection-detail-cell'>
                    <div className='title'>{t('Version')}</div>
                    <div>{displayMod?.file?.version || '???'}</div>
                  </FlexLayout.Fixed>
                </FlexLayout>
              </FlexLayout.Fixed>
              <FlexLayout.Flex>
                <div className='collection-description'>
                  {displayMod?.file?.mod?.summary ?? ''}
                </div>
              </FlexLayout.Flex>
            </FlexLayout>
          </FlexLayout.Flex>
          <FlexLayout.Flex>
            <FlexLayout type='column' className='collection-installing-image-pane'>
              <FlexLayout.Flex>
                {(displayMod?.file?.mod?.pictureUrl !== undefined)
                  ? <Image
                      className='installing-mod-image'
                      src={displayMod?.file?.mod?.pictureUrl}
                    />
                  : null}
              </FlexLayout.Flex>
              <FlexLayout.Fixed>
                <tooltip.IconButton
                  icon='collection-first'
                  tooltip={t('Show first mod')}
                  disabled={displayModIdx === 0}
                  onClick={this.first}
                />
                <tooltip.IconButton
                  icon='collection-previous'
                  tooltip={t('Show previous mod')}
                  disabled={displayModIdx === 0}
                  onClick={this.prev}
                />
                {t('{{pos}} of {{count}}',
                   { replace: { pos: displayModIdx + 1, count: modCount } })}
                <tooltip.IconButton
                  icon='collection-next'
                  tooltip={t('Show next mod')}
                  disabled={displayModIdx === modCount - 1}
                  onClick={this.next}
                />
                <tooltip.IconButton
                  icon='collection-last'
                  tooltip={t('Show last mod')}
                  disabled={displayModIdx === modCount - 1}
                  onClick={this.last}
                />
              </FlexLayout.Fixed>
            </FlexLayout>
          </FlexLayout.Flex>
        </FlexLayout>
      </Panel>
    );
  }

  private first = () => {
    this.nextState.displayModIdx = 0;
  }

  private last = () => {
    const { driver } = this.props;
    this.nextState.displayModIdx = driver.revisionInfo.modFiles.length - 1;
  }

  private prev = () => {
    --this.nextState.displayModIdx;
  }

  private next = () => {
    ++this.nextState.displayModIdx;
  }
}

export default CollectionOverviewInstalling;
