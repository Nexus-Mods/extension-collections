import { types, util } from 'vortex-api';

import * as actions from '../actions/persistent';

const persistentReducer: types.IReducerSpec = {
  reducers: {
    [actions.setModPackInfo as any]: (state, payload) => {
      const { profileId, key, value } = payload;
      return util.setSafe(state, [profileId, 'info', key], value);
    },
  },
  defaults: {
  },
};

export default persistentReducer;
