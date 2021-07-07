import { ICollectionRevisionMod } from '@nexusmods/nexus-api';
import * as React from 'react';
import { Panel } from 'react-bootstrap';
import { FlexLayout, Image, types, util } from 'vortex-api';
import { AUTHOR_UNKNOWN } from '../../constants';
import { IModEx } from '../../types/IModEx';

export interface ICollectionModDetails {
  t: types.TFunction;
  local?: IModEx;
  remote?: ICollectionRevisionMod;
}

function CollectionModDetails(props: ICollectionModDetails) {
  const { t, local, remote } = props;

  const uploaderName = local?.attributes?.uploader
                    ?? remote?.file?.owner?.name
                    ?? AUTHOR_UNKNOWN;
  const uploaderAvatar = remote?.file?.owner?.avatar
                      ?? 'assets/images/noavatar.png';
  const authorName = local?.attributes?.author
                  ?? remote?.file?.mod?.author
                  ?? AUTHOR_UNKNOWN;
  const modTitle = util.renderModName(local)
                ?? remote?.file?.mod?.name
                ?? '';
  const version = local?.attributes?.version
               ?? remote?.file?.version
               ?? '???';
  const description = local?.attributes?.shortDescription
                   ?? remote?.file?.mod?.summary
                   ?? '';
  const image = local?.attributes?.pictureUrl
             ?? remote?.file?.mod?.pictureUrl;

  return (
    <Panel className='installing-mod-overview'>
      <FlexLayout type='row'>
        <FlexLayout.Flex fill>
          <FlexLayout type='column'>
            <FlexLayout.Fixed>
              <div className='installing-mod-title'>
                {modTitle}
              </div>
            </FlexLayout.Fixed>
            <FlexLayout.Fixed>
              <FlexLayout type='row'>
                <FlexLayout.Fixed className='collection-detail-cell'>
                  <FlexLayout type='row'>
                    <Image
                      srcs={[uploaderAvatar]}
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
                  <div>{version}</div>
                </FlexLayout.Fixed>
              </FlexLayout>
            </FlexLayout.Fixed>
            <FlexLayout.Flex>
              <div className='collection-description'>
                {description}
              </div>
            </FlexLayout.Flex>
          </FlexLayout>
        </FlexLayout.Flex>
        <FlexLayout.Fixed className='collection-mod-detail-imagecontainer'>
          {(image)
            ? <Image
              className='installing-mod-image'
              srcs={[image]}
            />
            : null}
        </FlexLayout.Fixed>
      </FlexLayout>
    </Panel>
  );
}

export default CollectionModDetails;
