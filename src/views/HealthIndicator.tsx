import I18next from 'i18next';
import * as React from 'react';
import { Icon, tooltip } from 'vortex-api';

export interface IHealthIndicatorProps {
  t: I18next.TFunction;
  value: { rating: number, votes: number };
  ownSuccess: boolean;
  onVoteSuccess: (success: boolean) => void;
}

function HealthIndicator(props: IHealthIndicatorProps) {
  const { t, onVoteSuccess, ownSuccess, value } = props;
  if (value === undefined) {
    return null;
  }

  const voteSuccess = React.useCallback((evt: React.MouseEvent<any>) => {
    const { success } = evt.currentTarget.dataset;
    onVoteSuccess(success === 'true');
  }, []);

  return (
    <div className='collection-health-indicator'>
      <Icon name='health' />
      {`${value.rating}%`}
      <tooltip.IconButton
        className={ownSuccess === true ? 'voted' : undefined}
        icon='endorse-yes'
        tooltip={t('Collection worked (mostly)')}
        data-success={true}
        onClick={voteSuccess}
      />
      <tooltip.IconButton
        className={ownSuccess === false ? 'voted' : undefined}
        icon='endorse-no'
        tooltip={t('Collection didn\'t work (in a significant way)')}
        data-success={false}
        onClick={voteSuccess}
      />
    </div>
  );
}

export default HealthIndicator;
