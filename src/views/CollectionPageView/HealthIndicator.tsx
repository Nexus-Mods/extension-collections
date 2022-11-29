import { RatingOptions } from '@nexusmods/nexus-api';
import I18next from 'i18next';
import * as React from 'react';
import { FlexLayout, Icon, RadialProgress, tooltip, MainContext } from 'vortex-api';

export interface IHealthIndicatorProps {
  t: I18next.TFunction;
  value: { average: number, total: number };
  ownSuccess: RatingOptions;
  revisionNumber: number;
  onVoteSuccess: (success: boolean) => void;
  voteAllowed: boolean;
}

function HealthIndicator(props: IHealthIndicatorProps) {
  const context = React.useContext(MainContext);
  const { t, onVoteSuccess, ownSuccess, revisionNumber, value, voteAllowed } = props;
  const voteSuccess = React.useCallback((evt: React.MouseEvent<any>) => {
    const { success } = evt.currentTarget.dataset;
    const isUpvote = success === 'true'
    onVoteSuccess(isUpvote);
    context.api.events.emit(
      'analytics-track-click-event',
      'Collections',
      isUpvote ? 'Upvote Collection' : 'Downvote Collection'
    );
  }, []);

  if (value === undefined) {
    return null;
  }

  const RadialProgressT: any = RadialProgress;

  const rating = value.average;
  let cssClass = 'success-rating-good';
  if (rating === undefined) {
    cssClass = 'success-rating-insufficient';
  } else if (rating < 50) {
    cssClass = 'success-rating-bad';
  } else if (rating < 75) {
    cssClass = 'success-rating-dubious';
  }

  return (
    <FlexLayout type='column' className='collection-health-indicator'>
      <div className='collection-health-header'>
        <Icon name='revision' />
        {t('Revision {{number}}', { replace: { number: revisionNumber } })}
      </div>
      <FlexLayout type='row' className='collection-health-body'>
        <FlexLayout.Fixed className='collection-revition-rating-parent'>
          <div className='collection-revision-rating-container'>
            <RadialProgressT
              data={[
                { class: cssClass, min: 0, max: 100, value: value.average },
              ]}
              totalRadius={32}
              innerGap={10}
              restOverlap={false}
            />
            <div className='centered-overlay'>
              {value.average}%
            </div>
          </div>
          <div className='collection-revision-rating-numvotes'>
            {t('{{numVotes}} votes', { replace: { numVotes: value.total } })}
          </div>
        </FlexLayout.Fixed>
        <FlexLayout.Flex>
          <FlexLayout type='column'>
            <FlexLayout.Fixed className='collection-health-rating-text'>
              {t('Did this collection work successfully?')}
            </FlexLayout.Fixed>
            <FlexLayout.Fixed>
              <FlexLayout type='row' className='collection-voting-pill'>
                <FlexLayout.Fixed>
                  <tooltip.Button
                    bsStyle='ghost'
                    className={ownSuccess === 'positive' ? 'voted' : undefined}
                    tooltip={voteAllowed
                      ? t('Collection worked (mostly)')
                      : t('You must wait for 12 hours between downloading a collection revision and rating it')}
                    data-success={true}
                    onClick={voteSuccess}
                    disabled={!voteAllowed}
                  >
                    {t('Yes')}
                  </tooltip.Button>
                </FlexLayout.Fixed>
                <FlexLayout.Fixed>
                  <tooltip.Button
                    bsStyle='ghost'
                    className={ownSuccess === 'negative' ? 'voted' : undefined}
                    tooltip={voteAllowed
                      ? t('Collection didn\'t work (in a significant way)')
                      : t('You must wait for 12 hours between downloading a collection revision and rating it')}
                    data-success={false}
                    onClick={voteSuccess}
                    disabled={!voteAllowed}
                  >
                    {t('No')}
                  </tooltip.Button>
                </FlexLayout.Fixed>
              </FlexLayout>
            </FlexLayout.Fixed>
          </FlexLayout>
        </FlexLayout.Flex>
      </FlexLayout>
    </FlexLayout>
  );
}

export default HealthIndicator;
