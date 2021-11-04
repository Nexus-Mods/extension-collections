import * as actions from '../actions/persistent';

import { RatingOptions } from '@nexusmods/nexus-api';
import * as _ from 'lodash';
import { types, util } from 'vortex-api';

const persistentReducer: types.IReducerSpec = {
  reducers: {
    [actions.updateCollectionInfo as any]: (state, payload) => {
      const { collectionId, collectionInfo, timestamp } = payload;

      return util.setSafe(state, ['collections', collectionId],
                          { timestamp, info: collectionInfo });
    },
    [actions.updateRevisionInfo as any]: (state, payload) => {
      const { revisionId, revisionInfo, timestamp } = payload;

      return util.setSafe(state, ['revisions', revisionId],
                          { timestamp, info: revisionInfo });
    },
    [actions.updateSuccessRate as any]: (state, payload) => {
      const { revisionId, vote } = payload;

      const revPath = ['revisions', revisionId, 'info'];

      const oldOwnRating =
        util.getSafe<RatingOptions>(state, [...revPath, 'metadata', 'ratingValue'], 'abstained');
      const rating = util.getSafe(state, [...revPath, 'rating'],
        { average: 0.0, total: 0 });
      let numSuccess = (rating.average / 100) * rating.total;
      if (oldOwnRating === 'positive') {
        --numSuccess;
      }
      let total = rating.total;
      if (oldOwnRating === 'abstained') {
        ++total;
      }
      if (vote === 'positive') {
        ++numSuccess;
      }

      state = util.setSafe(state, [...revPath, 'metadata', 'ratingValue'], vote);
      return util.setSafe(state, [...revPath, 'rating'], {
        average: Math.floor((numSuccess * 100) / total),
        total,
      });
    },
  },
  defaults: {
    collections: {},
    revisions: {},
  },
};

export default persistentReducer;
