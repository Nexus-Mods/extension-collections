import * as actions from '../actions/persistent';

import { ICollection } from '@nexusmods/nexus-api';
import * as _ from 'lodash';
import { types, util } from 'vortex-api';

const persistentReducer: types.IReducerSpec = {
  reducers: {
    [actions.updateCollectionInfo as any]: (state, payload) => {
      const { collectionId, collectionInfo } = payload;

      return util.setSafe(state, ['collections', collectionId], collectionInfo);
    },
    [actions.updateRevisionInfo as any]: (state, payload) => {
      const { revisionId, revisionInfo } = payload;

      return util.setSafe(state, ['revisions', revisionId], revisionInfo);
    },
    [actions.updateSuccessRate as any]: (state, payload) => {
      const { revisionId, success } = payload;

      const revPath = ['revisions', revisionId];

      // we update the success_rate inside the revision info as well, so it gets updated
      // immediately, not just after it got fetched the next time.
      const successRate = JSON.parse(JSON.stringify(
        util.getSafe(state, [...revPath, 'info', 'success_rate'], { positive: 0, negative: 0 })));
      const oldSuccess = util.getSafe(state, [...revPath, 'success'], undefined);
      if (oldSuccess !== undefined) {
        // this isn't the first time we send a rating so subtract our previous rating
        --successRate[oldSuccess ? 'positive' : 'negative'];
      }
      ++successRate[success ? 'positive' : 'negative'];

      state = util.setSafe(state, [...revPath, 'info', 'success_rate'], successRate);

      return util.setSafe(state, [...revPath, 'success'], success);
    },
  },
  defaults: {
    collections: {},
    revisions: {},
  },
};

export default persistentReducer;
