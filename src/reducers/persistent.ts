import * as actions from '../actions/persistent';

import * as _ from 'lodash';
import { types, util } from 'vortex-api';

const persistentReducer: types.IReducerSpec = {
  reducers: {
    [actions.setCollectionInfo as any]: (state, payload) => {
      const { collectionId, collectionInfo } = payload;
      state = util.setSafe(state, [collectionId, 'timestamp'], Date.now());
      state = util.setSafe(state, [collectionId, 'info'], collectionInfo);
      if (state[collectionId].revisions === undefined) {
        state = util.setSafe(state, [collectionId, 'revisions'], {});
      }
      return state;
    },
    [actions.setRevisionInfo as any]: (state, payload) => {
      const { collectionId, revisionId, revisionInfo } = payload;

      if (state[collectionId] === undefined) {
        state = util.setSafe(state, [collectionId, 'timestamp'], 0);
        state = util.setSafe(state, [collectionId, 'info'], undefined);
      }
      const revPath = [collectionId, 'revisions', revisionId];

      state = util.setSafe(state, [...revPath, 'timestamp'], Date.now());

      return util.setSafe(state, [...revPath, 'info'], _.omit(revisionInfo, ['collection']));
    },
    [actions.updateSuccessRate as any]: (state, payload) => {
      const { collectionId, revisionId, success } = payload;

      const revPath = [collectionId, 'revisions', revisionId];

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
  },
};

export default persistentReducer;
