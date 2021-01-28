import i18next from 'i18next';
import * as React from 'react';
import { Table } from 'react-bootstrap';
import { util } from 'vortex-api';
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
    const { t, totalSize } = this.props;

    return (
      <div className='collection-premium-banner'>
        <div className='collection-table-container'>
          <Table>
            <thead>
              <tr><th><a onClick={this.goGetPremium}>Premium</a></th><th>Free</th></tr>
            </thead>
            <tbody>
              <tr><td>{t('No limit')}</td><td>{t('1MB/s')}</td></tr>
              <tr>
                <td>
                  <div>{t('Estimated download')}</div>
                  <div className='collection-estimate'>
                    {renderTime(totalSize / (10 * ONE_MB))} @ 10 MB/s
                  </div>
                </td>
                <td>
                  <div>{t('Estimated download')}</div>
                  <div className='collection-estimate'>
                    {renderTime(totalSize / ONE_MB)}
                  </div>
                </td>
              </tr>
            </tbody>
          </Table>
        </div>
      </div>
    );
  }

  private goGetPremium = () => {
    util.opn(NEXUS_MEMBERSHIP_URL).catch(err => undefined);
  }
}

export default CollectionBanner;
