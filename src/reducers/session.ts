import { types, util } from 'vortex-api';

import * as actions from '../actions/session';

const sessionReducer: types.IReducerSpec = {
  reducers: {
    [actions.startEditModPack as any]: (state, payload) => {
      const { modId } = payload;
      return util.setSafe(state, ['modId'], modId);
    },
  },
  defaults: {
      modId: undefined,
  },
};

export default sessionReducer;
