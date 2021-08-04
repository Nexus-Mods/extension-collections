import i18next from 'i18next';
import * as React from 'react';
import { Button } from 'react-bootstrap';
import { FlexLayout, Icon, util } from 'vortex-api';
import { NEXUS_MEMBERSHIP_URL } from '../../constants';

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
