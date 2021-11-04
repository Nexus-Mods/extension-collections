import { RatingOptions } from '@nexusmods/nexus-api';
import I18next from 'i18next';
import * as React from 'react';
import { FlexLayout, Icon, tooltip } from 'vortex-api';

export interface IHealthIndicatorProps {
  t: I18next.TFunction;
  value: { average: number, total: number };
  ownSuccess: RatingOptions;
  revisionNumber: number;
  onVoteSuccess: (success: boolean) => void;
}

function HealthIndicator(props: IHealthIndicatorProps) {
  const { t, onVoteSuccess, ownSuccess, revisionNumber, value } = props;
  if (value === undefined) {
    return null;
  }

  const voteSuccess = React.useCallback((evt: React.MouseEvent<any>) => {
    const { success } = evt.currentTarget.dataset;
    onVoteSuccess(success === 'true');
  }, []);

  return (
    <FlexLayout type='row' className='collection-health-indicator'>
      <div>
        <Icon name='revision' />
        {t('Revision {{number}}', { replace: { number: revisionNumber } })}
      </div>
      <div>
        <Icon name='health' />
        {value.average}%
      </div>
      <div>
        <tooltip.IconButton
          className={ownSuccess === 'positive' ? 'voted' : undefined}
          icon='vote-up'
          tooltip={t('Collection worked (mostly)')}
          data-success={true}
          onClick={voteSuccess}
        />
        &nbsp;
        <tooltip.IconButton
          className={ownSuccess === 'negative' ? 'voted' : undefined}
          icon='vote-down'
          tooltip={t('Collection didn\'t work (in a significant way)')}
          data-success={false}
          onClick={voteSuccess}
        />
      </div>
    </FlexLayout>
  );
}

export default HealthIndicator;
