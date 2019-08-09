import { types, util } from 'vortex-api';

function findModByRef(reference: types.IModReference,
                      mods: { [modId: string]: types.IMod }): types.IMod {
  return Object.values(mods).find((mod: types.IMod): boolean =>
    util.testModReference(mod, reference));
}

export default findModByRef;
