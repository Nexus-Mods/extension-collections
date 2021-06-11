import i18next from 'i18next';
import * as React from 'react';
import { Button } from 'react-bootstrap';
import { FlexLayout, Icon, util } from 'vortex-api';
import { NEXUS_DOMAIN } from '../../constants';

const ONE_MB = 1024 * 1024;
const NEXUS_MEMBERSHIP_URL = `https://users.${NEXUS_DOMAIN}/register/memberships`;

function renderTime(input: number): string {
  const hours = util.pad(Math.floor(input / 3600), '0', 2);
  const minutes = util.pad(Math.floor((input % 3600) / 60), '0', 2);
  const seconds = util.pad(Math.floor(input % 60), '0', 2);

  return `${hours}:${minutes}:${seconds}`;
}

export interface ICollectionBannerProps {
  totalSize: number;
  t: i18next.TFunction;
}

class CollectionBanner extends React.Component<ICollectionBannerProps, {}> {
  public render(): JSX.Element {
    const { t } = this.props;

    return (
      <div className='collection-premium-banner'>
        <FlexLayout type='row'>
          <FlexLayout.Fixed>
            <Icon name='download-speed' />
          </FlexLayout.Fixed>
          <FlexLayout.Flex>
            <span className='collection-premium-highlight'>{t('Go Premium')} - </span>
            <span>{t('Uncapped Download Speeds + More')}</span>
          </FlexLayout.Flex>
          <FlexLayout.Fixed>
            <Button onClick={this.goGetPremium}>
              {t('Go Premium')}
            </Button>
          </FlexLayout.Fixed>
        </FlexLayout>
      </div>
    );
  }

  private goGetPremium = () => {
    util.opn(NEXUS_MEMBERSHIP_URL).catch(err => undefined);
  }
}

export default CollectionBanner;
